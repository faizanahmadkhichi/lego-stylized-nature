import * as THREE from 'three/webgpu'

const X_AXIS = new THREE.Vector3(1, 0, 0)

/**
 * Renders the active bolts as small glowing bricks with one InstancedMesh.
 * The Combat system owns bolt logic; this class only owns the mesh.
 */
export default class BoltField {
  constructor(config = {}) {
    this.maxCount = Number.isFinite(config.boltCount) && config.boltCount > 0
      ? Math.floor(config.boltCount)
      : 96
    const length = Number.isFinite(config.boltLength) && config.boltLength > 0
      ? config.boltLength
      : 3
    const width = Number.isFinite(config.boltWidth) && config.boltWidth > 0
      ? config.boltWidth
      : 0.12

    this.group = new THREE.Group()
    this.group.name = 'BoltField'

    // Long, thin glowing streaks: the long axis (X) points along the bolt's
    // velocity, so each bolt reads as a tracer from the plane to the horizon.
    const geometry = new THREE.BoxGeometry(length, width, width)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffc040,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxCount)
    this.mesh.count = 0
    // Instances move every frame, so the mesh must never be culled by a
    // stale bounding sphere.
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.mesh)

    this._matrix = new THREE.Matrix4()
    this._quaternion = new THREE.Quaternion()
    this._direction = new THREE.Vector3()
    this._unitScale = new THREE.Vector3(1, 1, 1)
  }

  /** Writes one bolt's transform; call setCount() after all bolts are set. */
  setBolt(index, position, velocity) {
    if (index < 0 || index >= this.maxCount) {
      return
    }
    this._direction.copy(velocity)
    if (this._direction.lengthSq() < 1e-8) {
      this._direction.set(1, 0, 0)
    }
    this._direction.normalize()
    this._quaternion.setFromUnitVectors(X_AXIS, this._direction)
    this._matrix.compose(position, this._quaternion, this._unitScale)
    this.mesh.setMatrixAt(index, this._matrix)
  }

  /** Shows the first `count` bolts and pushes the matrices to the GPU. */
  setCount(count) {
    this.mesh.count = Math.max(0, Math.min(this.maxCount, Math.floor(count)))
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mesh.dispose()
    this.group.clear()
  }
}
