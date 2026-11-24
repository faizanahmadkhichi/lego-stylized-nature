# Procedural Prefab Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the procedural prefab infrastructure (LEGO units, parts, assembly, registry integration), and pilot it by replacing `flower.glb` with `landFlower`, keeping the look consistent first, then reducing triangle count (original GLB: 3452 triangles; reference budget: 600, adjustable as the visuals require).

**Architecture:** Three layers: `legoUnits.js` / `legoColors.js` define sizes and the color palette; `prefabParts.js` provides low-poly parts and `makePrefabScene` (merge per slot, align to the stud origin, use `createLegoMaterial`); `PrefabRegistry` calls the build function for `builder` variants, caches them, and owns disposal. Downstream `PrefabPlacer` / `PrefabPipelineWarmup` are unchanged.

**Tech Stack:** three 0.185( `three/webgpu`, `three/addons/utils/BufferGeometryUtils.js` ), Node 24 built-in test runner.

**Spec:** `docs/procedural-prefab-plan.md`

**Acceptance adjustment (2026-10-10):** Per the user's request, the triangle budget is relaxed; segment counts and small chamfers are decided by silhouette and highlight needs. The reference budget is not a hard test cap — automation only requires the model to be non-empty with fewer triangles than the original GLB, while keeping the mesh, index, size, placement, and disposal constraints. The current flower is 206 triangles; no need to add detail just to use up the budget; refine later based on visual comparison. The exact rules are Spec §3.4–3.5 and §5.2.

**Implementation status (2026-10-10):** The code and tests for Tasks 1–4 are in place; the LEGO parts, flower builder, registry caching/disposal, and the `landFlower` switch are done, and the old GLB/source were deleted after visual inspection. The flower is 206 triangles; in the same viewport and camera position, scene triangles dropped 6.78% and drawCalls stayed at 327. Full test suite: 266 of 276 passed, with the same 10 pre-existing failures; the production build passed. Render records are in Spec §4. The commit steps below were not executed; the changes remain in the working tree for review.

## Global Constraints

- Build functions return a `THREE.Group` with the same structure as `gltf.scene`; pure functions, no random reads.
- Prefab origin `PREFAB_ORIGIN = [-0.05, 0, 0.05]`, overall `min.y = 0`.
- Instance-color mesh names end with `_InstanceColor`; at most 2 meshes per variant.
- Materials are based on `createLegoMaterial()` (`src/materials/tsl/legoMaterial.js`), one material instance per slot, owned and disposed by `PrefabRegistry`.
- Geometries keep no `uv`; all are indexed geometry.
- `landFlower`'s `instanceColors`, `placement`, and `weight: 0.5` stay unchanged.
- The working tree already has unrelated uncommitted changes (including `src/world/world.js`): when committing, only `git add` the files listed in this plan; for `world.js`, use `git add -p` to stage only the `dispose` change.
- Baseline (2026-10-10): `node --test` totals 252 tests, 242 passed, 10 failed (`aircraftInput` 3, `environmentShadowFollow` 1, `prefabInstanceColorConfig` 2, `tiltShiftPostProcessing` 2, `worldCameraFollow` 2). At the end of each task, the failures must still be exactly these 10 — no new ones.

## Measured Data (Phase 0, completed part)

`public/model/terrain/legoBlock2x2.glb` (172 triangles) relative to the prefab origin (i.e. `(height + 1) * layerHeight`):

- The brick's visible top face sits about 0.006 above the origin (including a 0.005 chamfer).
- Stud radius 0.035; the stud top sits about 0.025 above the origin, about 8 segments.
- So the bottom of parts built up from `y = 0` sinks about 0.006 into the brick top and is invisible; the base radius must be > 0.035 to cover the stud.

`flower.glb`: `flower_root` (620 triangles, `LegoGreen` material, linear color `(0.0529, 0.266, 0.0775)` = sRGB `#418d4f`) + `flower_InstanceColor` (2832 triangles, no material).

## File Structure

