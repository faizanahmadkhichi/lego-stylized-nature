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
  // yaw 0 -> forward (1, 0, 0); nose offset 0.6 ahead of the plane center.
  // The first bolt of a burst is the left one: lateral -0.22 (burstSpread).
  assert.deepEqual(bolt.position.toArray(), [0.6, 5.5, -0.22])
  // bolt speed 60 along forward, plus the plane's (zero) velocity.
  assert.deepEqual(bolt.velocity.toArray(), [60, 0, 0])
  assert.equal(bolt.life, 5)
  assert.deepEqual(experience.audio.played, ['shoot'])
})

test('a burst fires three bolts with lateral spread', () => {
  const experience = createExperience()
  const combat = new Combat(experience)

  combat.tryFire()
  // The burst's remaining two bolts fire on the update timer.
  for (let i = 0; i < 10; i++) {
    experience._delta.value = 1 / 60
    combat.update()
  }
  assert.equal(combat.aliveCount, 3)
  const bolts = combat.bolts.filter(candidate => candidate.alive)
  // Lateral offsets: -0.22, 0, +0.22 (burstSpread), all at the nose.
  assert.deepEqual(
    bolts.map(bolt => bolt.position.z).sort((a, b) => a - b),
    [-0.22, 0, 0.22],
  )
  // The bolts left at different times, so they sit at different distances.
  const distances = bolts.map(bolt => bolt.position.x).sort((a, b) => a - b)
  assert.ok(distances[0] > 0.6 && distances[2] > distances[0])
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
  // Single-bolt bursts so this test tracks exactly one bolt.
  const combat = new Combat(experience, { config: { burstCount: 1 } })

  combat.tryFire()
  const bolt = combat.bolts.find(candidate => candidate.alive)

  experience._delta.value = 0.5
  combat.update()
  // Single-bolt burst: lateral offset is 0, so the bolt flies dead ahead.
  assert.deepEqual(bolt.position.toArray(), [0.6 + 30, 5.5, 0])
  assert.equal(bolt.alive, true)

  // 0.5 + 4.6 = 5.1s > boltLife 5s, so the bolt expires.
  experience._delta.value = 4.6
  combat.update()
  assert.equal(bolt.alive, false)
  assert.equal(combat.aliveCount, 0)
})

test('holding Space fires bursts repeatedly at the fire rate', () => {
  const experience = createExperience()
  const combat = new Combat(experience)
  experience._player.input.keys.Space = true

  // 1 second at 60fps with 3 bursts/s and 3 bolts per burst -> 9 bolts.
  for (let i = 0; i < 60; i++) {
    experience._delta.value = 1 / 60
    combat.update()
  }
  assert.equal(combat.aliveCount, 9)
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
  const combat = new Combat(experience, { config: { boltCount: 2, fireRate: 100, burstCount: 1 } })

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
    burstCount: 3,
    burstInterval: 0.06,
    burstSpread: 0.22,
    boltSpeed: 60,
    boltLife: 5,
    boltCount: 96,
    boltLength: 3,
    boltWidth: 0.12,
    noseOffset: 0.6,
  })
  assert.equal(normalizeCombatConfig({ fireRate: 0 }).fireRate, 0.5)
  assert.equal(normalizeCombatConfig({ boltCount: 0 }).boltCount, 1)
  assert.equal(normalizeCombatConfig({ enabled: false }).enabled, false)
})
