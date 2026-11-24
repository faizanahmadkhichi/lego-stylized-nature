# Workflow for a New Agent: Blender Low-Poly Landmark Modeling and Game Integration

Applies to project: `D:\workplace\lego-stylized-nature`.

Goal: build recognizable, editable LEGO-style low-poly buildings, deliver Blender source files and GLBs, then integrate the same model into real biome terrain — placement, entrance, preloading, and verification. Use the completed desert sun gate as reference.

## 1. Confirm which stage the task is in

| What the user already has | Start from |
| --- | --- |
| Only a building idea | Concept and silhouette design |
| Approved concept art | Blender modeling |
| Approved Blender model | Export and asset checks |
| GLB provided or fixed and imported | Check the GLB in the project directly and go to game integration |

The user's most recent choice is **modeling directly in Blender**. Earlier attempts tried procedural brick-built buildings and Tripo; the former had poor visuals and maintenance cost, the latter generated oversized models. Unless the user specifies otherwise, don't switch back to those approaches.

The user has stated clearly: **the wall z-fighting comes from duplicate faces in the Blender model; the user has fixed it and imported the GLB into the project. Later agents must not touch that model or overwrite it again.** Current integration should use `public/model/landmarks/desert-sun-gate.glb` first.

`build_model.py` only produces a baseline; it does not represent the user's fixed, latest model. During integration, never run it to "sync assets" and then copy the export over the user's GLB. If the source file and the published file differ, record the difference first; only ask the user when you genuinely need to know which version to continue with, and keep other work moving.

## 2. Before starting work

1. Read the repo's `AGENTS.md`, check `git status`, and identify what the user has modified, staged, and left untracked; don't reset or stage everything in bulk.
2. Check `.codegraph/`. If it exists, use `codegraph_explore` to understand or locate code first; read files directly only for files it doesn't cover or results that are clearly stale. If it doesn't exist, skip it — don't index it yourself.
3. Read the current `WorldConfig` and rendering implementation. Old notes in the repo may be outdated; don't assume from old notes that post-processing is off or that an old Three API is in use.
4. Give the user a short progress note first, and report actual findings regularly while working. Independent tasks such as art checks, terrain siting, and resource warmup can be arranged in parallel, with clear file ownership for each.
5. This workflow does not require creating a separate chat, commit, push, or deploy; act only within what the user actually authorized.

## 3. Concept design: one style, distinct silhouettes

Shared rules: large brick blocks, light bevels, few studs, matte plastic, clear color blocks. Make the silhouette work from the game camera first, then add detail; each building uses about 3–5 main colors. Grandeur comes from proportion, layering, and open foreground — not just a bigger footprint.

| Biome | Current building direction | Most important silhouette feature |
| --- | --- | --- |
| Forest | Giant-tree lookout home | Thick trunk, layered canopy, house embedded in the tree |
| Autumn forest | Windmill granary | Four wide blades, stepped red roof |
| Desert | Sun gate | Heavy buttresses, octagonal opening, teal sun emblem |
| Snow | Polar lighthouse | Pale tall tower, deep-blue lamp room |
| Volcano | Black-rock observatory | Dark heavy base, copper geometric dome |
| Grassland | Balloon expedition station | Geometric balloon, wide docking tower |
| Wetland | Waterside inn | Wide layered eaves, thick support piers |

- If new concept art is needed, use the available imagegen skill; read its `SKILL.md` first and tell the user. Images the project will use are saved in the workspace, with the prompt recorded.
- First draw the building in its terrain, checking proportion and color. Concept art is not a stand-in for in-game results or a polygon-count promise.
- When modeling references are needed, generate clean-background, single-building standalone views. Front, side, and back must show the same structure; if a contradiction appears, fix it — don't mix different designs as one model.
- Once a Blender model exists, render multiple angles from that same model for truly consistent references. Don't use separately generated images as accurate side views of the model.
- An approved design doesn't need to be re-generated. Existing concept boards and prompts are in other files in this directory.

**Acceptance for this stage:** the building is still recognizable when shrunk to common in-game viewing size; supports, entrance, back, and depth are sensible; the user can see a concrete, reviewable result.

## 4. Building low-poly assets in Blender

### 4.1 Connect and protect the scene

- First call Blender's `get_addon_status` and `get_scene_info` to learn the current file, objects, mode, selection, and available capabilities, then use `look` to see the scene.
- Model with bpy via `execute_blender_code`; the tool's required `user_prompt` uses the user's own words — don't replace it with the agent's own subtask description.
- Create your own named collections, e.g. `<Landmark>_Asset` and `<Landmark>_Studio`. Don't clear the scene, delete user objects, install plugins for the user, or call paid generators.
- Read the API notes returned at the time before calling tools; enums, render engines, and export parameters follow the actual Blender version. Find material nodes by node type, not by localized names.

