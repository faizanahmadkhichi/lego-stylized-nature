# Procedural Prefab Migration Plan

## 1. Goals and Scope

Migrate scene biome prefabs made of simple geometry from GLB to JS procedural generation, prioritizing visual consistency first, then reducing geometry cost; existing placement, tinting (`biomeTints`), and instance color (`instanceColors`) behavior stays unchanged. Silhouette, proportion, thickness, gaps, rounded edges, and material highlights are all part of visual acceptance — don't drop visible features to hit a polygon target.

2026-10-11: the user gave new design requirements for grass: `landGrass` becomes two original LEGO grass designs, short and tall, both on a 1×1 square base; blades are 50% thicker than the first draft. Grass is accepted against this design spec; it does not need to reproduce the old three GLBs' shapes, bounding boxes, or variant counts.

2026-10-11: the user further clarified this round's precision standard for volcano rock, small cactus, and reeds: the objects appear very small in the scene, so keep only the main recognizable silhouette at common camera positions; cut triangles by about 50% or more (remaining no more than half of the original GLB). Don't chase fine reproduction or tiny geometric details; stop unnecessary refinement once the standard is met; transparency rendering, grounding, original colors, placement, and resource release must still be correct. This standard takes priority over the detail-restoration requirements earlier in this document.

**In scope**: geometry-type prefabs in `src/assets/manifests/biomePrefabs.js` (flowers, grass, mushrooms, duckweed, reeds, cactus, dead bushes, volcano rock, bubbles).

**Out of scope** (keep GLB unchanged):

- Organic shapes: `skull.glb`, the three trees (`tree` / `fruittree` / `Ctree`).
- Non-biome prefabs: `legoBlock2x2.glb` (terrain brick), `fly.glb` (player).
- Already light enough ordinary rocks `rock_1~4.glb` (20–34 faces).

**Non-goals**: no per-instance independent geometry, no L-system / noise displacement, no in-shader geometry deformation, no modeling DSL or visual editor.

## 2. Current State Data

### 2.1 Triangle counts and usage density

| prefab id | Source file | Triangles | Placement (biome: density) | Material slots |
|---|---|---|---|---|
| `landFlower` | `flower.glb` | 3452 | forest 0.05, autumnForest 0.0225 | `flower_InstanceColor`, `flower_root` |
| `volcanoRock` | `volcano_rock.glb` / `volcano_rock_2.glb` | 2054 / 1337 | volcano 0.09 (weights 0.3 / 0.7) | `volcano_rock_InstanceColor`, `volcano_rock` |
| `deadBush` | `dead_bush.glb` | 2691 | desert 0.02 | 1 |
| `desertCactusSmall` | `cactus.glb` | 2374 | desert 0.0175 | 1 |
| `waterDuckweed` | `duckweed.glb` | 2052 | forest 0.02, autumnForest 0.0175 (water surface) | 1 |
| `phragmites` | `phragmites.glb` | 1056 | forest 0.015, autumnForest 0.0125 (water surface) | 1 mesh / 3 materials |
| `landGrass` | `grass.glb` / `grass_2.glb` / `grass_3.glb` | 328 / 224 / 719 | forest/autumn 0.06, desert 0.005 | 1 |
| `landMushroom` | `mushroom_1.glb` | 492 | forest/autumn 0.03, desert 0.0025 | `leaf`, `mushroom_InstanceColor`, `mushroom_root` |
| `waterBubble` | `bubble.glb` | 58 | forest 0.0125, autumnForest 0.01 | 1 |

All prefabs have `castShadow = true`; the shadow pass draws them again, so actual vertex processing is about 2× the table above.

Estimated triangles per 1000 cells from "density × triangles": volcano rock ~150k, flowers ~170k (forest), dead bushes ~50k, cactus ~40k, duckweed ~40k (per 1000 water cells). Migration gains concentrate on the top five.

### 2.2 Sizes and origins (measured from GLB bounding boxes, units: world coordinates)

