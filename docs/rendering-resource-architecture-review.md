# Three.js Project Rendering Pipeline and Resource Management Architecture Analysis and Change Recommendations

- Analysis date: 2026-10-08
- Project: `lego-stylized-nature`
- Three.js version: currently installed `0.185.0` (r185)
- Analysis scope: rendering and object reuse, resource lifecycle, startup warmup, post-processing pipeline, and performance measurement on the default run path

> Implementation status (2026-10-08): this rendering and resource management optimization has landed; see [Optimization Results and Verification Record](rendering-resource-optimization-results.md) for implementation notes, before/after data, and verification limits. The text below keeps the pre-optimization analysis; code behavior follows the results record and the current implementation.

## Reading Guide

**Code references.** This document references code as "file path + symbol name", e.g. `Renderer.setTiltShiftEnabled()`, without line numbers. Most referenced files have not been committed to git, so line numbers drift with edits.

**Evidence markers.** Each conclusion carries an evidence type:

| Marker | Meaning |
| --- | --- |
| [Reproduced] | Observed on a real running object |
| [Verified in source] | Confirmed by reading project source and r185 source |
| [Inferred, pending test] | Inferred from source; needs verification in the browser |

**Impact scope.** Distinguishes "default path" (triggered on every run under the current config) from "conditional" (only when post-processing is enabled, loading fails, a World is destroyed, etc.).

## Overall Conclusion

Under the current config, chunk terrain is on and post-processing is off (`worldConfig.postProcessing.enabled = false`). So fix priority is ordered by impact on the default run path:

1. **Correctness and performance issues on the default path**: reused InstancedMesh bounding spheres never update; the water surface generates an instance per cell; each chunk slot creates its own terrain, water, and lava materials, and the debug panel can only change one of them.
2. **Resource lifecycle gaps**: load-failure semantics, PMREM and the original HDR, cloned geometry, cleanup on init failure, warmup coverage.
3. **Post-processing pipeline** (only takes effect when post-processing is on): output-node switch invalidation markers, node disposal, SMAA and color-space ordering.

Existing foundations worth keeping: `Experience` coordinates startup uniformly; `Resources` starts loading at construction, in parallel with renderer init; chunks use a fixed slot pool and mesh bucket reuse; prefab pipeline warmup already exists. These designs don't need to be overturned; what's missing are two rules:

- **When reusing an object, update all derived state in sync.**
- **A shared resource has exactly one owner.**

New abstractions are only introduced when a current problem drives them. This document suggests only one new module: a World-level material library (see 2.3). AssetScope, reference counting, and Workers go in Section 6, "Deferred Designs", to be done when the corresponding need appears.

## 1. Layered View

Three.js provides the GPU backend, scene graph, math library, and file parsing. The project still decides:

- what stages a frame is split into;
- when a resource counts as usable;
- who owns shared materials, geometry, and textures;
- which changes require rebuilding the render graph;
- which derived state must be invalidated when an object is reused.

By responsibility, the mapping looks like this:

| Layer | Current counterpart in the project | Boundary to define |
| --- | --- | --- |
| TOOL | Tweakpane debug panel | Modifies config through public interfaces; does not directly hold a slot's internal objects |
| FUNC | World, PlayerAircraft, ChunkManager, Renderer | Game logic, scene presentation, and render organization each own their part |
| RESOURCE | `Resources`, prefab material cache, PMREM | Resource identity, sharing rules, failure semantics, disposal responsibility |
| CORE | `Time`, `Sizes`, startup and teardown order | Small, stable, generic mechanisms |
| PLATFORM | Browser, Canvas, WebGPU backend | Concentrated in a thin adapter layer |

## 2. Default-Path Issues (handle first)

### 2.1 Reused InstancedMesh bounding spheres never update

[Verified in source] Impact: default path

In r185, `InstancedMesh.computeBoundingSphere()` is only lazily called once by frustum culling, when `boundingSphere === null`, and the result only covers the `count` instances present at that time. Later calls to `setMatrixAt()` or changes to `count` never invalidate it. Nothing in the project's `src/` recomputes bounding spheres, yet the following meshes are all reused:

| Location | Reuse pattern |
| --- | --- |
| `TerrainBrickRenderer.build()` | Reuses the same mesh when capacity is sufficient |
| `LavaBrickRenderer.build()` | Same |
| `PrefabPlacer.getOrCreateMeshBucket()` | When a slot switches to a new chunk, the same bucket is refilled |

