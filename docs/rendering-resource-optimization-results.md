# Rendering and Resource Management Optimization Results

Date: 2026-10-08. Based on the [architecture review](rendering-resource-architecture-review.md); current Three.js is r185. Default chunk mode, post-processing off, water shadows on.

## Implemented Changes

| Review Item | Result |
| --- | --- |
| D1 | Terrain, lava, prefabs, and water update their bounding spheres after population; existing bounding boxes are updated too, and instance colors and matrices are marked for update together. |
| D2 | Water is only populated for `isWater` cells within the visible range, reusing a fixed-capacity paged pool; empty pages are hidden and frustum culling is restored. A new water shadow toggle was added, with shadows kept on by default. |
| D3 | Added `WorldMaterials`: 9 slots share 4 terrain/AO/water/lava materials; the tree, tint, and instanceColor material caches are also held by World. Slots, placers, and warmup objects borrow materials, World releases them all at the end, and the debug panel edits the shared materials. |
| L1 | Warmup disables frustum culling and matches the shadow settings, then actually renders one frame after compiling. World keeps warmup objects detached from the scene, retaining caches of unused pipelines and releasing them on destroy; if async warmup is cancelled, late results are released. |
| L2–L5 | Brick models are marked as required resources, throwing an error containing the resource name on failure; optional resources keep degrading gracefully. Environment holds the full PMREM target and releases the original HDR after generation. Resources deduplicate disposal of GLTF geometry, materials, textures, and ImageBitmap, and handle load callbacks after destruction. World releases cloned geometry, and bootstrap cleans up an Experience that failed to start. |
| R1–R3 | Output image switches set `needsUpdate`; ScenePass, GaussianBlur, both SMAA branches, and intermediate RTTs are destroyed together; the order is linear tone mapping, vignette, SMAA, then final sRGB conversion, with vignette strength recalibrated and the original alpha kept so the page background doesn't show through the corners. |
| F1 | The thrust glow branch clones and manages its own material, scaling `emissiveIntensity` only once and removing the per-frame `needsUpdate`. The current model's engine anchors have no emissive meshes, so visible thrust is still provided by the existing standalone flame VFX; model assets were not modified. |
| F2, P1 | Chunk mode no longer creates a full-map renderer; `#debug` adds a Performance panel that separately records CPU, GPU, whole-frame draw stats, startup phases, and chunk/AO/prefab build times, and can export a JSON snapshot. GPU queries are only enabled in debug mode. |

Browser verification also found and fixed two r185 behaviors; the compatibility logic is centralized in `src/renderer/installObjectResourceCleanup.js`:

1. `InstancedMesh.dispose()` did not clean up WebGPU's derived instance attributes and the RenderObjects of borrowed materials. Rebuilding the scene used to leave about 38 MB of instance attributes per round. Now mesh destruction releases its own instance buffers, bindings, and pipelines, and World destruction also cleans up ordinary cloned objects that borrow source materials, while keeping the shared source geometry.
2. Small instance pools' matrix uniform arrays were compiled with the `count` from the first draw, and the cache key didn't update as the count grew, so water would show missing blocks after switching chunks. Node compilation now uses `instanceMatrix.count` (pool capacity), while drawing still uses the actual `mesh.count`. A real WebGPU check verified that with 1 instance drawn first and then 800, the shader's matrix array capacity stays at 900.

## Performance Comparison

Same Codex built-in browser, actual CSS viewport 878 × 718, DPR 1.1, seed `20260608`, player fixed at `[12.8, 3, 12.8]`, waiting 5 seconds after 9 chunks load, sampling every 2 seconds for 7 samples. The pre-optimization numbers come from a separate source copy at HEAD, with only the same statistics and input freezing added. CPU, GPU, and frame interval use the sample median.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Water instances | 46,656 | 8,160 | −82.5% |
| Water meshes | 54 | 13 | −75.9% |
| Terrain materials of the same kind | 9 | 1 | shared across slots |
| Whole-frame draw calls | 372 | 280 | −24.7% |
| Whole-frame triangles | 43,594,711 | 28,317,791 | −35.0% |
| CPU frame work | 6.00 ms | 3.50 ms | −41.7% |
| GPU time | 6.03 ms | 5.44 ms | −9.8% |
| Frame interval | 16.70 ms | 16.70 ms | ≈ 60 FPS |
| Renderer-reported memory | 122,816,890 B | 111,771,649 B | −9.0% |