| Source file | Size X×Y×Z | minY | XZ center | Main color |
|---|---|---|---|---|
| `flower.glb` | 0.29×0.21×0.28 | 0 | (-0.05, 0.06) | LegoGreen `#418d4f` (sRGB) |
| `volcano_rock.glb` | 0.13×0.19×0.14 | 0 | (-0.05, 0.05) | `#ff1f06` (opacity=0.7) + `#1e1e1e` |
| `volcano_rock_2.glb` | 0.09×0.10×0.08 | 0 | (-0.05, 0.06) | `#1e1e1e` |
| `dead_bush.glb` | 0.10×0.18×0.08 | 0 | (-0.05, 0.05) | `#8d3b09` |
| `cactus.glb` | 0.10×0.36×0.26 | 0 | (-0.05, 0.05) | Embedded green atlas, simplified to area-weighted average color `#32692f` |
| `duckweed.glb` | 0.14×0.07×0.13 | 0 | (-0.05, 0.06) | `#51b44c` (sRGB) |
| `phragmites.glb` | 0.11×0.30×0.10 | 0 | (-0.05, 0.05) | `#4c7720` `#6b974b` `#b6945d` (sRGB) |
| `grass.glb` / `grass_2.glb` | 0.12×0.18 / 0.15×0.12 | 0 | (-0.05, 0.05) | `#0d5e15` |
| `grass_3.glb` | 0.47×0.21×0.42 | 0 | (-0.05, 0.01) | `#006604` |
| `mushroom_1.glb` | 0.09×0.12×0.09 | 0 | (-0.05, 0.05) | `#cccccc` `#950101` `#58512c` |
| `bubble.glb` | 0.08×0.05×0.08 | 0 | (-0.05, 0.05) | Texture |

### 2.3 Constraints that must be kept

1. **Origin and stud alignment**: `makePrefabTransform` places an instance at the cell center `(x + 0.5) * cellSize`, brick top `(height + 1) * layerHeight`. `cellSize = 0.2` is one 2×2 brick, stud pitch 0.1; source models' XZ centers are all offset to `(-0.05, +0.05)`, landing exactly on one stud, and with `rotationStep = π/2` randomly landing on one of the four studs. Procedural models must be built with `(-0.05, 0, 0.05)` as the bottom center, `minY = 0`.
2. **Mesh naming convention**:
   - Instance color: names ending in `_InstanceColor` (`matchesInstanceColorMesh`).
   - Trees (not migrated this time): names containing `leaf` / `root` (`treeMaterial.js`).
3. **Materials**: `resolvePrefabMaterial` / `resolveInstanceColorMaterial` clone tint materials keyed by source material, so parts of the same color should share one material instance.
4. **Draw calls**: each "variant × mesh × biome bucket" is one `InstancedMesh`, shadows ×1 more. Each prefab variant ≤ 3, usually mesh ≤ 2; mushrooms and reeds keep their three original materials, using 3 slots.

## 3. Technical Approach

### 3.1 Integration point: only change `PrefabRegistry`

`PrefabPlacer.build()` and `PrefabPipelineWarmup` both get models only through `prefabRegistry.getVariantAsset(id, i)?.scene` and iterate meshes. A builder function returns a `THREE.Group` with the same structure as `gltf.scene`, so downstream needs zero changes.

Manifest variants gain a `builder` form, coexisting with `source`:

```js
landFlower: {
  category: 'flora',
  placement: { surface: 'land', biomes: ['forest', 'autumnForest'] },
  variants: [
    { builder: 'flower', weight: 0.5 }
  ],
  randomRotation: true,
  instanceColors: { meshNameSuffix: '_InstanceColor', palette: [/* unchanged */] }
}
```

`PrefabRegistry` changes (about 20 lines):

```js
getVariantAsset(prefabId, variantIndex) {
  const variant = this.manifest[prefabId]?.variants[variantIndex]
  if (!variant) return null
  if (variant.builder) return this.getBuiltAsset(prefabId, variantIndex, variant)
  return this.resources.items[variant.source]
}

getBuiltAsset(prefabId, variantIndex, variant) {
  const key = `${prefabId}:${variantIndex}`
  if (!this.builtAssets.has(key)) {
    const build = prefabBuilders[variant.builder]
    this.builtAssets.set(key, build ? { scene: build(variant.params) } : null)
  }
  return this.builtAssets.get(key)
}

dispose() { /* iterate builtAssets, release geometry and material */ }
```