After a slot is assigned a new chunk, the bounding sphere still reflects the first fill. Prefabs show it most clearly: if a bucket first placed only a few trees in one corner of a chunk, then the new chunk's trees spread wider, trees at the screen edge get incorrectly culled and appear to vanish suddenly at the camera edge. Terrain spans the same horizontal extent each time, but heights differ, so high ground at chunk corners can also be affected.

**Suggested fix:** recompute after every instance-data fill:

```js
mesh.count = n
mesh.instanceMatrix.needsUpdate = true
mesh.computeBoundingSphere()
```

Cost is O(instance count), the same order as filling the matrices themselves. After the fix, the water surface can drop `frustumCulled = false` (see 2.2).

**Rule:** when reusing an InstancedMesh, update all state derived from instance data (bounding sphere, bounding box, `instanceColor.needsUpdate`) in the same fill function.

### 2.2 Water surface generates one instance per cell

[Verified in source] Impact: default path; benefit size [Inferred, pending test]

`WaterBrickRenderer.initializeGrid()` does not read the terrain; it places one water brick per cell across the chunk's 72 × 72 grid. But `LayeredTerrainBuilder.buildPlacements()` does not generate terrain bricks for cells where `surfaceCell.isWater`; terrain columns on land start above the water level. So water bricks under land cells are hidden by terrain yet still drawn.

Estimate at full window load under the current config:

| Item | Value |
| --- | --- |
| Water instances per slot | 72 × 72 = 5,184 (6 pages, 900 per page) |
| 9 slots total | 46,656 instances, 54 InstancedMeshes |
| Brick model | 172 triangles (`legoBlock2x2.glb`) |
| Main-pass triangles | ~8 million |

The water surface also sets `castShadow = true` and `frustumCulled = false`, so the shadow pass draws it again, without shadow-camera-range culling.

**Suggested fix:**

1. Following `LavaBrickRenderer.build()`, only generate instances for cells where `surfaceCell.isWater`.
2. After fixing 2.1, restore frustum culling on the water surface.
3. A/B compare the visual difference of disabling water shadows, then decide whether to keep them.

Verify in the browser that coastlines and chunk seams look unchanged, and compare `renderer.info.render.triangles` before and after. `test/waterRendering.test.js` and `test/waterLavaChunk.test.js` currently assert full-grid instance counts and need matching updates.

### 2.3 Each slot creates its own materials; the debug panel only changes one chunk

[Verified in source] Impact: default path

`ChunkManager.createSlot()` creates a new `TerrainBrickRenderer`, `WaterBrickRenderer`, and `LavaBrickRenderer` per slot. Each renderer creates its own materials in its constructor: `createLegoMaterial()`, `createWaterMaterial()`, `createLavaMaterial()`, plus a `MeshBasicNodeMaterial` for the terrain AO preview. 9 slots means 36 material instances, with identical config for materials of the same type. Water and lava materials only depend on the global `time` node and world coordinates, with no per-slot state, so they can be shared directly.

The direct consequence is a debug-panel bug: `ChunkManager.getDebugMaterials()` only returns the first active slot's materials, and `MaterialPanel` binds to that copy. Adjusting brick roughness or water flow speed in `#debug` changes only one chunk.

The prefab side has the opposite problem: tree materials, tint materials, and instanceColor materials live in module-level caches (`treeMaterial.js`, `prefabMaterialTint.js`, `prefabInstanceColor.js`) shared by all slots' `PrefabPlacer`, but disposal is initiated by a single placer: `PrefabPlacer.clearInstances()` calls `disposeTreeMaterials()` to clear the entire tree material cache. Currently `clearInstances()` is only called from `dispose()`, i.e. only when a World is destroyed, so this is a latent risk: once a single slot needs to be destroyed on its own, other slots' materials get released with it.

Both problems have the same root cause: **shared materials have no single owner.** On the terrain side, materials should be shared but aren't; on the prefab side, they are shared but anyone can release them.

**Suggested fix: build a World-level material library under `src/world/`.**

- World creates and owns it, passing it to `ChunkManager` and each renderer via constructor parameters.
- One copy each of terrain, AO preview, water, and lava materials, shared by all slots.
- Prefab tree, tint, and instanceColor caches move from module-level variables into the material library.
- Renderers and placers only release their own meshes and instance data, not materials.
- `World.dispose()` releases the material library uniformly after all users are destroyed.
- The debug panel takes materials from the library, so one change applies to all chunks.