### 4.2 Geometry and materials

- Build the main silhouette from a few large blocks, add real thickness and necessary supports; a doorway that must pass through has to be a real hole.
- Prefer 1-segment small bevels; use low-edge-count cylinders for studs, concentrated on a few visible tops. Control geometry first, then consider decimation.
- Prefer flat-color materials with few material slots; don't turn brick seams, railings, and studs all into dense geometry.
- Model moving parts separately with correct pivots. Static buildings can be merged, keeping part vertex groups for editing.
- Avoid coplanar duplicate faces, hidden duplicate faces, wrong normals, and floating supports. In-game flicker may be duplicate faces or a shadow issue; identify the cause first — don't hide it with offset parameters.
- As a starting point, budget a typical landmark at about 3k–8k triangles, adjusting for the design and target device. This is a design starting point, not a hard cap for every building.

### 4.3 Export and measurement

- The model's bottom center is the origin, with the base's lowest point at ground level; apply needed transforms and record the front and up directions.
- Current sun gate: Blender `+Z` up, `-Y` front; after GLB export, `+Y` up, `+Z` front. New assets must be checked in practice — don't blindly apply this.
- Export only the building selection. Studio floor, lights, and cameras don't go into the GLB; don't bind a whole landscape terrain to the building.
- Save the `.blend`, `.glb`, real render previews, and asset notes. After the user edits the model, keep their latest files; don't overwrite them with a rebuild script.
- Measure the exported triangle count, glTF primitives, materials, textures, byte size, and bounding box. One Blender mesh does not equal one draw call; multiple materials usually split into multiple primitives.
- If obvious duplicate faces exist, "zero non-manifold edges" alone doesn't prove the asset is clean; also check multi-angle renders and actual in-game footage.

Sun gate's original delivery baseline: 5,580 triangles, 4 materials/primitives, no textures, about 315 KiB; source size about `12.8 × 7.85 × 11.47`. These are measurements for that version; new models or user-fixed versions need remeasuring.

**Acceptance for this stage:** front, side, and angled views all hold up; no obvious intersections/flicker; doorways or moving pivots are correct; the source file is editable and the export loads standalone.

## 5. Organizing assets and code responsibilities

Recommended directories; new buildings replace `<asset-id>` and don't overwrite the sun gate:

```text
art/landmarks/<asset-id>/          Blender source files, production sources, real previews, measurement notes
public/model/landmarks/<asset-id>.glb
src/world/landmarks/              config, siting, model instances, and warmup
src/dev/<asset-id>.html/.js        real-world verification entry
test/                            meaningful integration regression tests
```

Existing integration points:

| File | Responsibility |
| --- | --- |
| `src/assets/sources.js`, `src/utils/Resources.js` | Startup resource loading, failure handling, and source resource release |
| `src/world/landmarks/landmarkConfig.js` | Asset IDs, measured sizes, siting, and entrance parameters |
| `src/world/landmarks/landmarkPlacement.js` | Deterministic candidates, full site checks, platform, and reserved areas |
| `src/world/terrain/TerrainGenerator.js` | Hooks platform deformation in before classification, AO, and instance generation |
| `src/world/chunks/chunkBuildData.js` | Worker packing/unpacking of landmark metadata |
| `src/world/prefabs/PrefabPlacer.js` | Vegetation and ordinary object avoidance |
| `src/world/landmarks/LandmarkRenderer.js` | Instantiating GLBs, reusing meshes, whole-model entrance and visibility |
| `src/world/landmarks/LandmarkPipelineWarmup.js` | Warmup of main/shadow draws for real pool objects |
| `src/world/chunks/ChunkRenderSlot.js` | Terrain and landmark lifecycle, animation handoff |
| `src/world/chunks/ChunkManager.js` | Fixed chunk pool, worker request config, and updates |
| `src/world/world.js`, `WorldConfig.js` | Resource ownership, init, config, warmup, and disposal |

Appearance stays in the Blender/GLB; game code handles loading, transforms, placement, and animation. Before adding the next landmark type, check whether existing modules only support the sun gate: the current `SUN_GATE`, resource selection, and "one instance per chunk" constraints need to be extended for actual new requirements — don't claim support for all biomes just by swapping the model path.

## 6. Deterministic siting and terrain handoff

