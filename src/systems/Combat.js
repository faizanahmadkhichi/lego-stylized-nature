import * as THREE from 'three/webgpu'

import BoltField from '../world/combat/BoltField.js'

export const COMBAT_DEFAULTS = Object.freeze({
  enabled: true,
  /** Shots per second while Space is held. */
  fireRate: 3,
  /** Bolt speed in world units per second (plus the plane's velocity). */
  boltSpeed: 30,
  /** Seconds before a bolt expires. */
  boltLife: 2,
  /** Bolt pool size; extra shots are dropped when the pool is full. */
  boltCount: 64,
  /** Bolt length in world units (a small glowing brick). */
  boltSize: 0.35,
  /** World units ahead of the plane center where bolts spawn. */
  noseOffset: 1.2,
})

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function normalizeCombatConfig(config = {}) {
  const normalized = {
    enabled: config.enabled !== false,
    fireRate: Math.max(0.5, finiteOr(config.fireRate, COMBAT_DEFAULTS.fireRate)),
    boltSpeed: Math.max(1, finiteOr(config.boltSpeed, COMBAT_DEFAULTS.boltSpeed)),
    boltLife: Math.max(0.2, finiteOr(config.boltLife, COMBAT_DEFAULTS.boltLife)),
    boltCount: Math.max(1, Math.floor(finiteOr(config.boltCount, COMBAT_DEFAULTS.boltCount))),
    boltSize: Math.max(0.05, finiteOr(config.boltSize, COMBAT_DEFAULTS.boltSize)),
    noseOffset: finiteOr(config.noseOffset, COMBAT_DEFAULTS.noseOffset),
  }
  return normalized
}

/**
 * Firing support for the player aircraft. Hold Space to shoot glowing brick
 * bolts from the plane's nose. Bolts are pooled (no per-shot allocation),
 * fly straight, and expire after `boltLife` seconds. Hit detection against
 * targets comes later — this system only fires, moves, and renders bolts.
 */
export default class Combat {
  constructor(experience, options = {}) {
    this.experience = experience
    this.config = normalizeCombatConfig(
      options.config ?? experience.config?.player?.aircraft?.combat,
    )
    this.enabled = this.config.enabled

    this.field = new BoltField(this.config)
    this.group = this.field.group

    this.bolts = []
    for (let i = 0; i < this.config.boltCount; i++) {
      this.bolts.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        alive: false,
      })
    }

    this._cooldown = 0
    this._forward = new THREE.Vector3()
    this._spawn = new THREE.Vector3()
  }

  get player() {
    return this.experience.world?.playerAircraft ?? null
  }

  get aliveCount() {
    let count = 0
    for (const bolt of this.bolts) {
      if (bolt.alive) {
        count++
      }
    }
    return count
  }

  /** Fires one bolt from the plane's nose. Returns false when not allowed. */
  tryFire() {
    const player = this.player
    if (!this.enabled || !player?.enabled || player.paused) {
      return false
    }
    if (this._cooldown > 0) {
      return false
    }
    const bolt = this.bolts.find(candidate => !candidate.alive)
    if (!bolt) {
      return false
    }

    this._forward.set(Math.cos(player.state.yaw), 0, Math.sin(player.state.yaw))
    this._spawn.copy(player.state.position)
      .addScaledVector(this._forward, this.config.noseOffset)
    bolt.position.copy(this._spawn)
    bolt.velocity.copy(this._forward)
      .multiplyScalar(this.config.boltSpeed)
      .add(player.state.velocity)
    bolt.life = this.config.boltLife
    bolt.alive = true
    this._cooldown = 1 / this.config.fireRate
    this.experience.audio?.play('shoot')
    return true
  }

  update() {
    const delta = this.experience.time.getDelta()
    this._cooldown = Math.max(0, this._cooldown - delta)

    const player = this.player
    if (!this.enabled || !player?.enabled || player.paused) {
      // Frozen: bolts keep their last rendered matrices, so nothing to do.
      return
    }

    if (player.input.getKeys().Space) {
      this.tryFire()
    }

    for (const bolt of this.bolts) {
      if (!bolt.alive) {
        continue
      }
      bolt.life -= delta
      if (bolt.life <= 0) {
        bolt.alive = false
        continue
      }
      bolt.position.addScaledVector(bolt.velocity, delta)
    }

    let index = 0
    for (const bolt of this.bolts) {
      if (!bolt.alive) {
        continue
      }
      this.field.setBolt(index, bolt.position, bolt.velocity)
      index++
    }
    this.field.setCount(index)
  }

  dispose() {
    this.field.dispose()
    this.bolts = []
  }
}
