import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import Targets, { mulberry32, normalizeTargetsConfig } from '../src/systems/Targets.js'

function createExperience(overrides = {}) {
  const time = {
    elapsed: 0,
    delta: 1 / 60,
    getElapsed() {
      return this.elapsed
    },
    getDelta() {
      return this.delta
    },
  }
  const experience = {
    config: { seed: 123, targets: {} },
    time,
    world: {
      playerAircraft: {
        state: { position: new THREE.Vector3(0, 5.5, 0) },
      },
    },
    _time: time,
  }
  Object.assign(experience, overrides)
  return experience
}

test('spawns the configured drones and balloons, all alive', () => {
  const targets = new Targets(createExperience(), { config: { drones: 3, balloons: 2 } })
  assert.equal(targets.targets.length, 5)
  assert.equal(targets.aliveCount, 5)
  assert.equal(targets.targets.filter(t => t.type === 'drone').length, 3)
  assert.equal(targets.targets.filter(t => t.type === 'balloon').length, 2)
  for (const target of targets.targets) {
    assert.equal(target.alive, true)
    assert.equal(target.hp, target.maxHp)
  }
})

test('targets move along their paths as time advances', () => {
  const experience = createExperience()
  const targets = new Targets(experience, { config: { drones: 2, balloons: 1 } })
  const before = targets.targets.map(t => t.position.clone())
  experience._time.elapsed = 2
  experience._time.delta = 2
  targets.update()
  for (let i = 0; i < targets.targets.length; i++) {
    assert.notDeepEqual(targets.targets[i].position.toArray(), before[i].toArray())
  }
})

test('damage reduces HP and destroys at zero, then respawns near the player', () => {
  const experience = createExperience()
  const targets = new Targets(experience, {
    config: { drones: 1, balloons: 0, droneHp: 2, respawnDelay: 1 },
  })
  const drone = targets.targets[0]

  assert.equal(targets.damage(drone, 1), 'hit')
  assert.equal(drone.alive, true)
  assert.equal(drone.hp, 1)

  assert.equal(targets.damage(drone, 1), 'destroyed')
  assert.equal(drone.alive, false)
  assert.equal(targets.aliveCount, 0)

  // Damage on a dead target is a no-op.
  assert.equal(targets.damage(drone, 1), null)

  // Respawn after the delay, near the player.
  experience._time.delta = 1.1
  targets.update()
  assert.equal(drone.alive, true)
  assert.equal(drone.hp, 2)
  assert.equal(targets.aliveCount, 1)
  const distance = Math.hypot(
    drone.center.x - 0,
    drone.center.z - 0,
  )
  assert.ok(distance >= 20 && distance <= 70)
})

test('mulberry32 is deterministic per seed', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  const c = mulberry32(43)
  const firstA = [a(), a(), a()]
  const firstB = [b(), b(), b()]
  const firstC = [c(), c(), c()]
  assert.deepEqual(firstA, firstB)
  assert.notDeepEqual(firstA, firstC)
})

test('normalizeTargetsConfig applies defaults and clamps', () => {
  assert.deepEqual(normalizeTargetsConfig(), {
    enabled: true,
    drones: 8,
    balloons: 6,
    spawnRadiusMin: 20,
    spawnRadiusMax: 70,
    height: 5.5,
    heightVariance: 2,
    droneHp: 1,
    balloonHp: 1,
    respawnDelay: 5,
    droneHitRadius: 1.2,
    balloonHitRadius: 1.0,
    droneSpeed: 0.5,
    balloonDrift: 3,
    explosionParticles: 14,
  })
  assert.equal(normalizeTargetsConfig({ drones: -1 }).drones, 0)
  assert.equal(normalizeTargetsConfig({ enabled: false }).enabled, false)
})
