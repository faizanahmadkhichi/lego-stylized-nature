import assert from 'node:assert/strict'
import test from 'node:test'
import TerrainMinimap from '../src/ui/TerrainMinimap.js'
import HeightField from '../src/world/terrain/HeightField.js'
import TerrainMap from '../src/world/terrain/TerrainMap.js'

function makeCanvas() {
  const calls = []
  const context = new Proxy({}, {
    get(target, property) {
      return target[property] ?? ((...args) => calls.push([property, ...args]))
    },
  })
  return {
    calls,
    width: 0,
    height: 0,
    clientWidth: 248,
    clientHeight: 180,
    getContext: () => context,
    ownerDocument: { createElement: () => makeCanvas() },
  }
}

function makeMap(width, depth, origin = { x: 0, z: 0 }, halo = 0) {
  return new TerrainMap({
    heightField: new HeightField(width, depth),
    origin,
    halo,
    biomeCells: Array.from({ length: depth }, () => Array.from({ length: width }, () => ({ biomeId: 'forest' }))),
    surfaceCells: Array.from({ length: depth }, () => Array.from({ length: width }, () => ({ height: 12 }))),
  })
}

function makeExperience(position) {
  return {
    world: {
      playerAircraft: { state: { position, yaw: 0 } },
      config: { terrain: { cellSize: 2, maxHeight: 32 }, chunks: { size: 4 } },
      terrainGenerator: { generate: () => assert.fail('The minimap must not generate terrain') },
    },
  }
}

test('minimap samples negative chunk coordinates with halo and world cell size', () => {
  const experience = makeExperience({ x: -3, z: -1 })
  const map = makeMap(6, 6, { x: -4, z: -4 }, 1)
  map.biomeCells[4][3].biomeId = 'wetland'
  experience.world.terrainChunkManager = { activeSlots: new Map([['-1,-1', { terrainMap: map }]]) }
  const minimap = new TerrainMinimap(makeCanvas(), experience)
  assert.equal(minimap.getCurrentBiomeId(), 'wetland')
  experience.world.playerAircraft.state.position.x = 0
  assert.equal(minimap.getCurrentBiomeId(), null, 'Halo samples must not extend the loaded world')
})

test('minimap supports a rectangular full map', () => {
  const experience = makeExperience({ x: 2, z: 12 })
  const map = makeMap(4, 8)
  map.biomeCells[6][1].biomeId = 'desert'
  experience.world.terrainMap = map
  const minimap = new TerrainMinimap(makeCanvas(), experience)
  assert.equal(minimap.getCurrentBiomeId(), 'desert')
  experience.world.playerAircraft.state.position.z = 16
  assert.equal(minimap.getCurrentBiomeId(), null)
})

test('minimap caches terrain between updates while drawing current heading', () => {
  const experience = makeExperience({ x: 4, z: 4 })
  experience.world.terrainMap = makeMap(16, 16)
  const canvas = makeCanvas()
  const minimap = new TerrainMinimap(canvas, experience)
  minimap.update()
  const mapDrawCount = minimap.mapCanvas.calls.length
  experience.world.playerAircraft.state.yaw = Math.PI / 2
  minimap.update()
  assert.equal(minimap.mapCanvas.calls.length, mapDrawCount)
  assert.deepEqual(canvas.calls.filter(call => call[0] === 'rotate').at(-1), ['rotate', Math.PI / 2])
  assert.ok(canvas.calls.some(call => call[0] === 'drawImage'))
  minimap.dispose()
  const canvasDrawCount = canvas.calls.length
  minimap.update()
  assert.equal(canvas.calls.length, canvasDrawCount)
})