No reference counting is needed: no user's lifetime exceeds World's.

### 2.4 Warmup coverage

[Inferred, pending test] Impact: default path (when a prefab first appears)

`warmupPrefabPipelines()` puts each prefab material combination into a temporary group, then calls `renderer.compileAsync(scene, camera)`. From the r185 source, three gaps are possible:

1. **Frustum culling.** `compileAsync()` builds the render list via `_projectObject()`, which checks `frustumCulled`. Warmup meshes use identity matrices at the world origin without disabling frustum culling; the initial camera looks toward the player position (near the map center), so whether the origin is in view depends on camera parameters.
2. **Shadow pass.** `compileAsync()` only creates pipelines for the main camera's render list; the shadow depth map is only drawn during actual rendering. Warmup meshes also don't set `castShadow`, while real prefab meshes all cast shadows.
3. **When post-processing is on.** `compileAsync()` compiles against the canvas render context, but with post-processing on, the scene actually renders to ScenePass's render target, which may have a different format.

**Suggested fix:**

- Set warmup meshes to `frustumCulled = false`, with `castShadow` and `receiveShadow` matching real prefabs.
- If the browser still shows hitches when a prefab first appears, render one real frame with the warmup group after `compileAsync()`, before starting the frame loop, to cover the shadow and post-processing paths.
- Verification: open frame-time stats, fly into a new biome, and watch for frame-time spikes when prefabs first appear.

The same principle applies to the whole startup flow: **finished loading does not mean hitch-free rendering.** File parsing is resource management; PMREM generation and pipeline compilation are render-side preparation; `Experience.init()` is responsible for waiting for both before starting the frame loop. The current flow already follows this order; only warmup coverage needs to be added.

## 3. Resource Lifecycle

### 3.1 Current startup and teardown flow

[Verified in source]

`Experience.init()` order:

```text
Renderer.attachPipeline() (returns immediately when post-processing is off)
 → Renderer.init()             Resources already started loading at construction, in parallel
 → await Resources.ready
 → Environment.applyEnvironmentMap() (generates PMREM)
 → World.build()
 → resize
 → World.warmupPrefabPipelines()
 → create debug panels (#debug only)
```

Then `Experience.start()` starts the frame loop. `Experience.update()` each frame, in order: update time → update camera → update World → update post-processing time uniform → render.

`Experience.dispose()` order is already sound: stop the frame loop first, then destroy World, Environment, and other users, then destroy the renderer. What's missing is the resource release phase (see 3.3).

### 3.2 Distinguishing "loading finished" from "startup succeeded"

[Verified in source] Impact: when resource loading fails

`Resources.loadResource()` records `errors[name]` on load failure, sets `items[name]` to `null`, counts it as done anyway, and resolves `ready` normally once everything finishes. So `ready` only means "all requests have ended", not that required resources are usable. Systems then degrade independently: `World.build()` skips terrain when the brick model is missing, `PlayerAircraft` disables the player when its model is missing, `Environment` skips the environment map when the HDR is missing.

**Suggested fix (minimal version):**

- Add `required: true` to resource descriptions in `src/assets/sources.js`, at least for the brick model.
- After `await resources.ready`, `Experience.init()` checks required resources; on failure, throw an error naming the resource and enter the cleanup path in 3.4.
- Optional resources keep the existing degradation logic on failure.

Texture wrap and color space are currently set on shared textures by `createWaterMaterial()` and `createLavaMaterial()` when creating materials. After 2.3, each material is created only once, so these settings also run only once; no need to move them into resource descriptions yet.

### 3.3 Ownership gaps

[Verified in source]

| Resource | Current state | Suggested owner | Impact |
| --- | --- | --- | --- |
| GLTF and textures in `Resources.items` | No disposal entry point; `Experience.dispose()` doesn't handle them | Add `Resources.dispose()`, called before the renderer is destroyed | When destroying an Experience |
| PMREM result | `Environment.applyEnvironmentMap()` only keeps the `.texture` from `fromEquirectangular()` | Environment keeps the full RenderTarget, releasing it in `dispose()` and on regeneration | When destroying or regenerating the environment |
| Original HDR texture | No longer used after PMREM generation, but held by `Resources` indefinitely | Release right after PMREM generation and remove from `Resources.items` | Default path (resident memory) |
| Cloned brick geometry | `extractBrickGeometry()` clones geometry; not released when the World is destroyed | World | When destroying a World |
| Terrain, water, lava materials | Each renderer creates and releases its own | World-level material library (2.3) | Default path |
| Prefab derived materials | Module-level cache; a single placer can release all of them | World-level material library (2.3) | When destroying a slot alone |
| InstancedMesh and instance buffers | Each renderer/placer releases its own | Keep as is | — |
| ScenePass, SMAA nodes | Not released | Renderer (4.2) | When post-processing is on |