1. **Determine candidates from the world seed and region coordinates.** Don't depend on chunk load order or current neighbors; use proper floor for negative coordinates. The current sun gate has one candidate per 3×3 chunk region — that doesn't mean every candidate is accepted.
2. **Scale by the real model size first, then compute the rotated footprint.** Include the base, steps, front and back entrances, vegetation buffer, and platform transition zone; a 90° rotation needs the long and short axes swapped.
3. **Check the full extent.** Reject unsuitable biomes, water, shores, lava, or excessive height differences. Sampling only the center or four corners is not enough; small ponds inside the area must also be detected.
4. **In the first version, keep the full deformation range inside a single chunk and avoid neighboring chunks' halos.** If it doesn't fit, reject it or redesign the scale — don't let boundaries silently break. If cross-chunk is genuinely needed later, all affected chunks must use the same world-coordinate rules, including halos.
5. **Check the original terrain before flattening.** Form a flat area inside the base, smooth the transition ring outside, then regenerate final surface classification, slope, AO, and terrain instances. Don't change terrain after the building is already showing.
6. **Align the base to the real brick top.** Current brick instances translate by `height * layerHeight`, with the brick geometry top having an additional offset — don't assume `(height + 1) * layerHeight` directly. The current offset, measured from the actual `brickGeometry.boundingBox.max.y`, is about `0.12`, and is passed to the worker.
7. **Leave room for entrances and surrounding vegetation.** Terrain must not swallow steps or doorways, and ordinary objects must not grow into the building. Check aircraft passage by ray/bounding-box against actual flight height and width.
8. **Keep the main thread and worker consistent.** Requests pass the relevant `chunks` and `landmarks` config; packing/unpacking keeps the plain `terrainMap.landmarks` description, with consistency tests for terrain, placement, and AO.

Wetland buildings need separate water-level, riverbed, and pier rules; volcano buildings need a stable rock platform check. Don't apply the desert flattening plan to other terrain unconditionally.

## 7. Loading, warmup, and resource ownership

- Small models can load with startup resources and wait for ready; the sun gate currently does this. As assets grow, switch to batched prefetching based on startup time and memory budget — don't expand the startup-required resource list without limit.
- Multiple instances share source geometry and materials; when a chunk is recycled, only update matrices, counts, and state — avoid re-downloading, re-parsing, re-allocating, and re-compiling.
- The sun gate uses a fixed chunk pool, with each slot pre-allocating 4 instance meshes. The mesh count and instance capacity of the next asset must come from the actual GLB and scene needs — don't hardcode "every model is 4".
- **In WebGPU, compiling a temporary substitute mesh is not the same as warming up the real object.** Current Three r185 has per-object RenderObject, binding, and shadow caches; warm up the real pool objects and keep their identity.
- During warmup, temporarily set visible, `count=1`, a non-zero reveal value, and a safe transform, then run compile and real draws. Wait for the main/shadow preparation queues to drain first, then restore visibility, matrices, counts, bounds, and reveal values.
- State must be restored on both normal and abnormal completion; don't hide an object before its queue has finished, or tasks may be cancelled.
- When this project calls the warmup helper, `renderFrame` must perform a render and wait for `Renderer.prepareVisiblePrefabs()`. These are current r185 adapter details; recheck after upgrading Three.
- Ownership is explicit: Resources owns source GLB geometry/source materials; the landmark asset layer owns the shared node materials it creates; the slot owns instance buffers. Recycling one instance must not release shared resources still used by other instances.
- Low polygon count doesn't guarantee no hitches. Also check materials, shadows, texture uploads, first-time compilation, atomic main-thread tasks, and on-screen counts — don't substitute one nice screenshot for performance verification.

## 8. Animation: keep terrain rising column by column, buildings appearing as a whole

Recommended sequence:

```text
Resources ready / chunk generated
    → biome-color large blocks dissolve in, detailed terrain rises column by column
    → terrain the building depends on stabilizes
    → GLB rises a short distance as a whole + dissolve reveal
    → normal display; on leaving, recycle the instance, reuse on return
```

- Don't hand the whole GLB to the original column-scaling animation, or the building will squash and deform. If a staged rise is wanted, keep suitable groups in the model first and design it separately.
- The current sun gate enters only after the whole chunk's terrain animation finishes: about `0.55s` by default, rising about `0.45` world units; replay, reuse, and disabled terrain animation must all work correctly.
- Reveal should keep opaque depth writing, using a clip/dither mask, to avoid sorting problems with large translucent buildings.
- **The body and its shadow must share the reveal logic.** In Three r185, shadow override materials don't automatically inherit a normal `opacityNode` or `alphaHash`; the current integration explicitly sets the same `maskNode` and `maskShadowNode`, so an unrevealed building doesn't cast a full shadow first.
- Grayscale preview, slot hiding, regeneration, and disposal must all sync landmark state.