| File | Responsibility |
|---|---|
| Create `src/world/prefabs/builders/legoUnits.js` | LEGO size constants (derived from the terrain grid + measured studs) |
| Create `src/world/prefabs/builders/legoColors.js` | Named color palette for builders |
| Create `src/world/prefabs/builders/prefabParts.js` | Low-poly parts `cylinder` / `box` / `stud` / `flowerPlate` and `makePrefabScene` |
| Create `src/world/prefabs/builders/flower.js` | `buildFlower()` |
| Create `src/world/prefabs/builders/index.js` | `prefabBuilders` registry |
| Modify `src/world/prefabs/PrefabRegistry.js` | Builder branch, caching, `dispose()` |
| Modify `src/world/world.js:345-347` | Release the registry in `dispose()` |
| Modify `src/assets/manifests/biomePrefabs.js:122-133` | Change `landFlower` to a builder variant |
| Modify `src/assets/sources.js:31` | Delete `landFlowerModel` |
| Delete `public/model/prefab/flower.glb` | |
| Create `test/prefabParts.test.js`, `test/prefabBuilders.test.js`, `test/prefabRegistry.test.js` | |
| Modify `test/experienceLifecycle.test.js:84-94` | Disposal order includes the registry |
| Modify `docs/procedural-prefab-plan.md` | Flower reference budget 600 (adjustable), main color correction |

---

### Task 0: Render Baseline (manual, no code changes)

- [ ] **Step 1: Launch and fix the camera position**

Run: `pnpm dev`, then open `http://localhost:5173/#debug` in the browser. Keep the default seed (`20260608`), do not move the plane, and wait for the terrain to finish loading.

- [ ] **Step 2: Record triangles and draw calls in the forest area**

Run in the browser console:

```js
const info = __experience.renderer.instance.info.render
console.log({ triangles: info.triangles, drawCalls: info.drawCalls })
```

Record the output together with the frame time shown in the Performance panel under Phase 0 in §4 of `docs/procedural-prefab-plan.md` (add a line "Baseline: triangles=…, drawCalls=…, frame=…ms").

- [ ] **Step 3: Commit**

```bash
git add docs/procedural-prefab-plan.md
git commit -m "docs: record procedural prefab render baseline"
```

---

### Task 1: LEGO Units, Color Palette, and Part Library

**Files:**
- Create: `src/world/prefabs/builders/legoUnits.js`
- Create: `src/world/prefabs/builders/legoColors.js`
- Create: `src/world/prefabs/builders/prefabParts.js`
- Test: `test/prefabParts.test.js`

**Interfaces:**
- Produces:
  - `legoUnits.js`: `STUD_PITCH: number`, `PLATE_HEIGHT: number`, `STUD_RADIUS: number`, `STUD_HEIGHT: number`, `PREFAB_ORIGIN: [number, number, number]`
  - `legoColors.js`: `LEGO_COLORS: { green: string, white: string }`
  - `prefabParts.js`:
    - `cylinder({ radius, height, segments, top = true, bottom = false }) => BufferGeometry`(bottom face at y=0, keep top/bottom caps as needed)
    - `box({ width, height, depth, bottom = false }) => BufferGeometry`(bottom face at y=0)
    - `stud() => BufferGeometry`(6 segments, no bottom face, 18 triangles)
    - `flowerPlate({ outerRadius, innerRadius, height, petals = 5 }) => BufferGeometry`(star-shaped flower plate, no bottom face)
    - `makePrefabScene(slots: { name: string, color: string, parts: BufferGeometry[] }[]) => THREE.Group`

