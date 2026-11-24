# Investigating Occasional Long Frames (2026-10-16)

## Sampling Method

- Needle MCP: performance report, WebGPU timer queries, per-frame render graph, and console errors for the current `localhost:5173` page.
- Standalone Chrome/WebGPU page: 1280×800 window, `#debug`, waiting for the initial nine chunks and the render preparation queue to finish; idle for 1.5 s, fly along the X axis at 8 world units/s for 12 s, then stop for 2 s.
- Timed the node build/bind/upload methods of `ChunkManager`, vegetation building, and the renderer. The CPU numbers below include timing instrumentation overhead and are not the same as the user experience without instrumentation.
- Page frame time comes from consecutive frame timestamps; it is not the same time window as the current `update()` duration in the same record.

## Confirmed Hotspots and Fixes

### 1. New terrain and liquid meshes bypassed async shader preparation

The render preparation gate used to accept only `streamingPrefab`. When terrain instance capacity grew, water pages were first allocated, and similar cases, new objects went straight into synchronous node building.

In the flight baseline, synchronous `getForRender()` builds peaked at **47.4 ms**, with the frame's main-thread `update()` reaching **84.6 ms**. That frame also ran 13.4 ms of chunk population, 1.8 ms of animation capture, and 3.6 ms of vegetation building.

Terrain, water, and lava are now tagged as `streamingChunk`, sharing the existing chunked building and async pipeline preparation of real main/shadow RenderObjects. The first draw waits for preparation to finish, so new meshes may appear later. Normal drawing after preparation and the failure fallback are unchanged.

After two rounds of changes, flight samples showed no more synchronous `getForRender()` builds, the preparation queue had no failures, and the browser showed no errors.

### 2. Chunk and vegetation tasks stacked in the same frame

The Worker already handles terrain generation, placement, and AO, but the main thread still handles unpacking, instance matrix/color population, bounds, and vegetation generation.

Added `chunks.mainThreadBudgetMs` (default 4 ms) so chunk reception and vegetation building share a deadline; later tasks are deferred once it expires. Each frame lets at least one pending terrain task proceed; when an urgent center chunk has already consumed the budget, outer rings are no longer filled.

**This is not a hard per-frame time cap**: a single population still can't be interrupted, and measured chunk population can still reach 15–16 ms. Vegetation building is also still an atomic task.

### 3. Blur input RTT drawn repeatedly

The MCP render graph showed the same full-resolution RTT written three times per frame: outer, horizontal blur, and vertical blur.

Changed that internal RTT to FRAME updates, and pinned `updateReference` to its own render target texture. The latter had to change at the same time: GaussianBlur temporarily replaces the input `.value`, so changing only FRAME would still repeat it once.

Measured in practice, the full pipeline dropped from **8 passes to 6**, and the RTT from **3 writes to 1**; the original blur resolution and effect parameters are kept.

## Results and Remaining Concerns

MCP GPU timing on the original page averaged **7.9 ms** (7.6–8.6 ms), with Scene 3.77 ms and Shadow Map 3.58 ms; that sample doesn't explain CPU long frames above 80 ms.

After the first round of changes, flight CPU peaked at 32.3 ms, and intervals over 33.4 ms fell from a baseline of 46/572 to 30/630. But the final re-test still showed a 74 ms CPU long frame and 50/573 slow frames; that long frame had zero synchronous node building. **This doesn't justify claiming the low frames are fully fixed, or giving a stable overall frame-rate improvement percentage.**

Next priorities:

1. Split single chunk instance/color population and vegetation building into resumable small batches, or have the Worker return directly consumable instance data. AO, color order, animation, and bounds must stay consistent.
2. Collect CPU sampling/GC traces of the remaining long frames to distinguish renderer submission, memory reclamation, driver waits, and background node building. Existing method timing still can't attribute that final 74 ms spike.
3. Shadows take about half of GPU time; a separate shadow LOD can be evaluated later. Current GPU sampling has headroom, so the CPU spikes above take priority.

Note: the MCP overview shows about 2,000 draw calls, but per-pass object counts, GPU sampling, and the renderer's actual frame count are about 427–430; the counting methods differ, so the overview number wasn't used directly as evidence of a bottleneck.

## Verification

- Chunk scheduling and render preparation regressions: 49 passed; related post-processing regressions: 6 passed.
- Production build passed; WebGPU real-device flight showed no console errors, and the preparation queue eventually emptied.
- Full test suite, 348 tests: 338 passed, 10 failed. These pre-existing failures (input keys, spawn biome, coloring, render config, camera mock, etc.) were reproduced with a separate copy at HEAD.
- Also fixed the render preparation test mistakenly importing the uninstalled `vitest`, making it use the project's `node:test`; the HEAD baseline additionally had this test failing to load.
