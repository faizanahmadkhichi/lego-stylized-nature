import * as THREE from 'three/webgpu'

import BoltField from '../world/combat/BoltField.js'

export const COMBAT_DEFAULTS = Object.freeze({
  enabled: true,
  /** Bursts per second while Space is held. */
  fireRate: 3,
  /** Bolts fired per burst. */
  burstCount: 3,
  /** Seconds between bolts inside one burst. */
  burstInterval: 0.06,
  /** Lateral offset between bolts in a burst, in world units. */
  burstSpread: 0.22,
  /** Bolt speed in world units per second (plus the plane's velocity). */
  boltSpeed: 60,
  /** Seconds before a bolt expires; speed x life = range to the horizon. */
  boltLife: 5,
  /** Bolt pool size; extra shots are dropped when the pool is full. */
  boltCount: 96,
  /** Tracer length in world units (a long glowing streak). */
  boltLength: 3,
  /** Tracer thickness in world units. */
  boltWidth: 0.12,
  /** World units ahead of the plane center where bolts spawn. */
  noseOffset: 0.6,
})

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function normalizeCombatConfig(config = {}) {
  const normalized = {
    enabled: config.enabled !== false,
    fireRate: Math.max(0.5, finiteOr(config.fireRate, COMBAT_DEFAULTS.fireRate)),
    burstCount: Math.max(1, Math.floor(finiteOr(config.burstCount, COMBAT_DEFAULTS.burstCount))),
    burstInterval: Math.max(0, finiteOr(config.burstInterval, COMBAT_DEFAULTS.burstInterval)),
    burstSpread: Math.max(0, finiteOr(config.burstSpread, COMBAT_DEFAULTS.burstSpread)),
    boltSpeed: Math.max(1, finiteOr(config.boltSpeed, COMBAT_DEFAULTS.boltSpeed)),
    boltLife: Math.max(0.2, finiteOr(config.boltLife, COMBAT_DEFAULTS.boltLife)),
    boltCount: Math.max(1, Math.floor(finiteOr(config.boltCount, COMBAT_DEFAULTS.boltCount))),
    boltLength: Math.max(0.1, finiteOr(config.boltLength, COMBAT_DEFAULTS.boltLength)),
    boltWidth: Math.max(0.02, finiteOr(config.boltWidth, COMBAT_DEFAULTS.boltWidth)),
    noseOffset: finiteOr(config.noseOffset, COMBAT_DEFAULTS.noseOffset),
  }
  return normalized
}

/**
 * Firing support for the player aircraft. Hold Space to shoot bursts of
 * glowing tracer bolts from right at the plane's nose — long streaks that
 * race to the horizon. Bolts are pooled (no per-shot allocation), fly
 * straight, and expire after `boltLife` seconds. Hit detection against
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
    this._burstRemaining = 0
    this._burstTimer = 0
    this._forward = new THREE.Vector3()
    this._perpendicular = new THREE.Vector3()
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

  /** Fires one burst from the plane's nose. Returns false when not allowed. */
  tryFire() {
    const player = this.player
    if (!this.enabled || !player?.enabled || player.paused) {
      return false
    }
    if (this._cooldown > 0 || this._burstRemaining > 0) {
      return false
    }
    return this._startBurst()
  }

  /** Starts a burst: fires the first bolt now, the rest follow on a timer. */
  _startBurst() {
    this._burstRemaining = this.config.burstCount - 1
    this._burstTimer = this.config.burstInterval
    this._cooldown = 1 / this.config.fireRate
    return this._fireBolt(0)
  }

  /**
   * Fires a single bolt of the current burst. `burstIndex` spreads the bolts
   * sideways so a burst reads as a fan of tracers, not one thick line.
   */
  _fireBolt(burstIndex) {
    const player = this.player
    const bolt = this.bolts.find(candidate => !candidate.alive)
    if (!bolt) {
      return false
    }

    this._forward.set(Math.cos(player.state.yaw), 0, Math.sin(player.state.yaw))
    this._perpendicular.set(-Math.sin(player.state.yaw), 0, Math.cos(player.state.yaw))
    const lateral = (burstIndex - (this.config.burstCount - 1) / 2) * this.config.burstSpread
    this._spawn.copy(player.state.position)
      .addScaledVector(this._forward, this.config.noseOffset)
      .addScaledVector(this._perpendicular, lateral)
    bolt.position.copy(this._spawn)
    bolt.velocity.copy(this._forward)
      .multiplyScalar(this.config.boltSpeed)
      .add(player.state.velocity)
    bolt.life = this.config.boltLife
    bolt.alive = true
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

    if (player.input.getKeys().Space && this._cooldown <= 0 && this._burstRemaining === 0) {
      this._startBurst()
    }

    if (this._burstRemaining > 0) {
      this._burstTimer -= delta
      // A long frame (lag spike) fires every bolt that came due, so a burst
      // always completes instead of stalling half-fired.
      while (this._burstRemaining > 0 && this._burstTimer <= 0) {
        const burstIndex = this.config.burstCount - this._burstRemaining
        this._fireBolt(burstIndex)
        this._burstRemaining--
        this._burstTimer += this.config.burstInterval
      }
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
