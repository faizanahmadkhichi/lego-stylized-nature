# Landmark Buildings: Model Asset Plan

New agents should start with the full production and integration workflow: [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md). It covers the current Blender pipeline, user-model protection rules, terrain/warmup/animation implementation notes, and acceptance commands.

## Current Status

- Removed: the procedural desert stone ring, site-selection/reserved-area logic, discovery save data, map markers, discovery sound effects, and the dedicated preview/tests.
- Kept: the original biome-color large-grid terrain placeholders, dissolve, column-by-column rise, glass UI, minimap, and existing sound effects.
- `biome-concepts-v1.png` is the first version of the mood and silhouette concept board for the seven biomes, generated with the built-in imagegen. It is not in-game footage and not a model delivery standard; some local details are still too dense.
- `desert-sun-gate/` holds four separate white-background reference images of the simplified desert building: front / left / back / right. The front and back designs are intentionally symmetric; the left and right sides were unified in silhouette in a second pass. The images express design intent — they are not precise engineering views rendered from a single 3D model.
- The other six buildings do not yet have their own multi-view sets; they should be made once the concept direction is settled.
- The desert building is now modeled directly in Blender; the finished model and actual render previews live in `../../art/landmarks/desert-sun-gate/`. The first version is a Sun Gate with 5,580 triangles, 4 materials, and no textures; the GLB is 322,804 bytes. The Blender file keeps per-part vertex groups; the game does not assemble the building at runtime.
- The Sun Gate is integrated into the default chunked world: `public/model/landmarks/desert-sun-gate.glb`. With the default seed, the first usable location is approximately world `(21.66, 79.4)`, chunk `(1, 5)`. `/dev/sun-gate.html` jumps straight to this location in the same game world.
- Implemented: full footprint validation, local platform with outer-ring falloff, vegetation avoidance, worker data consistency, shared-model and real pooled-object warmup, and a whole-model dissolve entrance once the terrain is stable. The Tripo workflow is kept as a record of the earlier plan; the current desert asset does not use Tripo, and the other biomes' models are not yet integrated.

## Current Runtime Integration

- `src/world/landmarks/landmarkConfig.js` stores asset measurements and default placement/animation parameters, and `WorldConfig.landmarks` exposes the editable config. The target height defaults to 7.6 world units, and the gate opening clears the default 5.5 flight height.
- `landmarkPlacement.js` only handles terrain and placement. One candidate per 3×3 chunk area; it rejects water, shores, lava, terrain mixed with volcano, or excessive height differences. The platform and blend edges never extend into a neighboring chunk's halo.
- `LandmarkRenderer.js` only instantiates loaded GLBs. Each slot pre-allocates four instanced meshes, and the whole world reuses the source geometry and four opaque node materials; nothing assembles models at runtime or downloads them twice.
- `LandmarkPipelineWarmup.js` compiles and actually draws the same pooled objects during the loading screen, then restores state once the main/shadow draw-prep queues finish. The same mask used for the entrance dissolve is applied to both the main view and shadows.
- The model is imported via `src/assets/sources.js` and loads with the startup assets; if the model is missing, a resource-load failure is shown — it never silently leaves an empty platform in the desert.
- Tested: placement, platform, neighboring-chunk halo, worker packaging, vegetation avoidance, model gate opening, pool reuse, resource release, and warmup restore. Live-scene checks cover the entrance and base placement; this is not a guarantee of zero stutter on every device.

## Unified Art Rules

Shared rules: large brick scale, light bevels, matte plastic, low-frequency color blocks, and a few studs. Get the silhouette and negative space right from the gameplay camera first, then add details. Each building uses 3–5 main colors; avoid thin railings, dense brick seams, floating parts, and supports faked with textures alone. A monumental look comes from height, proportion, and open foreground — not from endlessly enlarging the footprint.

| Biome | Building Direction | Defining Silhouette | Placement |
| --- | --- | --- | --- |
| Forest | Giant tree lookout dwelling | Thick trunk, layered large canopy, embedded house | Rock-platform base, roots cover the base seam |
| Autumn woodland | Windmill granary | Four wide blades, stepped red roof | Gentle terrace; if the windmill should spin, make the blades a separate object with a hub pivot |
| Desert | Sun Gate | Heavy buttresses, octagonal through-hole, teal sun emblem | Dry flat ground, low stepped base blending into the surrounding sand slopes |
| Snow | Polar lighthouse | Pale tall tower, deep-blue lamp room | Load-bearing rock platform, snow only around the base |
| Volcano | Black-rock observatory | Heavy dark base, copper geometric dome | Stable rock platform, away from lava and active channels |
| Grassland | Balloon expedition station | Geometric balloon envelope, short wide docking tower | Open meadow; the balloon's attachment must work in the model itself |
| Wetland | Waterside inn | Wide-eaved layered roofs, thick support piers | Building floor above the water, piers extending to the riverbed |