## 9. Verification order

### Automated verification

Prefer verifying real contracts over writing tests that only repeat implementation formulas:

- Same seed, different visit order, and negative coordinates give consistent candidates; invalid sites are rejected.
- Base extent is flattened, the base sits on brick tops, the transition zone doesn't affect neighboring chunks' halos; avoidance still works after rotation.
- Worker and main thread agree on landmarks, terrain, placement, and AO.
- Load the published GLB for real and measure its bounding box; check the doorway at the default aircraft height.
- The building waits for terrain to stabilize, the whole transform doesn't deform; animation disabled and replay work correctly.
- After round trips/teleports, the same landmark is restored, with stable pool object counts and identities.
- State is restored when warmup ends or fails; destroying an instance doesn't wrongly release shared resources.

This project uses pnpm; when dependencies need installing, run `pnpm install --frozen-lockfile`. The lockfile of record is `pnpm-lock.yaml`.

```powershell
node --test test/sunGatePlacement.test.js test/landmarkRenderer.test.js test/landmarkPipelineWarmup.test.js test/chunkRenderSlot.test.js test/chunkColumnTransition.test.js test/chunkManager.test.js test/chunkBuildData.test.js test/natureBiomes.test.js test/voxelTerrainPlaceholder.test.js
pnpm build
git diff --check
```

This combination passed 78 tests at the time of this delivery; it is not a permanent promise about future state or the whole repo's tests. Before adding tests, check `.gitignore` — this repo ignores `/test/*` by default, so add exceptions for tests that should be delivered.

### In-game verification

1. Enter the real world first, then look at the building. A pure model viewer can't prove terrain, shadows, or chunk streaming are correct.
2. Use the available browser tools for checks, without bypassing their interaction rules. After changes, refresh and read the current page state and errors from the current time window; the console may retain earlier failure records.
3. Check the full process from distant view to terrain to building; fly past the building from different directions, checking the base, sides, back, and doorway, and verifying pause/resume and entrance replay.
4. Verify first entry, revisits, fast turnarounds/teleports, disabled terrain animation, and clear feedback when resources fail.
5. Check that the preparation queue drains, whether it fails, and record peak or percentile frame times on the target device; don't report only average FPS.
6. Save real in-game screenshots and show them in the final reply. Keep the preview page for the user operable, with start flight, pause, and return-to-entrance.

Current live-scene entry: `http://127.0.0.1:4173/dev/sun-gate.html`. Start it when needed with:

```powershell
pnpm dev --host 127.0.0.1 --port 4173 --strictPort
```

This is a naturally valid site at the default seed, not a separately built showcase terrain. World coordinates about `(21.66, 79.4)`; the HUD reads about `X108 / Z397` in terrain cells; chunk `(1,5)`. After changing the seed, model size, or siting parameters, find a valid site again — don't keep hardcoding this location.

Vite root is `src/`, assets publish from `public/`. `/dev/` sub-pages must handle relative asset paths, e.g. `<base href="/">` with an explicit script address, to avoid GLB requests landing on `/dev/model/...`, receiving HTML, and producing JSON parse errors. A dev preview does not mean the production build includes that HTML page; production integration is the main game code's job.

The current preview disables motion blur for easier inspection of the tall building; the main game keeps its own post-processing settings. When reporting screenshots, don't mistake this inspection view's difference for a global image change.

## 10. Delivery

- Update the asset notes and runtime integration notes, marking clearly what is done, what is not yet implemented, and the asset version of the user's later changes.
- List the actual GLB location, editable source file location, naturally valid site or operable preview entry.
- Briefly describe proportion/placement, loading and entrance behavior, and report actual verification results and known limits.
- Don't conflate "the model is built", "the model displays standalone", and "it is correctly integrated into the game world" as the same completion standard.

Example task opening for a new agent:

```text
First read AGENTS.md and docs/landmarks/AGENT_WORKFLOW.md.
Using the existing sun gate as reference, build and integrate <building name> for <biome>.
What already exists: <concept art / Blender model / user-provided GLB>.
Scope this time: <modeling / integration / both>.
Keep the unified brick art style and protect existing assets and user modifications.
After verifying placement, warmup, animation, and round-trip behavior in the real game, deliver the model files, screenshots, and verification results.
```