Triangles and draw calls cover whole-frame passes including the main scene, shadows, and others. Memory is Three's resource estimate, and GPU time is a short local sample; these results don't prove higher frame rates or equal gains on all devices. Expanding warmup coverage keeps more prepared resources around, and geometry/texture counts alone don't indicate leaks.

Raw data: [performance samples](rendering-optimization-metrics.json). In one startup, warmup took about 3.22 s and total initialization about 3.42 s; warmup moves compilation earlier, but there is still a startup wait cost.

A same-scene check with water shadows off further cut draw calls from 280 to 267 and triangles from 28,317,791 to 26,914,271. Shadows stay on by default to preserve the current 3D look of water bricks, and can be chosen in Materials as the visuals require. [Shadow toggle data](rendering-optimization-water-shadows.json)

## Verification Log

- `pnpm build` passed; Vite still warns that the main bundle exceeds 500 kB.
- Added 27 regression tests covering instance bounding volumes, instance pool capacity, shared materials, cache isolation, resource deduplication disposal, late callbacks, startup failure, async cancellation, and post-processing destruction.
- Full `pnpm test`: 213 tests, 203 passed, 10 failed. Before the changes it was 186 tests, 176 passed, also 10 failed. The pre-existing failures are `aircraftInput` (3), `environmentShadowFollow` (1), `prefabInstanceColorConfig` (2), TiltShift defaults/ranges (2), and `worldCameraFollow` (2); this round didn't change any of those existing behaviors or assertions.
- The real flight path was W for 16 s, A for 0.8 s, W for 12 s, covering about 57 chunk builds, ending from center `[0, 0]` to `[4, 4]` with 9 slots still loaded. Re-checked the coastline, highlands, edge prefabs, the forest-to-autumn-forest transition, and the spots where water used to show missing blocks. [Flight snapshot](rendering-optimization-flight.json)
- Five rounds of World creation, real rendering, and destruction, sampling each time while the renderer was still alive, returned to the same resource baseline: 80 attributes, 1,930,356 B of attribute data, 4 uniform buffers, 4 programs, 38 geometries, 15 textures, and 3 render targets. At that point Resources and Environment still held the required source assets and environment maps. Destroying the Experience then releases those consumers, and the renderer finally destroys its own internal resources. [Lifecycle data](rendering-optimization-lifecycle.json)
- Switching the output image after the first post-processing frame, actually drawing, and re-attaching passed the check; all 12 render targets owned by the original image were released. Keeping alpha in the vignette stopped the page background showing through, and the picture is sharp again after TiltShift is turned off. [Post-processing switch screenshot](rendering-optimization-postprocessing.jpg) Required brick model load failure completed cleanup, and after an optional water noise texture failed, 9 chunks started normally.

Reproducible browser check: start `pnpm dev`, open `/dev/rendering-validation.html#debug`, and click **Run rendering checks**. It verifies the actual WGSL array capacity, five rounds of World cleanup, post-processing switching/re-mounting, and load-failure cleanup; it deliberately requests two missing resources, and the corresponding console errors are expected by the test.

## Follow-up Measurement Priorities

This flight's maximum chunk build was about 26.2 ms, over the 60 Hz single-frame budget. The Performance panel already records generation, placement, AO, and instance population times separately, which can guide per-frame builds or Worker optimization. Current verification covers one flight path and local WebGPU; long flights, first entry into every biome, and high-percentile frame times on different GPUs still need dedicated stress tests.

When upgrading Three, re-run the browser check page: object resource cleanup, fixed matrix array capacity, and intermediate RTT release depend on verified r185 internals.

![Game and Performance panel after optimization](rendering-optimization-flight.jpg)
