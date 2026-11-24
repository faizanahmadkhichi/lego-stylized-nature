import * as THREE from 'three/webgpu'

const Y_AXIS = new THREE.Vector3(0, 1, 0)

/**
 * Renders targets as two InstancedMeshes: brick drones (boxes) and balloons
 * (spheres). The Targets system owns target logic; this class only owns the
 * meshes. A slight emissive keeps targets readable from far away.
 */
export default class TargetField {
  constructor(config = {}) {
    this.maxDrones = Number.isFinite(config.drones) && config.drones > 0
      ? Math.floor(config.drones)
      : 8
    this.maxBalloons = Number.isFinite(config.balloons) && config.balloons > 0
      ? Math.floor(config.balloons)
      : 6

    this.group = new THREE.Group()
    this.group.name = 'TargetField'

    const droneGeometry = new THREE.BoxGeometry(1.4, 0.6, 1.1)
    const droneMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2483a,
      emissive: 0xe2483a,
      emissiveIntensity: 0.25,
      roughness: 0.5,
      metalness: 0.1,
    })
    this.droneMesh = new THREE.InstancedMesh(droneGeometry, droneMaterial, this.maxDrones)
    this.droneMesh.count = 0
    this.droneMesh.frustumCulled = false
    this.droneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.droneMesh)

    const balloonGeometry = new THREE.SphereGeometry(0.8, 16, 12)
    const balloonMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6fa5,
      emissive: 0xff6fa5,
      emissiveIntensity: 0.3,
      roughness: 0.35,
      metalness: 0.05,
    })
    this.balloonMesh = new THREE.InstancedMesh(balloonGeometry, balloonMaterial, this.maxBalloons)
    this.balloonMesh.count = 0
    this.balloonMesh.frustumCulled = false
    this.balloonMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.balloonMesh)

    this._matrix = new THREE.Matrix4()
    this._quaternion = new THREE.Quaternion()
    this._scale = new THREE.Vector3(1, 1, 1)
  }

  /** Writes one drone's transform; call setDroneCount() after all are set. */
  setDrone(index, position, yaw, scale = 1) {
    if (index < 0 || index >= this.maxDrones) {
      return
    }
    this._quaternion.setFromAxisAngle(Y_AXIS, yaw)
    this._scale.setScalar(scale)
    this._matrix.compose(position, this._quaternion, this._scale)
    this.droneMesh.setMatrixAt(index, this._matrix)
  }

  /** Writes one balloon's transform; call setBalloonCount() after all are set. */
  setBalloon(index, position, scale = 1) {
    if (index < 0 || index >= this.maxBalloons) {
      return
    }
    this._quaternion.identity()
    this._scale.setScalar(scale)
    this._matrix.compose(position, this._quaternion, this._scale)
    this.balloonMesh.setMatrixAt(index, this._matrix)
  }

  setDroneCount(count) {
    this.droneMesh.count = Math.max(0, Math.min(this.maxDrones, Math.floor(count)))
    this.droneMesh.instanceMatrix.needsUpdate = true
  }

  setBalloonCount(count) {
    this.balloonMesh.count = Math.max(0, Math.min(this.maxBalloons, Math.floor(count)))
    this.balloonMesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.droneMesh.geometry.dispose()
    this.droneMesh.material.dispose()
    this.droneMesh.dispose()
    this.balloonMesh.geometry.dispose()
    this.balloonMesh.material.dispose()
    this.balloonMesh.dispose()
    this.group.clear()
  }
}