Lifecycle: GLB geometry belongs to `Resources`; procedural geometry belongs to `PrefabRegistry` and must be released by calling `prefabRegistry.dispose()` in `World.dispose()` (currently `world.js` only sets it to `null`).

### 3.2 File structure

```
src/world/prefabs/builders/
  index.js            // export const prefabBuilders = { flower, volcanoRock, ... }
  legoUnits.js        // terrain grid sizes, measured studs, prefab origin
  legoColors.js       // builder named color palette
  prefabParts.js      // geometry parts, makePrefabScene
  flower.js
  volcanoRock.js
  ...
```

### 3.3 Shared utilities `prefabParts.js`

- **Unit constants** (terrain is true LEGO scale: a 2×2 brick = `cellSize`, brick height ≈ 1.2 × stud pitch):
  - `STUD_PITCH = cellSize / 2 = 0.1`, `BRICK_HEIGHT = layerHeight = 0.095`, `PLATE_HEIGHT = layerHeight / 3 ≈ 0.032`.
  - Measured stud radius `STUD_RADIUS = 0.035`, height `STUD_HEIGHT = 0.019`; the brick's visible top face is about 0.006 above the prefab origin, the stud top about 0.025.
  - `PREFAB_ORIGIN = [-0.05, 0, 0.05]`.
- **Phase 1 part API**: `cylinder({ radius, height, segments, top, bottom })`, `box({ width, height, depth, bottom })`, `flowerPlate({ outerRadius, innerRadius, height, petals })`, `stud()`. Sizes use world coordinates, built from the bottom at `y = 0`; plate height and stud sizes come from `legoUnits.js`; add LEGO-unit wrappers later as needed.
- **`stud()`**: currently defaults to a 6-segment open-bottom cylinder, 18 faces; increase segments or add small bevels as silhouette and highlight needs require — not limited to 6–8 segments.
- **`makePrefabScene(slots)`**: input `[{ name, color, parts: BufferGeometry[] }]`, at most two slots. Before merging, use independent Float32 `position` / `normal` buffers, no `uv`; compute normals when missing, run `mergeVertices` on non-indexed geometry to keep index and attributes consistent. Each slot merges into one mesh, the whole thing translates to `PREFAB_ORIGIN`, and returns a `THREE.Group`. The function takes ownership of temporary parts and releases them after merging; returned resources belong to the registry.
- **Slot materials**: based on `createLegoMaterial()` (`src/materials/tsl/legoMaterial.js`, same Physical + clearcoat/sheen parameters as terrain bricks) with colors set. Since same-color parts are already merged into one slot, one material instance per slot satisfies constraint 3 — no global color cache needed; materials belong to `PrefabRegistry` with the build result and are released by it. `resolvePrefabMaterial` / `resolveInstanceColorMaterial` use `clone()`, so the plastic parameters carry over.
- **Palette**: builders only take colors from the named palette, never writing hex directly.

### 3.4 Builder function contract