## From Concept Art to Model

1. Review the building's silhouette, scale, and colors against its terrain. Do not hand the concept art's terrain, lighting, and plants to the model generator along with the building.
2. Settle on one clean hero view, then derive separate front / left / back / right views of the same building. Keep the crop, building height, colors, and structure consistent; never feed the seven-cell concept board as a single model input.
3. Check the roof steps, gate opening height, base thickness, side depth, and decoration placement. If side views conflict, fix or discard them — never force conflicting views into Tripo. A white-background image is not the actual low-poly mesh; check the triangle count after generation.
4. Generate a single building with Tripo. The current Blender generation interface only exposes a single-image parameter; to use full multi-view, use Tripo Studio's multi-view flow or a future multi-view API — do not claim the single-image interface already uses all angles.
5. Export a GLB with materials. When the user decimates, prioritize keeping the gate opening, silhouette, load-bearing structure, and roof layering; the building should carry its own low base and not drag along a whole landscape.
6. After import, the code normalizes size, orientation, and the foot origin, checks normals/materials/bounds, and renders four-way previews of the actual model to compare against the design. Splitting moving parts (e.g. the windmill) and setting pivots can be done at this stage.

Tripo officially requires multi-view inputs to show the same object with matching style, scale, and lighting, and to avoid extreme pitch angles:
https://www.tripo3d.ai/help/features/how-to-use-multi-view-input-effectively

The API's multi-view structure must map front / left / back / right per the specific version; do not pass a composite image as four inputs:
https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/p

## Grounding Plan (Code Side)

- Each asset gets a small config: model path, biome, target height, real footprint outline, entrance/passage range, ground contact point, allowed base burial depth, slope/height-difference limits, orientation, and spacing. The appearance stays in the model; the runtime never assembles buildings.
- Placement is determined by the world seed and region coordinates, not by load order. Check the whole base and entrance area — never sample only the model center height. If the terrain doesn't fit, switch to another candidate instead of sinking the whole building to hide clipping.
- The first version prefers gentle sites. The model base connects to a small local platform, with the outer ring using the same biome's natural slopes; only a small part of the base may be buried in the terrain — the gate opening, steps, and main body must never be swallowed by it.
- If flattening is needed, apply a deterministic world-coordinate platform rule before generating the terrain surface, AO, and vegetation — never reshape terrain ad hoc after the model appears. When a footprint spans chunks, neighboring chunks read the same reserved/flattening rule.
- Leave a clear passage at the entrance; ordinary vegetation and rocks avoid the building outline with a buffer distance. The flight opening must be checked against the actual plane width and flight height.
- Wetlands handle water level and riverbed separately; piers may extend downward, with the floor kept clear of the water surface. Land buildings do not use this rule.

## Loading Plan (Code Side)

- Low polygon count alone does not promise zero stutter. Also control material/submesh counts, texture sizes, first shader compilation, GPU uploads, shadows, and on-screen count.
- Request assets before the player reaches display distance; share the load Promise, geometry, and textures per model path. Re-entering a chunk never re-downloads or re-decodes the same model.
- Model download/parsing, GPU resource preparation, and display happen in stages; limit concurrent decode/upload/compile tasks so multiple landmarks don't all initialize for the first time in the same frame.
- Use the matching decoder for supported compression formats; don't add uncontrolled first-decode cost just to shrink file size. Prepare a low-detail version and a way to reuse textures across the same material.
- Terrain keeps its original column-by-column rise. The whole GLB is never stretched or split into voxel columns: once the base's terrain is stable and the model is ready, the building rises/dissolves in as a whole over a short distance. If segmented rising is ever required, the model must keep explicit groups.
- While an asset isn't ready, the terrain still unfolds normally; the building's location keeps a low-cost outline or appears later with a soft fade — never block the whole terrain waiting for a building.
- Set a budget for the model cache and share references; recycle instances on repeated entry/exit without releasing materials/textures still referenced by other instances. Long-distance exploration needs a cache eviction mechanism.
- On target devices, separately test first entry, revisits, crossing several regions in a row, quick turnarounds, and cold cache. Check frame-time spikes, draw calls, texture/geometry memory, and first-display wait; set budgets from the measurements.

The user mainly delivers a decimated GLB once the design is approved; material cleanup, compression, grounding, warmup, caching, and entrance handoff are handled during project integration. Get one desert model working end to end before batch-integrating the other six.