- [ ] **Step 1: Write the failing test `test/prefabParts.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { worldConfig } from '../src/world/WorldConfig.js'
import {
  PLATE_HEIGHT,
  PREFAB_ORIGIN,
  STUD_HEIGHT,
  STUD_PITCH
} from '../src/world/prefabs/builders/legoUnits.js'
import {
  box,
  cylinder,
  flowerPlate,
  makePrefabScene,
  stud
} from '../src/world/prefabs/builders/prefabParts.js'

const triangles = (geometry) => geometry.index.count / 3
const near = (a, b, epsilon = 1e-9) => Math.abs(a - b) < epsilon

test('LEGO units follow the terrain brick grid', () => {
  assert.ok(near(STUD_PITCH * 2, worldConfig.terrain.cellSize))
  assert.ok(near(PLATE_HEIGHT * 3, worldConfig.terrain.layerHeight))
  assert.deepEqual(PREFAB_ORIGIN, [-STUD_PITCH / 2, 0, STUD_PITCH / 2])
})

test('cylinder sits on y = 0 and keeps only the requested caps', () => {
  const plate = cylinder({ radius: 0.04, height: 0.03, segments: 6 })
  plate.computeBoundingBox()
  assert.equal(triangles(plate), 6 * 2 + 6)
  assert.ok(near(plate.boundingBox.min.y, 0))
  assert.ok(near(plate.boundingBox.max.y, 0.03))
  assert.equal(triangles(cylinder({ radius: 0.01, height: 0.1, segments: 4, top: false })), 8)
  assert.equal(triangles(cylinder({ radius: 0.01, height: 0.1, segments: 4, bottom: true })), 16)
})

test('box drops its bottom face unless asked to keep it', () => {
  assert.equal(triangles(box({ width: 0.1, height: 0.02, depth: 0.05 })), 10)
  assert.equal(triangles(box({ width: 0.1, height: 0.02, depth: 0.05, bottom: true })), 12)
})

test('stud is an open-bottom six-sided cylinder', () => {
  const geometry = stud()
  geometry.computeBoundingBox()
  assert.equal(triangles(geometry), 18)
  assert.ok(near(geometry.boundingBox.max.y, STUD_HEIGHT))
})

test('flowerPlate alternates outer and inner radii for each petal', () => {
  const geometry = flowerPlate({ outerRadius: 0.06, innerRadius: 0.036, height: 0.016 })
  const position = geometry.getAttribute('position')
  const radii = new Set()
  for (let i = 0; i < position.count; i++) {
    radii.add(Math.hypot(position.getX(i), position.getZ(i)).toFixed(4))
  }
  assert.equal(triangles(geometry), 30)
  assert.deepEqual([...radii].sort(), ['0.0000', '0.0360', '0.0600'])
})

test('makePrefabScene merges each slot into one LEGO-material mesh on the stud origin', () => {
  const scene = makePrefabScene([
    {
      name: 'part_root',
      color: '#418d4f',
      parts: [
        box({ width: 0.02, height: 0.02, depth: 0.02 }),
        new THREE.IcosahedronGeometry(0.01, 0).translate(0, 0.01, 0)
      ]
    },
    { name: 'part_InstanceColor', color: '#ffffff', parts: [stud()] }
  ])
  const meshes = scene.children

  assert.deepEqual(meshes.map((mesh) => mesh.name), ['part_root', 'part_InstanceColor'])
  for (const mesh of meshes) {
    assert.ok(mesh.geometry.index)
    assert.equal(mesh.geometry.getAttribute('uv'), undefined)
    assert.ok(mesh.material.isMeshPhysicalNodeMaterial)
    assert.equal(mesh.material.clearcoat, 0.3)
  }
  assert.notEqual(meshes[0].material, meshes[1].material)
  assert.equal(meshes[0].material.color.getHexString(), '418d4f')

  const bounds = new THREE.Box3().setFromObject(scene)
  assert.ok(near(bounds.min.y, 0))
  meshes[1].geometry.computeBoundingBox()
  const studCenter = meshes[1].geometry.boundingBox.getCenter(new THREE.Vector3())
  assert.ok(near(studCenter.x, PREFAB_ORIGIN[0]))
  assert.ok(near(studCenter.z, PREFAB_ORIGIN[2]))
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/prefabParts.test.js`
Expected: FAIL，`Cannot find module '.../builders/legoUnits.js'`

- [ ] **Step 3: Implement `legoUnits.js`**

```js
import { worldConfig } from '../../WorldConfig.js'

const { cellSize, layerHeight } = worldConfig.terrain

export const STUD_PITCH = cellSize / 2
export const PLATE_HEIGHT = layerHeight / 3

// Measured from legoBlock2x2.glb. The brick's visible top face sits ~0.006 above
// the prefab origin, and its studs rise to ~0.025, so bases must exceed STUD_RADIUS.
export const STUD_RADIUS = 0.035
export const STUD_HEIGHT = 0.019

// Prefabs are centred on one of the 2x2 brick's four studs.
export const PREFAB_ORIGIN = [-STUD_PITCH / 2, 0, STUD_PITCH / 2]
```

- [ ] **Step 4: Implement `legoColors.js`**

```js
export const LEGO_COLORS = {
  green: '#418d4f',
  white: '#ffffff'
}
```