test('minimap follows its displayed size when expanded and collapsed', () => {
  const canvas = makeCanvas()
  const minimap = new TerrainMinimap(canvas, makeExperience({ x: 0, z: 0 }))
  assert.equal(minimap.width, 248)
  assert.equal(minimap.height, 180)

  canvas.clientWidth = 598
  canvas.clientHeight = 420
  minimap.update()
  assert.equal(minimap.width, 598)
  assert.equal(minimap.height, 420)
  assert.equal(canvas.width, Math.round(598 * minimap.dpr))
  assert.equal(canvas.height, Math.round(420 * minimap.dpr))

  canvas.clientWidth = 174
  canvas.clientHeight = 140
  minimap.update()
  assert.equal(minimap.width, 174)
  assert.equal(minimap.height, 140)
  assert.equal(canvas.width, Math.round(174 * minimap.dpr))
  assert.equal(canvas.height, Math.round(140 * minimap.dpr))
  minimap.dispose()
})

function makeTargetExperience(position, targets) {
  const experience = makeExperience(position)
  experience.world.targets = { aliveTargets: targets }
  return experience
}

test('worldToMap centers the player and scales by worldPerPixel', () => {
  const minimap = new TerrainMinimap(makeCanvas(), makeExperience({ x: 0, z: 0 }))
  minimap.update()
  // span = max(32, 4 * 1.8) * 2 = 64 world units across 248 px.
  const worldPerPixel = 64 / 248
  assert.deepEqual(
    minimap.worldToMap(2, 0, { x: 0, z: 0 }),
    { x: 124 + 2 / worldPerPixel, y: 90 },
  )
  assert.deepEqual(
    minimap.worldToMap(0, -4, { x: 0, z: 0 }),
    { x: 124, y: 90 - 4 / worldPerPixel },
  )
})

test('a balloon in view is drawn as a circle at its map position', () => {
  const canvas = makeCanvas()
  const experience = makeTargetExperience({ x: 0, z: 0 }, [
    { type: 'balloon', position: { x: 2, z: 0 } },
  ])
  const minimap = new TerrainMinimap(canvas, experience)
  minimap.update()
  const worldPerPixel = 64 / 248
  const expectedX = 124 + 2 / worldPerPixel
  const arc = canvas.calls.find(call => call[0] === 'arc')
  assert.ok(arc, 'expected a circle marker for the balloon')
  assert.equal(arc[1], expectedX)
  assert.equal(arc[2], 90)
  assert.equal(arc[3], 4)
})

test('a drone in view is drawn as a diamond at its map position', () => {
  const canvas = makeCanvas()
  const experience = makeTargetExperience({ x: 0, z: 0 }, [
    { type: 'drone', position: { x: 0, z: 2 } },
  ])
  const minimap = new TerrainMinimap(canvas, experience)
  minimap.update()
  const worldPerPixel = 64 / 248
  const expectedY = 90 + 2 / worldPerPixel
  // Diamond tip above the center; the plane arrow uses moveTo(8, 0) instead.
  assert.ok(canvas.calls.some(call => call[0] === 'moveTo'
    && call[1] === 124 && call[2] === expectedY - 5))
  assert.ok(canvas.calls.some(call => call[0] === 'lineTo'
    && call[1] === 129 && call[2] === expectedY))
})

test('a target off the map is drawn as an edge arrow pointing at it', () => {
  const canvas = makeCanvas()
  const experience = makeTargetExperience({ x: 0, z: 0 }, [
    { type: 'drone', position: { x: 30, z: 30 } },
  ])
  const minimap = new TerrainMinimap(canvas, experience)
  minimap.update()
  // Clamped to the bottom-right corner inset (248-10, 180-10); the arrow
  // points diagonally down-right, i.e. rotate(PI/4). The plane arrow (yaw 0)
  // rotates by 0, so PI/4 is unique to the target arrow.
  assert.ok(canvas.calls.some(call => call[0] === 'translate'
    && call[1] === 238 && call[2] === 170))
  assert.ok(canvas.calls.some(call => call[0] === 'rotate'
    && call[1] === Math.PI / 4))
})

test('no targets means no target markers', () => {
  const canvas = makeCanvas()
  const minimap = new TerrainMinimap(canvas, makeExperience({ x: 0, z: 0 }))
  minimap.update()
  assert.equal(canvas.calls.filter(call => call[0] === 'arc').length, 0)
  // Only the plane arrow rotates (yaw 0 here).
  const rotates = canvas.calls.filter(call => call[0] === 'rotate')
  assert.deepEqual(rotates, [['rotate', 0]])
})
