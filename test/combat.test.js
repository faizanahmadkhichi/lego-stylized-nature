import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import Combat, { normalizeCombatConfig } from '../src/systems/Combat.js'

function createExperience(overrides = {}) {
  const delta = { value: 1 / 60 }
  const player = {
    enabled: true,
    paused: false,
    state: {
      position: new THREE.Vector3(0, 5.5, 0),
      yaw: 0,
      velocity: new THREE.Vector3(0, 0, 0),
    },
    input: {
      keys: { Space: false },
      getKeys() {
        return { ...this.keys }
      },
    },
  }
  const experience = {
    config: { player: { aircraft: { combat: {} } } },
    time: {
      getDelta() {
        return delta.value
      },
    },
    audio: {
      played: [],
      play(name) {
        this.played.push(name)
        return true
      },
    },
    world: { playerAircraft: player },
    _delta: delta,
    _player: player,
  }
  Object.assign(experience, overrides)
  return experience
}

test('tryFire spawns a bolt at the nose in the flight direction', () => {
  const experience = createExperience()
  const combat = new Combat(experience)

  assert.equal(combat.tryFire(), true)
  assert.equal(combat.aliveCount, 1)

  const bolt = combat.bolts.find(candidate => candidate.alive)
  // yaw 0 -> forward (1, 0, 0); nose offset 1.2 ahead of the plane center.
  assert.deepEqual(bolt.position.toArray(), [1.2, 5.5, 0])
  // bolt speed 30 along forward, plus the plane's (zero) velocity.
  assert.deepEqual(bolt.velocity.toArray(), [30, 0, 0])
  assert.equal(bolt.life, 2)
  assert.deepEqual(experience.audio.played, ['shoot'])
})

test('fire rate limits shots', () => {
  const experience = createExperience()
  const combat = new Combat(experience)

  assert.equal(combat.tryFire(), true)
  assert.equal(combat.tryFire(), false)

  // Cooldown is 1/3s; advance past it.
  experience._delta.value = 0.4
  combat.update()
  assert.equal(combat.tryFire(), true)
})

test('bolts move with the frame delta and expire after boltLife', () => {
  const experience = createExperience()
  const combat = new Combat(experience)

  combat.tryFire()
  const bolt = combat.bolts.find(candidate => candidate.alive)

  experience._delta.value = 0.5
  combat.update()
  assert.deepEqual(bolt.position.toArray(), [1.2 + 15, 5.5, 0])
  assert.equal(bolt.alive, true)

  // 0.5 + 1.6 = 2.1s > boltLife 2s, so the bolt expires.
  experience._delta.value = 1.6
  combat.update()
  assert.equal(bolt.alive, false)
  assert.equal(combat.aliveCount, 0)
})

test('holding Space fires repeatedly at the fire rate', () => {
  const experience = createExperience()
  const combat = new Combat(experience)
  experience._player.input.keys.Space = true

  // 1 second at 60fps with a 3/s fire rate -> 3 bolts.
  for (let i = 0; i < 60; i++) {
    experience._delta.value = 1 / 60
    combat.update()
  }
  assert.equal(combat.aliveCount, 3)
})

test('does not fire when the player is paused or disabled', () => {
  const experience = createExperience()
  const combat = new Combat(experience)

  experience._player.paused = true
  assert.equal(combat.tryFire(), false)

  experience._player.paused = false
  experience._player.enabled = false
  assert.equal(combat.tryFire(), false)

  experience._player.enabled = true
  assert.equal(combat.tryFire(), true)
})

test('a full bolt pool drops extra shots instead of growing', () => {
  const experience = createExperience()
  const combat = new Combat(experience, { config: { boltCount: 2, fireRate: 100 } })

  assert.equal(combat.tryFire(), true)
  experience._delta.value = 0.02
  combat.update()
  assert.equal(combat.tryFire(), true)
  experience._delta.value = 0.02
  combat.update()
  // Pool is full (2 bolts alive); the third shot is dropped.
  assert.equal(combat.tryFire(), false)
  assert.equal(combat.aliveCount, 2)
})

test('normalizeCombatConfig applies defaults and clamps', () => {
  assert.deepEqual(normalizeCombatConfig(), {
    enabled: true,
    fireRate: 3,
    boltSpeed: 30,
    boltLife: 2,
    boltCount: 64,
    boltSize: 0.35,
    noseOffset: 1.2,
  })
  assert.equal(normalizeCombatConfig({ fireRate: 0 }).fireRate, 0.5)
  assert.equal(normalizeCombatConfig({ boltCount: 0 }).boltCount, 1)
  assert.equal(normalizeCombatConfig({ enabled: false }).enabled, false)
})