- [ ] **Step 5: Implement `prefabParts.js`**

```js
import * as THREE from 'three/webgpu'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { createLegoMaterial } from '../../../materials/tsl/legoMaterial.js'
import { PREFAB_ORIGIN, STUD_HEIGHT, STUD_RADIUS } from './legoUnits.js'

// Group indices assigned by three: CylinderGeometry 0 side / 1 top / 2 bottom; BoxGeometry 3 is -Y.
const CYLINDER_TOP = 1
const CYLINDER_BOTTOM = 2
const BOX_BOTTOM = 3

export function cylinder({ radius, height, segments, top = true, bottom = false }) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments)
  geometry.translate(0, height / 2, 0)
  return keepGroups(geometry, (index) =>
    (index !== CYLINDER_TOP || top) && (index !== CYLINDER_BOTTOM || bottom))
}

export function box({ width, height, depth, bottom = false }) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.translate(0, height / 2, 0)
  return keepGroups(geometry, (index) => index !== BOX_BOTTOM || bottom)
}

export function stud() {
  return cylinder({ radius: STUD_RADIUS, height: STUD_HEIGHT, segments: 6 })
}

export function flowerPlate({ outerRadius, innerRadius, height, petals = 5 }) {
  const geometry = cylinder({ radius: outerRadius, height, segments: petals * 2 })
  const position = geometry.getAttribute('position')
  const step = Math.PI / petals
  const innerScale = innerRadius / outerRadius

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    if (Math.hypot(x, z) < 1e-6) {
      continue
    }
    if (Math.abs(Math.round(Math.atan2(x, z) / step)) % 2 === 1) {
      position.setXYZ(i, x * innerScale, position.getY(i), z * innerScale)
    }
  }

  return geometry
}

export function makePrefabScene(slots) {
  const scene = new THREE.Group()

  for (const { name, color, parts } of slots) {
    const geometry = mergeGeometries(parts.map(toMergeable))
    geometry.translate(...PREFAB_ORIGIN)

    const material = createLegoMaterial()
    material.name = name
    material.color.set(color)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    scene.add(mesh)
  }

  return scene
}

function keepGroups(geometry, keep) {
  const source = geometry.index.array
  const indices = []
  for (const group of geometry.groups) {
    if (!keep(group.materialIndex)) {
      continue
    }
    for (let i = group.start; i < group.start + group.count; i++) {
      indices.push(source[i])
    }
  }
  geometry.setIndex(indices)
  geometry.clearGroups()
  return geometry
}

// mergeGeometries needs identical attribute sets and all-indexed input.
function toMergeable(geometry) {
  geometry.deleteAttribute('uv')
  return geometry.index ? geometry : mergeVertices(geometry)
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `node --test test/prefabParts.test.js`
Expected: all 6 PASS

- [ ] **Step 7: Full test suite with no new failures**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`, with the same failures as the baseline in Global Constraints.

- [ ] **Step 8: Commit**

```bash
git add src/world/prefabs/builders/legoUnits.js src/world/prefabs/builders/legoColors.js src/world/prefabs/builders/prefabParts.js test/prefabParts.test.js
git commit -m "feat: add LEGO units and part library for procedural prefabs"
```

---

### Task 2: Flower Build Function and Builder Registry

**Files:**
- Create: `src/world/prefabs/builders/flower.js`
- Create: `src/world/prefabs/builders/index.js`
- Test: `test/prefabBuilders.test.js`
- Modify: `docs/procedural-prefab-plan.md` (§3.5 flower budget, §2.2 main color)

**Interfaces:**
- Consumes: Task 1's `cylinder`, `box`, `stud`, `flowerPlate`, `makePrefabScene`, `PLATE_HEIGHT`, `LEGO_COLORS`
- Produces:
  - `buildFlower() => THREE.Group`, whose child meshes are, in order, `flower_root`, `flower_InstanceColor`
  - `prefabBuilders: Record<string, (params?: object) => THREE.Group>`, currently `{ flower: buildFlower }`

Triangle breakdown: base 6-segment round plate 18 + 3 four-segment stems 24 + 2 leaves 20 = `flower_root` 62; 3 star-shaped flower plates (30 + stud 18) = `flower_InstanceColor` 144; total 206.

