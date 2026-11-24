import * as THREE from 'three/webgpu'

/**
 * A small pooled particle burst for target explosions. Particles are glowing
 * boxes that fly outward, shrink, and fade. The Targets system owns the
 * explosion timing; this class only owns the mesh.
 */
export default class ExplosionField {
  constructor(config = {}) {
    this.maxParticles = Number.isFinite(config.maxParticles) && config.maxParticles > 0
      ? Math.floor(config.maxParticles)
      : 96

    this.group = new THREE.Group()
    this.group.name = 'ExplosionField'

    const geometry = new THREE.BoxGeometry(0.18, 0.18, 0.18)
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxParticles)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Per-particle colors (set via setColorAt on explode).
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.maxParticles * 3),
      3,
    )
    this.group.add(this.mesh)

    this.particles = []
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        alive: false,
      })
    }

    this._matrix = new THREE.Matrix4()
    this._quaternion = new THREE.Quaternion()
    this._scale = new THREE.Vector3()
    this._color = new THREE.Color()
    this._direction = new THREE.Vector3()
  }

  /** Bursts `count` particles out of `position` in the given color. */
  explode(position, colorHex, count = 14) {
    this._color.set(colorHex)
    let spawned = 0
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const particle = this.particles[i]
      if (particle.alive) {
        continue
      }
      // Random direction on a sphere.
      this._direction.set(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      )
      if (this._direction.lengthSq() < 1e-6) {
        this._direction.set(0, 1, 0)
      }
      this._direction.normalize()
      const speed = 3 + Math.random() * 6
      particle.position.copy(position)
      particle.velocity.copy(this._direction).multiplyScalar(speed)
      particle.maxLife = 0.5 + Math.random() * 0.4
      particle.life = particle.maxLife
      particle.alive = true
      // Slight color variation so the burst isn't flat.
      this._color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.25)
      this.mesh.setColorAt(i, this._color)
      this._color.set(colorHex)
      spawned++
    }
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true
    }
  }

  update(delta) {
    let index = 0
    for (const particle of this.particles) {
      if (!particle.alive) {
        continue
      }
      particle.life -= delta
      if (particle.life <= 0) {
        particle.alive = false
        continue
      }
      particle.velocity.y -= 2 * delta
      particle.position.addScaledVector(particle.velocity, delta)
      const scale = Math.max(0.01, particle.life / particle.maxLife)
      this._quaternion.identity()
      this._scale.setScalar(scale)
      this._matrix.compose(particle.position, this._quaternion, this._scale)
      this.mesh.setMatrixAt(index, this._matrix)
      index++
    }
    this.mesh.count = index
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mesh.dispose()
    this.group.clear()
  }
}