The original HDR is currently used only once in `Experience.init()`; nothing else regenerates the environment map, so releasing it after generation is safe. If runtime HDR switching is added later, change it back to keeping it.

Principle: **chunk slots only release their own instance data; shared resources are released uniformly by the longer-lived owner.**

### 3.4 Cleanup on init failure

[Verified in source] Impact: when initialization fails

`bootstrap()` only logs the error after `experience.init()` throws; the already-created renderer, World, and event listeners are all left behind. Suggest calling `experience.dispose()` in the catch block, and confirming `dispose()` is safe for partially initialized states — e.g. `_unsubscribeResize` empty, World not yet built, PMREM not yet generated.

## 4. Post-Processing Pipeline (takes effect when post-processing is on)

Post-processing is off by default, and `Renderer.render()` calls `renderer.render(scene, camera)` directly. The issues below only occur when `worldConfig.postProcessing.enabled = true`. R1 is only a few lines and can be fixed casually; the rest should be handled together when post-processing is enabled.

Node chain once enabled:

```text
ScenePass
 → SpeedLines
 → TiltShift (two prebuilt branches, enabled and disabled)
 → renderOutput (tone mapping + convert to sRGB)
 → Vignette
 → SMAA
 → screen
```

### 4.1 Mark invalidation when switching output nodes

[Reproduced][Verified in source]

`Renderer.setTiltShiftEnabled()` only replaces `renderPipeline.outputNode`. In r185, `RenderPipeline._update()` only writes `outputNode` into the fullscreen quad's `fragmentNode` when `needsUpdate === true`, and sets `needsUpdate` to false after the first update. Reproducing with a real `RenderPipeline` showed:

```text
outputNodeChanged: true
needsUpdateAfterSwitch: false
fragmentNodeRebuilt: false
```

In other words, switching TiltShift after the first frame has no effect.

**Fix:**

```js
const nextOutput = nextEnabled
  ? this.outputNodes.tiltShiftEnabled
  : this.outputNodes.tiltShiftDisabled

if (this.renderPipeline.outputNode !== nextOutput) {
  this.renderPipeline.outputNode = nextOutput
  this.renderPipeline.needsUpdate = true
}
```

**Test:** the existing mock in `test/tiltShiftPostProcessing.test.js` only verifies the reference switch. No real `RenderPipeline` is needed: set `needsUpdate` to false on the mock first, switch, and assert it becomes true.

Rule: value changes (time, opacity, focus width, blur strength) go through uniforms; structural changes (output node, effect connections) must be marked invalid.

### 4.2 Release pipeline-owned nodes

[Verified in source]

In r185, `RenderPipeline.dispose()` only releases the fullscreen quad's material; it does not recursively release the node graph. And in `Renderer.attachPipeline()`:

- `scenePass` is a local variable; its render target is never released;
- each of the two output branches creates an SMAA node, each holding 3 render targets, 2 lookup textures, and 3 materials, also never released;
- `Renderer.dispose()` only releases the TiltShift blur nodes and the `RenderPipeline`.

**Suggested fix:** in `attachPipeline()`, record created nodes (scenePass, the two SMAA nodes, the TiltShift effect) into an array. `attachPipeline()`'s start and `Renderer.dispose()` share one release function: iterate and call `dispose()`, then clear the array. Repeated calls should be safe.

As long as the pipeline stays inside `Renderer` with a single effect chain, one array is enough; no separate PipelineBundle class is needed.

### 4.3 SMAA and color-space order

[Verified in source] Resulting image after the change [Inferred, pending test]

`Renderer.createFinalOutput()` first runs `renderOutput()` (tone mapping + convert to sRGB), then vignette and SMAA. The r185 `SMAANode` source comment requires SMAA to run before converting to sRGB.

**Suggested change:**

```js
createFinalOutput(sceneColor) {
  const toneMapped = renderOutput(
    sceneColor,
    this.instance.toneMapping,
    THREE.LinearSRGBColorSpace
  )
  const aa = smaa(toneMapped.mul(applyVignette()))
  return renderOutput(aa, THREE.NoToneMapping, THREE.SRGBColorSpace)
}
```