- [ ] **Step 1: Write the failing test `test/prefabBuilders.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { prefabBuilders } from '../src/world/prefabs/builders/index.js'
import WorldMaterials from '../src/world/WorldMaterials.js'

const SOURCE_TRIANGLES = { flower: 3452 }
// Bounding box of the GLB each builder replaces (docs/procedural-prefab-plan.md §2.2).
const REFERENCE_SIZES = { flower: [0.29, 0.21, 0.28] }

function countTriangles(scene) {
  let total = 0
  scene.traverse((node) => {
    if (node.isMesh) {
      total += node.geometry.index.count / 3
    }
  })
  return total
}

for (const [name, build] of Object.entries(prefabBuilders)) {
  test(`${name} builder costs less than its GLB`, () => {
    const triangles = countTriangles(build())
    assert.ok(SOURCE_TRIANGLES[name] !== undefined, `${name} has no source triangle baseline`)
    assert.ok(triangles > 0 && triangles < SOURCE_TRIANGLES[name], `${name} has ${triangles} triangles`)
  })

  test(`${name} builder sits on the stud origin near its GLB size`, () => {
    const bounds = new THREE.Box3().setFromObject(build())
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())

    assert.ok(Math.abs(bounds.min.y) < 0.005, `min.y ${bounds.min.y}`)
    assert.ok(Math.abs(center.x + 0.05) < 0.03, `center.x ${center.x}`)
    assert.ok(Math.abs(center.z - 0.05) < 0.03, `center.z ${center.z}`)
    size.toArray().forEach((value, axis) => {
      const ratio = value / REFERENCE_SIZES[name][axis]
      assert.ok(ratio >= 0.75 && ratio <= 1.25, `${name} axis ${axis} size ratio ${ratio.toFixed(2)}`)
    })
  })

  test(`${name} builder is deterministic`, () => {
    const positions = (scene) => scene.children.map((mesh) =>
      Array.from(mesh.geometry.getAttribute('position').array))
    assert.deepEqual(positions(build()), positions(build()))
  })
}

test('flower builder exposes a root mesh and one instance color mesh', () => {
  const scene = prefabBuilders.flower()
  assert.deepEqual(scene.children.map((mesh) => mesh.name), ['flower_root', 'flower_InstanceColor'])
  assert.equal(scene.children[0].material.color.getHexString(), '418d4f')
})

test('tint and instance color resolution clone builder materials without mutating them', () => {
  const materials = new WorldMaterials()
  const [root, head] = prefabBuilders.flower().children
  const tinted = materials.resolvePrefabMaterial(root.material, { color: '#ff0000', strength: 0.5 })
  const instanced = materials.resolveInstanceColorMaterial(head.material)

  assert.notEqual(tinted, root.material)
  assert.equal(tinted.clearcoat, root.material.clearcoat)
  assert.notEqual(instanced, head.material)
  assert.equal(instanced.color.getHexString(), 'ffffff')
  assert.equal(root.material.color.getHexString(), '418d4f')
  materials.dispose()
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/prefabBuilders.test.js`
Expected: FAIL，`Cannot find module '.../builders/index.js'`

- [ ] **Step 3: Implement `flower.js`**

```js
import { LEGO_COLORS } from './legoColors.js'
import { PLATE_HEIGHT } from './legoUnits.js'
import { box, cylinder, flowerPlate, makePrefabScene, stud } from './prefabParts.js'

const HEAD_HEIGHT = 0.016
const STEMS = [
  { length: 0.13, tilt: 0.55, azimuth: Math.PI / 6 },
  { length: 0.12, tilt: 0.6, azimuth: (5 * Math.PI) / 6 },
  { length: 0.14, tilt: 0.55, azimuth: (3 * Math.PI) / 2 }
]

export function buildFlower() {
  const root = [cylinder({ radius: 0.04, height: PLATE_HEIGHT, segments: 6 })]
  const heads = []

  for (const { length, tilt, azimuth } of STEMS) {
    root.push(
      cylinder({ radius: 0.008, height: length, segments: 4, top: false })
        .rotateZ(-tilt)
        .rotateY(azimuth)
        .translate(0, PLATE_HEIGHT, 0)
    )

    const reach = length * Math.sin(tilt)
    const x = reach * Math.cos(azimuth)
    const y = PLATE_HEIGHT + length * Math.cos(tilt)
    const z = -reach * Math.sin(azimuth)
    heads.push(
      flowerPlate({ outerRadius: 0.06, innerRadius: 0.036, height: HEAD_HEIGHT }).translate(x, y, z),
      stud().translate(x, y + HEAD_HEIGHT, z)
    )
  }

  root.push(
    box({ width: 0.07, height: 0.006, depth: 0.028 }).rotateY(Math.PI / 4).translate(0.03, 0.05, 0.03),
    box({ width: 0.07, height: 0.006, depth: 0.028 }).rotateY(-Math.PI / 3).translate(-0.03, 0.07, -0.02)
  )

  return makePrefabScene([
    { name: 'flower_root', color: LEGO_COLORS.green, parts: root },
    { name: 'flower_InstanceColor', color: LEGO_COLORS.white, parts: heads }
  ])
}
```