- Pure functions: `build(params) => THREE.Group`, same params give same result, no random numbers read (variety comes from the manifest's multiple variants and instance rotation/colors).
- Prefer primitives or simple custom geometry; segment counts follow the reference model and actual camera positions — arc subdivision, thin-stem segments, sphere subdivision, and small bevels can be increased.
- Parts are `rotate*` / `translate`d into place before being handed to `makePrefabScene`.
- Style vocabulary is LEGO parts: round plates, bricks, cones, plant leaf pieces, studs; reproduce the reference model's visible shape — vertex layout need not match.
- Rounded visible edges use geometric bevels and suitable normals as needed; AO and clearcoat work together with the geometry.

### 3.4.1 Triangle rules

- **Remove confirmed-invisible faces first**: bottoms/caps that sit on the ground or are fully covered can be removed; bottoms and joints visible from water, gaps, or angled views must be kept.
- **Choose segment counts by appearance**: current default segments are only a starting point — round plates can use 12–24 segments, thin stems 6–8; keep increasing when close-up silhouettes or highlights need it. Don't replace a reference model's rounded features with a low-segment polyhedron.
- Don't keep `uv`; geometry stays indexed.
- Parts of the same material merge into one mesh, usually ≤ 2 slots per variant (normal + `_InstanceColor`); mushrooms and reeds use 3 slots to keep their three original materials.
- Optional: small ground cover (duckweed, grass, bubbles) can disable shadows, halving shadow-pass vertex count. This needs a `castShadow` field added to the manifest and replacing the hardcoded `castShadow = true` in `PrefabPlacer` / `PrefabPipelineWarmup`, as a separate commit.

### 3.5 Reference triangle budgets (adjustable)

Adjusted 2026-10-10 per user request: visual consistency first; the numbers below are initial reference budgets, not hard test limits, and there's no requirement to use up the remaining allowance. When exceeding a reference value, record the visible detail kept and the same-camera scene cost, then decide whether to simplify further. Automation only checks that models are non-empty, below the original GLB triangle count, and meet index/mesh structural constraints; it doesn't guarantee large triangle reductions or visual consistency. Draw calls and frame time still need real checks.

| prefab | Original GLB | Reference budget | Build approach |
|---|---|---|---|
| `landFlower` | 3452 | 600 | Keep three flowers, leaves, and studs; add rounded petals, stems, and edges following the reference silhouette; currently 206 faces |
| `volcanoRock` variant 0 | 2054 | 500 | Keep the chamfered rectangular base, stepped rock body, and staggered translucent crystal columns; at crystal cluster overlaps keep only the continuous outer shell to avoid repeated color blending from transparent inner faces |
| `volcanoRock` variant 1 | 1337 | 300 | Keep the original rock body's volume proportions, silhouette, and main cut faces |
| `deadBush` | 2691 | 500 | Keep the branching topology and branch thickness variation, subdividing joints as needed |
| `desertCactusSmall` | 2374 | 600 | Square-brick trunk, L-shaped side arm, top and side studs, simplifying bevels and segments for scene scale |
| `waterDuckweed` | 2052 | 240 | Keep leaf lobes, cross-shaped gaps, thickness, and short supports; arc segments and edge bevels may be increased; current four-lobe version is 88 faces |
| `phragmites` | 1056 | 300 | Keep the main silhouette of thin stems, wide leaves, and brown ears, using the three original color material slots |
| `landGrass` short/tall | original three 328/224/719 | 360/640 | Original three-leaf short grass and five-leaf tall grass, both on 1×1 chamfered square bases with thick curved blades; actual 322/568 faces |
| `landMushroom` | 492 | 200 | Keep cap curvature, edge thickness, stem, and small leaves |
| `waterBubble` | 58 | 58 | Match the original spherical appearance; gains are tiny, GLB may be kept |

## 4. Implementation Phases

### Phase 0: Preparation (no functional change)

2026-10-10 baseline: `node --test` totals 252 items, 242 passing, 10 failing (aircraftInput 3, environmentShadowFollow 1, prefabInstanceColorConfig 2, tiltShiftPostProcessing 2, worldCameraFollow 2). Same-camera foreground render baseline: triangles=29,285,574, drawCalls=327, frame=16.60ms, GPU=5.37ms. seed=20260608, viewport=1920×911, DPR=1, 9 chunks, aircraft unmoved (keep current height=7.2, position=[12.8,7.2,12.8]). The first background sample was throttled, discarded, and resampled in the foreground; frame time is a single observation, not a statistical baseline.

1. Run `pnpm test` and record the baseline. Note that `test/prefabInstanceColorConfig.test.js` currently fails 2/3 (the manifest palette and mushroom weights disagree with test expectations), unrelated to this migration — first confirm whether the manifest or the tests are the source of truth.
2. In `pnpm dev` + `#debug` with a fixed seed and camera, record `renderer.info.render.triangles`, draw calls, and frame time at forest / desert / volcano as comparison baselines.
3. Measure stud radius and height from `legoBlock2x2.glb` and write them into the `prefabParts.js` constants.

### Phase 1: Infrastructure + pilot `landFlower`

1. Add `prefabParts.js`, `builders/index.js`, `builders/flower.js`.
2. `PrefabRegistry` supports `builder` variants and `dispose()`; `World.dispose()` calls it.
3. In the manifest, switch `landFlower` to a builder variant (palette and density unchanged).
4. Add `test/prefabBuilders.test.js` (see Section 5).
5. After the visual comparison passes, delete `flower.glb` and the `landFlowerModel` entry in `sources.js`.

Acceptance: flower appearance is stylistically consistent, instance colors work, no missing warnings for `flower_InstanceColor`, and forest scene triangle count drops clearly.

2026-10-10 implementation result: infrastructure and `landFlower` are integrated; flower root=62 faces, flower head=144 faces, 206 total (94.03% fewer than the original GLB), keeping two meshes, original weights, and placement/tint config. Fixed the first leaf's connection position; ray tests cover leaf and stem intersections. With the same seed, viewport, and initial camera: triangles=27,299,022 (down 6.78%), drawCalls=327, frame≈16.70ms, GPU≈5.05ms; both samples around 60Hz — don't claim a frame-rate improvement from this. Visual check passed, console has no new missing instance-color mesh / capacity / render warnings; old GLB and source removed. 24 new tests added; full suite 276 items, 266 passing, still only the same 10 pre-existing failures; production build passes. Changes kept in the workspace, not auto-committed.

### Phase 2: High-value items

`waterDuckweed` is done; remaining suggested order: `volcanoRock` → `deadBush` → `desertCactusSmall`. Each item verified independently: add builder → change manifest → run tests → visual comparison → delete GLB and source.

2026-10-10 duckweed first-version result (historical record): added `builders/duckweed.js` and registered `duckweed`; `waterDuckweed` keeps one variant, weight=1, water-surface placement, random 90° rotation, original forest/autumnForest density and shadow behavior. The original GLB's linear material color converts to sRGB `#51b44c`; palette and table above corrected. The first version consists of connected supports and two elliptical leaves, 56 faces, one mesh, size 0.130×0.068×0.1344, min.y≈0, XZ center (-0.05,0.056); 97.27% fewer faces than the original 2052.

With the same seed=20260608, 1920×911 viewport, DPR=1, 9 chunks, and initial camera (aircraft position=[12.8,7.2,12.8]), triangles dropped from 27,299,022 to 27,097,426 — 201,596 fewer faces (0.74%); drawCalls were 327 in both, frame single observation about 16.6/16.8ms — don't claim a frame-rate improvement from this. Visual check passed, console has no new warnings, `duckweed.glb` and the `waterDuckweedModel` source removed. 6 new tests added; full suite 282 items, 272 passing, still the same 10 pre-existing failures, production build passes. All changes kept in the workspace, not auto-committed.

The workspace has since adjusted duckweed to a four-lobe slitted shape, currently measured at 88 faces, one mesh, size about 0.1317×0.066×0.1317. The scene performance data above only corresponds to the 56-face first version. This budget adjustment keeps the current shape without adding model faces; acceptance follows the visual-first standard in Sections 3.5 and 5.2.

2026-10-11 volcano rock result: added `builders/volcanoRock.js`, registering `volcanoRock` / `volcanoRockSmall`. Both still share the same dark-gray rock body shape; the large one adds staggered square crystal columns and a low continuous transparent core. Large: 611 faces (dark gray 272 + crystals 339), 70.25% fewer than the original 2054; small: 272 faces, 79.66% fewer than the original 1337, keeping 2 / 1 meshes respectively. Sizes about 0.12556×0.18870×0.14389 / 0.08922×0.09955×0.08026, min.y=0. Meets the user's new standard; no further refinement.

Keep both weights 0.3 / 0.7, volcano ground placement, density=0.09, minHeight=5, maxSlope=3, 90° random rotation, shadows, and the original five-color tint palette. Palette converts from the original GLB's linear colors to sRGB: rock `#1e1e1e`, crystals `#ff1f06`; crystals keep opacity=0.7, metalness=0.064, roughness=0.314, DoubleSide, and `depthWrite=false`. Transparent crystal clusters keep only the continuous outer shell, removing overlapping inner faces to avoid repeated alpha blending. The small one originally had no `_InstanceColor` mesh; keep its fixed dark gray and the original one-time diagnostic.

6 volcano-rock-specific tests, plus 62 tests related to builder/grass/parts/registry/warmup, pass. Authorized visual review confirmed the final 611 / 272 versions land correctly with normal shadows, tinting affects only the large crystals, and the preview browser shows no error/warn; the user also reported the volcano terrain displays correctly in practice. The two old volcano rock GLBs and sources are removed, and the temporary original-model comparison page is cleaned up. No same-camera frame times were collected — don't claim a frame-rate improvement from this; final full-test and production-build results are recorded with this batch.

Local preview: `http://localhost:5173/debug/volcano-rock-preview.html`, with side-by-side rotate, zoom, reset, and five-color switching; the standalone debug entry is not included in the default production HTML entries.

### Phase 3: Remaining items

`landGrass` is done (designed as short/tall per the user's new requirements), `landMushroom` is hooked into a builder; remaining: `phragmites` → `waterBubble` (optional).

2026-10-11 grass implementation result: added `builders/grass.js`, registering `grassShort` / `grassTall`. Both share a 1×1 chamfered square base of width/depth `STUD_PITCH=0.1` and height `PLATE_HEIGHT≈0.03167`, with origin still `(-0.05,0,0.05)`. Short grass has three blades, total height about 0.14167, 322 faces; tall grass has five staggered blades, total height about 0.25167, 568 faces. Blades are enclosed thick curved geometry, blade roots embedded in the root ring and base; per user feedback the cross-section thickness parameter was raised from 0.006 to 0.009 (+50%, the parameter is half-thickness, blades taper toward the tip along the curve), without adding triangles. Each uses one `grass_root` mesh with the existing green LEGO plastic material.

The manifest merges the old two ordinary grasses' weights `1+1` into short grass `2`, while tall grass keeps the old large cluster's `0.25`, preserving the ordinary/rare grass total weight ratio; per-cell variants will change with the new design. Original forest/autumnForest/desert density, ground height/slope limits, 90° random rotation, biome tint, and shadow behavior are unchanged. The three old grass sources and `grass.glb` / `grass_2.glb` / `grass_3.glb` are removed. Automated size checks use the new design sizes, with dedicated ray checks for the 1×1 base under all four rotations; blades may slightly extend past the base edge.

Grass single-item verification snapshot: with the same seed=20260608, 1920×911 viewport, DPR=1, and initial camera, triangles rose from 27,319,754 to 27,338,641 (+18,887, about +0.069%), drawCalls dropped from 327 to 314, geometries from 39 to 38. The slight model cost increase is a design tradeoff of thick blades and bevels; no large triangle reduction is claimed for this change; frame time single observation about 16.6/16.7ms, not evidence of a frame-rate improvement. Standalone preview and scene visual checks passed; the running scene console has no new warnings. Grass added 13 tests; at integration the full suite was 295 items, 285 passing, still only the same 10 baseline failures; production build passes. After keeping the mushroom integration changes that were in progress in the workspace in parallel, re-verification showed the full suite at 298 items, 289 passing, with 9 failures all belonging to the original failure set; all 36 grass, builder, and warmup related tests pass. Changes kept in the workspace, not auto-committed.

Local design preview: after running Vite, open `/debug/grass-preview.html` to view the two grasses side by side, drag to rotate, zoom, and reset; the standalone debug page is not included in the default production build entries.

2026-10-11 follow-up proportion adjustment: per the user's screenshot and additional requirements, both grasses' blade clusters and root rings were scaled up 1.5× as a whole around the base top surface, keeping the 1×1 square base. Current short grass is about 0.12777×0.19667×0.13292, tall grass about 0.14764×0.36167×0.18404; blades may extend past the base edge. Face counts remain 322/568, blade roots and root rings still embedded in the base. Size acceptance synced; all 32 grass and builder tests pass, production build passes.

### Phase 4: Cleanup

- Delete the unloaded `pumice.glb`, `pine.glb`, `coconut_tree.glb`.
- Once all builder variants are migrated, confirm no corresponding entries remain in `sources.js`, with `Resources` load items reduced accordingly.
- Update the `AGENTS.md` notes about prefab sources (if any).

## 5. Verification Plan

### 5.1 Automation: `test/prefabBuilders.test.js`

For each builder function in `prefabBuilders` and each builder variant in the manifest:

- **Geometry cost**: iterate meshes and count `index.count / 3`; models must be non-empty with fewer faces than the corresponding original GLB; the Section 3.5 reference budgets are for visual and performance review, not hard test limits. Add the original GLB baseline whenever a new builder is added.
- **Naming**: if the original variant has a tintable part, at least one mesh name must match `meshNameSuffix`. The small volcano rock's original GLB contains only fixed dark-gray rock, keeping this exception; specifically verify the large one tints in five colors, the small one is not tinted, and the original missing-tint-mesh one-time diagnostic doesn't increase.
- **Origin**: overall bounding box `min.y ≈ 0` (±0.005), XZ center ≈ `(-0.05, 0.05)` (±0.02).
- **Size**: for reproduction-style prefabs, bounding box vs. the Section 2.2 original GLB sizes within ±25%; user-requested original grass is checked against the short/tall new design sizes, and the base must be 1×1.
- **Manifest integrity**: each variant either has a `source` in `sources.js` or a `builder` in `prefabBuilders`.
- **Release**: after `PrefabRegistry.dispose()`, geometry and material `dispose` are called.

Existing `prefabPlacer*.test.js` and `prefabPipelineWarmup.test.js` should pass unchanged; if they construct a mock registry, keep them unchanged.

### 5.2 Manual

- `pnpm dev` + `#debug`, compare triangles, draw calls, and frame time with the Phase 0 fixed seed and camera.
- Against the original GLB's common and close-up angled camera positions, check silhouette, proportions, leaf/branch counts, gaps, thickness, rounded edges, material highlights, and shadows; passing a bounding-box size check does not substitute for visual acceptance. Keep baseline screenshots before removing original assets.
- If a reference budget degrades visible shape, prioritize adding the needed geometric detail, then record model face count and scene cost; verify appearance first, then decide whether to simplify further.
- Check: objects floating or sunk into the ground, whether they land on studs, whether they still align after 90° rotation, whether colors are correct under biomeTints, whether the instance-color palette applies, and whether shadows are normal.
- The console should show no new `has no mesh matching instance color suffix` or `exceeded capacity` warnings.

## 6. Risks and Countermeasures

| Risk | Countermeasure |
|---|---|
| Procedural models' style doesn't match existing GLBs / terrain bricks | Use `prefabParts.js` LEGO units, studs, and `createLegoMaterial` plastic parameters uniformly; pilot only the flower first, confirm the style, then scale up |
| Physical materials make prefabs look heavier | Phase 0 baseline compares frame time; prefabs occupy a small screen share, expected impact is limited |
| Origin offset causes floating/intersection | Tests assert `min.y` and XZ center |
| Shared materials wrongly modified by tint logic | Tint logic already clones materials; tests verify builder materials are unmodified after `resolvePrefabMaterial` |
| Too many variants or meshes raising draw calls | Variants ≤ 3, meshes ≤ 2, Phase 0 baseline compares draw calls |
| Old and new mixed mid-migration | `source` and `builder` can coexist in the same manifest; each prefab switches and rolls back independently |

## 7. Deliverables Checklist

- `src/world/prefabs/builders/prefabParts.js`
- `src/world/prefabs/builders/index.js` and each prefab builder file
- `src/world/prefabs/PrefabRegistry.js` (builder branch, cache, `dispose`)
- `src/world/world.js` (release registry in `dispose`)
- `src/assets/manifests/biomePrefabs.js`, `src/assets/sources.js` (switch and delete item by item)
- `test/prefabBuilders.test.js`
- Delete migrated and unused GLB files
