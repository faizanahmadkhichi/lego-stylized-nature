import * as THREE from 'three/webgpu'

import ExplosionField from '../world/combat/ExplosionField.js'
import TargetField from '../world/targets/TargetField.js'

export const TARGETS_DEFAULTS = Object.freeze({
  enabled: true,
  drones: 8,
  balloons: 6,
  /** Annulus around the spawn point where targets first appear. */
  spawnRadiusMin: 20,
  spawnRadiusMax: 70,
  /** Flight height of the targets (same band the plane flies in). */
  height: 5.5,
  heightVariance: 2,
  droneHp: 1,
  balloonHp: 1,
  /** Seconds before a destroyed target respawns near the player. */
  respawnDelay: 5,
  droneHitRadius: 1.2,
  balloonHitRadius: 1.0,
  /** Angular speed of the drones' circle paths (radians/second). */
  droneSpeed: 0.5,
  /** How far balloons drift from their center. */
  balloonDrift: 3,
  /** Explosion particle count per destroyed target. */
  explosionParticles: 14,
})

export const TARGET_COLORS = Object.freeze({
  drone: 0xe2483a,
  balloon: 0xff6fa5,
})

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function normalizeTargetsConfig(config = {}) {
  return {
    enabled: config.enabled !== false,
    drones: Math.max(0, Math.floor(finiteOr(config.drones, TARGETS_DEFAULTS.drones))),
    balloons: Math.max(0, Math.floor(finiteOr(config.balloons, TARGETS_DEFAULTS.balloons))),
    spawnRadiusMin: Math.max(0, finiteOr(config.spawnRadiusMin, TARGETS_DEFAULTS.spawnRadiusMin)),
    spawnRadiusMax: Math.max(1, finiteOr(config.spawnRadiusMax, TARGETS_DEFAULTS.spawnRadiusMax)),
    height: finiteOr(config.height, TARGETS_DEFAULTS.height),
    heightVariance: Math.max(0, finiteOr(config.heightVariance, TARGETS_DEFAULTS.heightVariance)),
    droneHp: Math.max(1, Math.floor(finiteOr(config.droneHp, TARGETS_DEFAULTS.droneHp))),
    balloonHp: Math.max(1, Math.floor(finiteOr(config.balloonHp, TARGETS_DEFAULTS.balloonHp))),
    respawnDelay: Math.max(0, finiteOr(config.respawnDelay, TARGETS_DEFAULTS.respawnDelay)),
    droneHitRadius: Math.max(0.2, finiteOr(config.droneHitRadius, TARGETS_DEFAULTS.droneHitRadius)),
    balloonHitRadius: Math.max(0.2, finiteOr(config.balloonHitRadius, TARGETS_DEFAULTS.balloonHitRadius)),
    droneSpeed: Math.max(0, finiteOr(config.droneSpeed, TARGETS_DEFAULTS.droneSpeed)),
    balloonDrift: Math.max(0, finiteOr(config.balloonDrift, TARGETS_DEFAULTS.balloonDrift)),
    explosionParticles: Math.max(0, Math.floor(finiteOr(config.explosionParticles, TARGETS_DEFAULTS.explosionParticles))),
  }
}

/** Deterministic PRNG so target placement is identical per world seed. */
export function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Moving targets: brick drones that orbit and wander, and balloons that
 * drift and bob. Each target follows a seeded path, so its motion is
 * identical on every visit to a world seed. Destroyed targets respawn near
 * the player after `respawnDelay` seconds, so there is always something to
 * shoot at. Hit detection lives in Combat; this system owns spawn, motion,
 * health, destruction, and the explosion particles.
 */
export default class Targets {
  constructor(experience, options = {}) {
    this.experience = experience
    this.config = normalizeTargetsConfig(
      options.config ?? experience.config?.targets,
    )
    this.enabled = this.config.enabled

    this.field = new TargetField(this.config)
    this.explosions = new ExplosionField()
    this.group = new THREE.Group()
    this.group.name = 'Targets'
    this.group.add(this.field.group)
    this.group.add(this.explosions.group)

    const seed = Number.isFinite(experience.config?.seed)
      ? experience.config.seed
      : 20260608
    this.random = mulberry32(seed)

    this.targets = []
    let id = 0
    for (let i = 0; i < this.config.drones; i++) {
      this.targets.push(this._createTarget(id++, 'drone'))
    }
    for (let i = 0; i < this.config.balloons; i++) {
      this.targets.push(this._createTarget(id++, 'balloon'))
    }
    for (const target of this.targets) {
      this._placeTarget(target, null)
    }

    this._elapsed = 0
  }

  get aliveTargets() {
    return this.targets.filter(target => target.alive)
  }

  get aliveCount() {
    let count = 0
    for (const target of this.targets) {
      if (target.alive) {
        count++
      }
    }
    return count
  }