- [ ] **Step 4: Implement `index.js`**

```js
import { buildFlower } from './flower.js'

export const prefabBuilders = {
  flower: buildFlower
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `node --test test/prefabBuilders.test.js`
Expected: all 5 PASS. If a size assertion fails, only adjust `STEMS`' `tilt` / `length`; do not loosen the tolerances.

- [ ] **Step 6: Update the plan doc**

In `docs/procedural-prefab-plan.md`:
- §3.5 `landFlower` row: use an adjustable reference budget of `600`, keeping the three flowers, leaves, and studs, and add rounder petals, stems, and edges as the visuals require; the current actual count is 206 triangles.
- §2.2 `flower.glb` main color: change `LegoGreen #0d4414` to `LegoGreen #418d4f (sRGB)`.

- [ ] **Step 7: Full test suite with no new failures**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`, with the same failures as the baseline.

- [ ] **Step 8: Commit**

```bash
git add src/world/prefabs/builders/flower.js src/world/prefabs/builders/index.js test/prefabBuilders.test.js docs/procedural-prefab-plan.md
git commit -m "feat: add procedural flower prefab build function"
```

---

### Task 3: `PrefabRegistry` Support for Builder Variants and Disposal

**Files:**
- Modify: `src/world/prefabs/PrefabRegistry.js` (whole file)
- Modify: `src/world/world.js:345-347`
- Test: `test/prefabRegistry.test.js` (new)
- Modify: `test/experienceLifecycle.test.js:84-94`

**Interfaces:**
- Consumes: Task 2's `prefabBuilders`
- Produces:
  - `new PrefabRegistry(resources, manifest = biomePrefabs, builders = prefabBuilders)`
  - `getVariantAsset(prefabId, variantIndex) => { scene: THREE.Group } | null`: `builder` variants are cached by `prefabId:variantIndex`; an unknown builder returns `null`
  - `dispose() => void`: releases all built geometry and materials; safe to call repeatedly

- [ ] **Step 1: Write the failing test `test/prefabRegistry.test.js`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import PrefabRegistry from '../src/world/prefabs/PrefabRegistry.js'

const manifest = {
  rock: { variants: [{ source: 'rockModel' }] },
  flower: { variants: [{ builder: 'testFlower', params: { size: 2 } }, { builder: 'missing' }] }
}

function createBuilders(calls) {
  return {
    testFlower(params) {
      calls.push(params)
      const scene = new THREE.Group()
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()))
      return scene
    }
  }
}

test('source variants still come from loaded resources', () => {
  const rockAsset = { scene: new THREE.Group() }
  const registry = new PrefabRegistry({ items: { rockModel: rockAsset } }, manifest, {})
  assert.equal(registry.getVariantAsset('rock', 0), rockAsset)
})

test('builder variants are built once with their params and cached', () => {
  const calls = []
  const registry = new PrefabRegistry({ items: {} }, manifest, createBuilders(calls))
  const first = registry.getVariantAsset('flower', 0)

  assert.ok(first.scene.isGroup)
  assert.equal(registry.getVariantAsset('flower', 0), first)
  assert.deepEqual(calls, [{ size: 2 }])
  assert.equal(registry.getVariantAsset('flower', 1), null)
})

test('dispose releases built geometry and materials exactly once', () => {
  const registry = new PrefabRegistry({ items: {} }, manifest, createBuilders([]))
  const mesh = registry.getVariantAsset('flower', 0).scene.children[0]
  let disposals = 0
  mesh.geometry.addEventListener('dispose', () => disposals++)
  mesh.material.addEventListener('dispose', () => disposals++)

  registry.dispose()
  registry.dispose()

  assert.equal(disposals, 2)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test test/prefabRegistry.test.js`