In r185, `RenderOutputNode` skips conversion when the output color space equals the working color space (linear sRGB), and skips tone mapping under `NoToneMapping`. So this code completes tone mapping in linear space first, SMAA processes linear LDR color, and only one sRGB conversion happens at the end. `outputColorTransform = false` stays unchanged to avoid double conversion.

Moving the vignette from sRGB space to linear space changes its visual strength, so `VIGNETTE_AMOUNT` may need recalibration. Compare edge aliasing and overall brightness in the browser.

### 4.4 Renderer responsibility scope (don't split yet)

`Renderer` currently handles WebGPU init, exposure and shadow config, post-processing graph construction, effect interfaces, DPR handling, and resource release — all at once. It's only about 230 lines with a single effect chain, so there's no need to split it into RenderSystem, RenderConfig, pipeline builder, and other files yet.

`PlayerAircraft._updateSpeedLines()` calls `experience.renderer.setSpeedLineOpacity()` directly every frame; the call has no effect when post-processing is off. Only this one place has gameplay driving a post-processing parameter, so keep it as is.

Consider splitting when any of these appear: a second effect chain; quality tiers; multiple gameplay systems needing to drive post-processing parameters.

## 5. Potential Risks and Missing Features

### 5.1 Aircraft thrust glow not taking effect

[Verified in source] Impact: default path (missing feature)

`PlayerAircraft._resolveEngineNodes()` looks up `left_engine` and `right_engine` by name, then reads their `material`. Parsing `public/model/player/fly.glb` shows these two nodes have no mesh and no child nodes, so `node.material` is `undefined`, and `_setEngineIntensity()` returns on its first line.

Therefore:

- The thrust glow effect currently has no effect;
- The "instance modified a shared material" and "setting `material.needsUpdate = true` every frame" problems currently never happen.

When fixing the glow, handle these together:

1. Confirm which mesh in the model should glow; if there is no dedicated glow mesh, adjust the model or use a different implementation.
2. `sourceScene.clone(true)` shares materials. Clone the material being modified first, and have PlayerAircraft release it in `dispose()`.
3. The current code both multiplies `emissive` by intensity and sets `emissiveIntensity = intensity`, so final brightness varies with the square of intensity. Keep only one.
4. Drop the per-frame `material.needsUpdate = true`. Color and intensity are numeric parameters and don't need to trigger material reprocessing.

### 5.2 Redundant full-map renderer in chunk mode

[Verified in source] Impact: low

In chunk mode, `World.build()` still creates the full-map `TerrainBrickRenderer`. It is never added to `children` and `build()` is never called on it, so it has no mesh and uses no GPU resources — just a redundant JS object and two unused materials.

It currently serves two roles: as the "already initialized" check in `World.build()` and `World.regenerate()`, and as the fallback value for the material panel in `World.debuggerInit()`. When deleting it, change those checks to test `terrainGenerator` or `terrainChunkManager`. This can be handled alongside the 2.3 material library.

## 6. Deferred Designs

The designs below have no triggering need yet. They are recorded here as starting points for when the need appears:

| Design | Trigger condition | Notes for later |
| --- | --- | --- |
| AssetManager / AssetScope, in-flight Promise reuse, late callbacks after scope ends | Need to load by biome group or load on demand at runtime | Resource identity and release responsibility follow the owner table in 3.3 |
| Streaming prefab loading | Same as above | `PrefabPlacer.build()` skips assets not yet loaded, while `ChunkRenderSlot.ensurePrefabsBuilt()` still records "built". When an asset arrives, invalidate the corresponding slot's build state and rebuild |
| Material reference counting | Shared material users outlive World, or multiple Worlds must coexist | — |
| Chunk build millisecond budget, staged tasks, Worker | Section 7 measurements show chunk building causing clear frame-time spikes | First use timing data to identify the heaviest step: terrain generation, AO, placement, or instance filling |
| RenderSystem / RenderConfig split, quality tiers | See 4.4 | — |

## 7. Performance Measurement

The Section 2 changes should all have before/after comparison data. r185 already provides the tools:

| Data | How to get it |
| --- | --- |
| Draw calls, triangle count | `renderer.info.render.drawCalls`, `renderer.info.render.triangles` |
| Geometry, texture counts | `renderer.info.memory.geometries`, `renderer.info.memory.textures`; after repeatedly creating and destroying a World they should return to stable values |
| GPU time | Pass `new WebGPURenderer({ trackTimestamp: true })` at creation, then call `renderer.resolveTimestampsAsync()`; requires device support for `timestamp-query` |
| CPU time | Time with `performance.now()` in `ChunkManager.fillSlot()`, `ChunkRenderSlot.ensurePrefabsBuilt()`, and each stage of `Experience.init()` |