  _createTarget(id, type) {
    const isDrone = type === 'drone'
    return {
      id,
      type,
      path: isDrone
        ? (this.random() < 0.5 ? 'circle' : 'sine')
        : 'bob',
      center: new THREE.Vector3(),
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      radius: isDrone ? 4 + this.random() * 6 : 0,
      amplitude: isDrone ? 4 + this.random() * 6 : 0,
      angularSpeed: this.config.droneSpeed * (0.7 + this.random() * 0.6),
      phase: this.random() * Math.PI * 2,
      hp: isDrone ? this.config.droneHp : this.config.balloonHp,
      maxHp: isDrone ? this.config.droneHp : this.config.balloonHp,
      hitRadius: isDrone ? this.config.droneHitRadius : this.config.balloonHitRadius,
      alive: true,
      respawnTimer: 0,
      yaw: 0,
      flash: 0,
    }
  }

  /** Picks a center point: near the player when given, else near the origin. */
  _placeTarget(target, nearPosition) {
    const angle = this.random() * Math.PI * 2
    const distance = this.config.spawnRadiusMin
      + this.random() * (this.config.spawnRadiusMax - this.config.spawnRadiusMin)
    const origin = nearPosition ?? { x: 0, z: 0 }
    target.center.set(
      origin.x + Math.cos(angle) * distance,
      this.config.height + (this.random() * 2 - 1) * this.config.heightVariance,
      origin.z + Math.sin(angle) * distance,
    )
    target.position.copy(target.center)
    target.previousPosition.copy(target.center)
    target.hp = target.maxHp
    target.alive = true
    target.respawnTimer = 0
    target.flash = 0
  }

  /** Position of a target on its path at elapsed time `t`. */
  _pathPosition(target, t, out) {
    if (target.path === 'circle') {
      const angle = t * target.angularSpeed + target.phase
      out.set(
        target.center.x + Math.cos(angle) * target.radius,
        target.center.y + Math.sin(t * 1.2 + target.phase) * 0.8,
        target.center.z + Math.sin(angle) * target.radius,
      )
    }
    else if (target.path === 'sine') {
      out.set(
        target.center.x + Math.sin(t * target.angularSpeed + target.phase) * target.amplitude,
        target.center.y + Math.sin(t * 1.5 + target.phase) * 1.0,
        target.center.z + Math.cos(t * target.angularSpeed * 0.7 + target.phase) * target.amplitude,
      )
    }
    else {
      // Balloon: slow drift + vertical bob.
      out.set(
        target.center.x + Math.sin(t * 0.25 + target.phase) * this.config.balloonDrift,
        target.center.y + Math.sin(t * 0.9 + target.phase) * 1.2,
        target.center.z + Math.cos(t * 0.2 + target.phase) * this.config.balloonDrift,
      )
    }
    return out
  }

  /**
   * Damages a target. Returns 'hit' when it survives, 'destroyed' when its
   * HP hits zero (explosion + respawn timer), or null when already dead.
   */
  damage(target, amount = 1) {
    if (!target.alive) {
      return null
    }
    target.hp -= amount
    target.flash = 0.15
    if (target.hp > 0) {
      return 'hit'
    }
    target.alive = false
    target.respawnTimer = this.config.respawnDelay
    this.explosions.explode(
      target.position,
      TARGET_COLORS[target.type],
      this.config.explosionParticles,
    )
    return 'destroyed'
  }

  update() {
    const delta = this.experience.time.getDelta()
    this._elapsed = this.experience.time.getElapsed()

    if (!this.enabled) {
      return
    }

    const playerPosition = this.experience.world?.playerAircraft?.state?.position ?? null
    let droneIndex = 0
    let balloonIndex = 0
    for (const target of this.targets) {
      if (!target.alive) {
        target.respawnTimer -= delta
        if (target.respawnTimer <= 0) {
          this._placeTarget(target, playerPosition)
        }
        continue
      }
      target.flash = Math.max(0, target.flash - delta)
      target.previousPosition.copy(target.position)
      this._pathPosition(target, this._elapsed, target.position)
      // Face the direction of travel. (Rotation around Y by -phi points +X
      // along (cos phi, 0, sin phi), matching the plane's convention.)
      const dx = target.position.x - target.previousPosition.x
      const dz = target.position.z - target.previousPosition.z
      if (dx * dx + dz * dz > 1e-8) {
        target.yaw = -Math.atan2(dz, dx)
      }
      const scale = 1 + target.flash * 1.5
      if (target.type === 'drone') {
        this.field.setDrone(droneIndex++, target.position, target.yaw, scale)
      }
      else {
        this.field.setBalloon(balloonIndex++, target.position, scale)
      }
    }
    this.field.setDroneCount(droneIndex)
    this.field.setBalloonCount(balloonIndex)
    this.explosions.update(delta)
  }

  dispose() {
    this.field.dispose()
    this.explosions.dispose()
    this.group.clear()
    this.targets = []
  }
}