Expected: FAIL — in the builder case `first` is `undefined` (`Cannot read properties of undefined (reading 'scene')`), and the `dispose` case reports `registry.dispose is not a function`

- [ ] **Step 3: Implement `PrefabRegistry.js`**

```js
import { biomePrefabs } from '../../assets/manifests/biomePrefabs.js'
import { prefabBuilders } from './builders/index.js'

export default class PrefabRegistry {
    constructor(resources, manifest = biomePrefabs, builders = prefabBuilders) {
        this.resources = resources
        this.manifest = manifest
        this.builders = builders
        this.builtAssets = new Map()
    }

    get(prefabId) {
        const entry = this.manifest[prefabId]
        if (!entry) {
            return null
        }
        return { id: prefabId, entry }
    }

    getVariantAsset(prefabId, variantIndex) {
        const entry = this.manifest[prefabId]
        const variant = entry?.variants[variantIndex]
        if (!variant) {
            return null
        }
        if (variant.builder) {
            return this.getBuiltAsset(`${prefabId}:${variantIndex}`, variant)
        }
        return this.resources.items[variant.source]
    }

    getBuiltAsset(key, variant) {
        if (!this.builtAssets.has(key)) {
            const build = this.builders[variant.builder]
            this.builtAssets.set(key, build ? { scene: build(variant.params) } : null)
        }
        return this.builtAssets.get(key)
    }

    dispose() {
        for (const asset of this.builtAssets.values()) {
            asset?.scene.traverse((node) => {
                if (node.isMesh) {
                    node.geometry.dispose()
                    node.material.dispose()
                }
            })
        }
        this.builtAssets.clear()
    }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test test/prefabRegistry.test.js`
Expected: all 3 PASS

- [ ] **Step 5: Update the disposal-order test case in `test/experienceLifecycle.test.js` (lines 84–94)**

```js
test('World releases borrowers before shared materials and cloned geometry exactly once', () => {
  const world = new World({ scene: new THREE.Scene() })
  const calls = []
  world.children = [{ dispose: () => calls.push('child') }]
  world.terrainChunkManager = { dispose: () => calls.push('slots') }
  world.prefabRegistry = { dispose: () => calls.push('registry') }
  world.materials = { dispose: () => calls.push('materials') }
  world.brickGeometry = { dispose: () => calls.push('geometry') }
  world.dispose()
  world.dispose()
  assert.deepEqual(calls, ['child', 'slots', 'registry', 'materials', 'geometry'])
})
```

- [ ] **Step 6: Run and confirm it fails**

Run: `node --test test/experienceLifecycle.test.js`
Expected: FAIL, the actual order is missing `'registry'`

- [ ] **Step 7: Modify `dispose()` in `src/world/world.js`**

Insert a line between `this.terrainChunkManager = null` and `this.materials?.dispose()` (optional call, because the warmup test in `experienceLifecycle.test.js` uses a registry mock without `dispose`):

```js
        this.terrainChunkManager?.dispose()
        this.terrainChunkManager = null
        this.prefabRegistry?.dispose?.()
        this.materials?.dispose()
```

- [ ] **Step 8: Run and confirm it passes**

Run: `node --test test/experienceLifecycle.test.js test/prefabRegistry.test.js`
Expected: all PASS