`renderer.render()`'s JavaScript time is not the same as GPU time; observe them separately.

## 8. Change Checklist

| No. | Change | Main location | Impact | Evidence | Effort | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Recompute bounding sphere after filling instances | `TerrainBrickRenderer`, `LavaBrickRenderer`, `PrefabPlacer` | Default path | Verified in source | Small | High |
| D2 | Water surface generates instances only for water cells; restore frustum culling; evaluate water shadows | `WaterBrickRenderer` | Default path | Verified in source, benefit pending test | Medium | High |
| D3 | World-level material library: slots share terrain, water, lava materials; prefab caches move in; debug panel reads from the library | `World`, `ChunkManager`, prefab material modules, `MaterialPanel` | Default path | Verified in source | Medium | High |
| L1 | Warmup meshes disable frustum culling and match shadow settings; render one real frame after warmup if needed | `PrefabPipelineWarmup`, `Experience.init()` | Default path | Inferred, pending test | Small | Medium |
| L2 | Mark required resources and check failures at startup | `sources.js`, `Experience.init()` | On load failure | Verified in source | Small | Medium |
| L3 | PMREM keeps the full RenderTarget; release the original HDR after generation | `Environment`, `Experience.init()` | Default path (memory) | Verified in source | Small | Medium |
| L4 | Add `Resources.dispose()`; World releases cloned brick geometry | `Resources`, `World`, `Experience.dispose()` | On destroy | Verified in source | Small | Medium |
| L5 | Call `dispose()` on init failure | `bootstrap()`, `Experience` | On init failure | Verified in source | Small | Medium |
| R1 | Set `needsUpdate` when switching output nodes; add a test | `Renderer.setTiltShiftEnabled()` | When post-processing is on | Reproduced | Small | Low, can fix casually |
| R2 | Record and release scenePass, SMAA, and other nodes | `Renderer.attachPipeline()`, `Renderer.dispose()` | When post-processing is on | Verified in source | Small | Low |
| R3 | Move SMAA before the sRGB conversion | `Renderer.createFinalOutput()` | When post-processing is on | Verified in source, image pending test | Small | Low |
| F1 | Fix thrust glow (material clone, squared brightness, drop per-frame `needsUpdate`) | `PlayerAircraft` | Missing feature | Verified in source | Medium | Low |
| F2 | Remove the redundant full-map renderer in chunk mode | `World` | Low | Verified in source | Small | Low, handle with D3 |
| P1 | Set up the Section 7 measurement tools | Debug panel, `Experience` | — | — | Small | In sync with D1–D3 |

## 9. Verification Goals

### 9.1 Default run path

- After flying across multiple chunks, prefabs and high ground at the screen edge don't suddenly disappear.
- Before/after the water change, coastlines and chunk seams look identical, and `renderer.info.render.triangles` drops noticeably.
- In `#debug`, adjusting brick or water materials changes all chunks at once.
- Flying into a new biome for the first time doesn't cause a clear frame-time spike when prefabs appear.

### 9.2 Resource lifecycle

- When a required resource fails to load, `Experience.init()` throws an error naming the resource and completes cleanup.
- When an optional resource fails to load, existing degradation behavior is unchanged.
- After repeatedly creating and destroying an Experience, `renderer.info.memory` returns to stable values.
- Destroying a single placer leaves other slots' materials valid.

### 9.3 Post-processing (when on)

- Switching TiltShift after the first frame applies the new output graph.
- After re-attaching or destroying the pipeline, ScenePass and SMAA render targets are released.
- Color conversion happens exactly once; vignette strength is recalibrated.

## Summary

The three most worthwhile changes are all on the default run path, with small scope: **recompute the bounding sphere when reusing an InstancedMesh, generate water instances only for water cells, and build a World-level material library.** The first two are correctness and performance issues; the third fixes a debug-panel bug while giving shared materials a single owner.

Then complete the resource lifecycle: required-resource failure semantics, PMREM and the original HDR, geometry and `Resources` release, warmup coverage. Post-processing fixes go together when post-processing is enabled, with R1 fixable casually.

Two rules run through the whole document: **when reusing an object, update all derived state in sync; a shared resource has exactly one owner.**