- [ ] **Step 9: Full test suite with no new failures**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`, with the same failures as the baseline.

- [ ] **Step 10: Commit (`world.js`: stage only this change)**

```bash
git add src/world/prefabs/PrefabRegistry.js test/prefabRegistry.test.js test/experienceLifecycle.test.js
git add -p src/world/world.js
git commit -m "feat: add procedural builder variant support to PrefabRegistry"
```

---

### Task 4: Switch `landFlower` to the Builder, Delete the GLB After Visual Acceptance

**Files:**
- Modify: `src/assets/manifests/biomePrefabs.js:122-133`
- Modify: `src/assets/sources.js:31`
- Delete: `public/model/prefab/flower.glb`
- Modify: `test/prefabBuilders.test.js` (append manifest test cases)

**Interfaces:**
- Consumes: Task 2's `prefabBuilders.flower` and Task 3's builder branch

- [ ] **Step 1: Append manifest test cases to `test/prefabBuilders.test.js`**

Add imports at the top of the file:

```js
import { biomePrefabs } from '../src/assets/manifests/biomePrefabs.js'
import sources from '../src/assets/sources.js'
import { matchesInstanceColorMesh } from '../src/world/prefabs/prefabInstanceColor.js'
```

Append at the end of the file:

```js
test('every manifest variant resolves to a loaded source or a registered builder', () => {
  const sourceNames = new Set(sources.map((source) => source.name))
  for (const [prefabId, entry] of Object.entries(biomePrefabs)) {
    for (const variant of entry.variants) {
      const resolved = variant.builder
        ? variant.builder in prefabBuilders
        : sourceNames.has(variant.source)
      assert.ok(resolved, `${prefabId} variant ${variant.builder ?? variant.source} is unresolved`)
    }
  }
})

test('builder variants expose the instance color mesh their prefab expects', () => {
  for (const [prefabId, entry] of Object.entries(biomePrefabs)) {
    if (!entry.instanceColors) {
      continue
    }
    for (const variant of entry.variants.filter((v) => v.builder)) {
      const names = prefabBuilders[variant.builder](variant.params).children.map((mesh) => mesh.name)
      assert.ok(
        names.some((name) => matchesInstanceColorMesh(name, entry.instanceColors.meshNameSuffix)),
        `${prefabId} has no ${entry.instanceColors.meshNameSuffix} mesh`
      )
    }
  }
})

test('landFlower is built procedurally', () => {
  assert.deepEqual(biomePrefabs.landFlower.variants, [{ builder: 'flower', weight: 0.5 }])
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `node --test test/prefabBuilders.test.js`
Expected: `landFlower is built procedurally` FAILS (currently `source: 'landFlowerModel'`), the rest PASS

- [ ] **Step 3: Modify the manifest's `landFlower.variants`**

```js
  landFlower: {
    category: 'flora',
    placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
    variants: [
      { builder: 'flower', weight: 0.5 }
    ],
    randomRotation: true,
    instanceColors: {
      meshNameSuffix: '_InstanceColor',
      palette: ['#ff1111', '#ffff00', '#ffffff']
    }
  }
```

- [ ] **Step 4: Run and confirm it passes**

Run: `node --test test/prefabBuilders.test.js`
Expected: all PASS

- [ ] **Step 5: Visual and Performance Acceptance (manual)**

Run: `pnpm dev`, open `http://localhost:5173/#debug`, and do not move the plane, same as Task 0. Check:

1. No `has no mesh matching instance color suffix` or new `exceeded capacity` warnings in the console.
2. Flower bases sit on the studs — not floating, not visibly sunk; zooming in, the plants rotated 90° still align with the studs.
3. Flower head colors come from the palette (red / yellow / white), stems and leaves are green, and the gloss matches the terrain bricks.
4. Shadows look correct.
5. Run the Task 0 command in the console: `triangles` clearly below the baseline, `drawCalls` no higher than the baseline, and frame time no worse than the baseline.

If not satisfied, only adjust the constants in `flower.js`, then re-run `node --test test/prefabBuilders.test.js`.

- [ ] **Step 6: Delete the GLB and the source**

Delete line 31 of `src/assets/sources.js`:

```js
  { name: 'landFlowerModel', type: 'gltfModel', path: 'model/prefab/flower.glb' }
```

Then delete the file:

```powershell
git rm public/model/prefab/flower.glb
```

- [ ] **Step 7: Full test suite with no new failures**

Run: `node --test --test-reporter=tap 2>&1 | Select-String -Pattern "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 10`, with the same failures as the baseline.

- [ ] **Step 8: Record the results and commit**

Under Phase 1 in §4 of `docs/procedural-prefab-plan.md`, append a line "Result: triangles=…, drawCalls=…, frame=…ms".

```bash
git add src/assets/manifests/biomePrefabs.js src/assets/sources.js test/prefabBuilders.test.js docs/procedural-prefab-plan.md
git commit -m "feat: switch flower prefab to procedural generation and remove flower.glb"
```
