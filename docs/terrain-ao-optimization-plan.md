# Terrain AO: Current Implementation and Optimization Plan

> Status: synced with the current workspace implementation. This document records the implemented terrain AO, existing constraints, and follow-up improvements.

## 1. Scope and Visual Goals

A single brick is `0.2` world units wide. At the current viewing scale, the local AO benefit of brick seams and studs is limited. This plan converges on **terrain AO only**, removing the earlier plans for baked AO on brick models, per-brick seam occlusion, and screen-space AO for prop contact.

Key goals:

- Open hilltops and platform edges stay clean.
- Ground near tall walls, valleys, and depressions gets shaded.
- Cliff faces are darker near the slope foot and fade upward.
- Terrain AO stays stable as the camera moves, chunks switch, and the instance pool is reused.

The `footContact` in the current algorithm is a **heightfield contact approximation at the terrain slope foot**, part of the terrain-level expression above, so it is kept.

## 2. Current Implementation Overview

Current approach: **multi-direction, multi-distance horizon occlusion approximation on a world-space heightfield, plus slope-foot contact falloff**.

| Item | Current State |
| --- | --- |
| Sampling directions | Fixed 8 horizontal grid directions |
| Sampling distances | Default `[1, 2, 4, 8]` grid steps |
| Occlusion calculation | Elevation sine × distance falloff, max contribution per direction, then averaged |
| Slope-foot contact | Non-surface bricks compute falloff from the lowest neighbor height |
| Output | One AO visibility scalar per placement |
| CPU storage | `Float32Array` aligned with placements, accessed by index |
| Chunk neighborhood | Default `halo = 8`, covering current sampling distances |
| Material application | CPU multiplies AO into instance colors |
| Preview | Grayscale AO, base colors, noise tones, and final material |

This is heightfield AO inspired by the horizon idea. 8-direction sampling is combined into a single scalar; currently there is no per-surface-normal output of separate AO for top and four sides, and no full HBAO hemisphere integration.

### 2.1 Related Code

| File | Responsibility |
| --- | --- |
| [`HeightfieldAO.js`](../src/world/bricks/HeightfieldAO.js) | Samples the heightfield, computes horizon and slope-foot occlusion, stores visibility |
| [`LayeredTerrainBuilder.js`](../src/world/terrain/LayeredTerrainBuilder.js) | Generates placements for actually visible bricks |
| [`TerrainBrickRenderer.js`](../src/world/bricks/TerrainBrickRenderer.js) | Uses `ao.get(i)` to update instance colors and previews |
| [`ChunkRenderSlot.js`](../src/world/chunks/ChunkRenderSlot.js) | Calls `build(terrainMap, placements)`, records AO build time |
| [`world.js`](../src/world/world.js) | Hooks up the full map, chunk, and preview refresh flow |
| [`legoMaterial.js`](../src/materials/tsl/legoMaterial.js) | Provides the shared `MeshPhysicalNodeMaterial`; currently no custom `aoNode` |
| [`AOPanel.js`](../src/debug/panels/AOPanel.js) | Provides AO strength, weights, falloff, and grayscale preview |
| [`WorldConfig.js`](../src/world/WorldConfig.js) | Stores sampling distances, AO parameters, and halo config |
| [`heightfieldAO.test.js`](../test/heightfieldAO.test.js) | Verifies open top faces, cliff slope feet, and multi-distance occlusion |

## 3. Current Compute Flow

```text
Generate terrainMap (chunk with halo)
                 ↓
LayeredTerrainBuilder generates placements
                 ↓
HeightfieldAO.build(terrainMap, placements)
                 ↓
Each column reads neighbor heights in 8 directions × multiple distances
                 ↓
Compute horizon and footContact per brick layer
                 ↓
Float32Array[i] stores visibility of placement i
                 ↓
TerrainBrickRenderer uses ao.get(i)
                 ↓
Final material: base color × AO → instanceColor
Grayscale preview: AO → instanceColor
```

AO represents visibility: `1` is open. The current output lower bound is controlled by `ao.min`; the default result range is `[0.2, 1]`.

### 3.1 Height Sampling and Column Cache

Add the halo offset to a placement's local `x/z` to get the heightfield sampling coordinates.

Current rules for valid heights:

- Normal terrain reads `terrainMap.getHeight(x, z)`.
- Heights at or below the water level are handled as `waterLevel`.
- Lava columns prefer `surfaceCell.lavaHeight`, falling back to `surfaceCell.height`.
- Out-of-range heights return `NaN`, treated as missing samples.

Placements belonging to the same `x/z` column share a cached neighborhood height; occlusion is still computed independently per layer. The current `LayeredTerrainBuilder` generates placements column by column, which fits this caching strategy.

### 3.2 Horizon Contribution

Direction is `(dx, dz)`, grid sampling step is `dist`, current brick layer is `y`:

```text
rise = (neighborHeight - y) × layerHeight
run = dist × sqrt(dx² + dz²) × cellSize
```

Only `rise > 0` occluders are processed. For other valid samples, the contribution in that direction is zero.

```text
sinElevation = rise / sqrt(rise² + run²)
attenuation = 1 / (1 + (dist - 1) × distanceFalloff)
sampleOcclusion = sinElevation × attenuation
```

Each direction takes the largest `sampleOcclusion` across all distance samples, then averages over directions that have valid samples to get `horizon`. Distance falloff is applied before taking the max contribution.

Diagonal directions correct the true horizontal distance via `sqrt(dx² + dz²)`; the current falloff formula uses the grid step `dist`, not the full world-space distance.

Missing samples are skipped. Directions with no valid samples at all don't participate in the average; if all directions have no valid samples, `horizon` returns `0`. This is a boundary fallback behavior, not a substitute for complete neighborhood data.

### 3.3 Slope-Foot Contact

Currently takes the lowest height from the **first distance sample** of the four cardinal directions as `minNeighbor`. The default first distance is `1`, so it corresponds to the adjacent cell.

Only computed for bricks with `layer !== 'surface'` and a valid `minNeighbor`:

```text
contact = 1 - clamp((y - minNeighbor - 1) / creviceScale, 0, 1)
```

- The first visible brick layer at the slope foot has the strongest contact contribution.
- As the brick layer rises, the contact contribution decreases, reaching zero beyond the falloff range.
- Surface bricks have zero contact contribution, so open top faces are not darkened by this term.

The old config names `creviceScale` and `creviceWeight` are still used, but the debug panel now displays them as `footContact`.

### 3.4 Final Visibility

```text
occlusion = horizon × horizonWeight + contact × creviceWeight
t = clamp(occlusion × strength, 0, 1)
visibility = min + (1 - min) × (1 - t)
```

When AO is off and grayscale preview is also off, no valid AO data is computed and `get(i)` returns `1`. When grayscale preview is on, AO is still computed and viewable even if the final material's AO switch is off.

## 4. Changes Completed in This Implementation

- **Removed open-direction darkening**: deleted the old `sideGap`; low neighbors no longer add occlusion directly.
- **Fixed slope-foot falloff**: the old high-ledge darkening is now a contact contribution that fades upward from the slope foot.
- **Removed pure depth darkening**: deleted the old `depthOcc`, `depthWeight`, `depthScale`.
- **Replaced height-difference normalization**: deleted `horizonScale`, now computes elevation contribution from real brick dimensions.
- **Expanded occlusion scale**: upgraded from the adjacent ring to multi-distance sampling.
- **Aligned with actual placements**: AO and rendering use the same placements, including bricks exposed after lava handling.
- **Replaced string Map**: switched to contiguous arrays and placement indices, avoiding coordinate-string lookups.
- **Cached neighborhood heights per column**: reduces repeated height reads for different brick layers in the same column.
- **Expanded halo**: default adjusted from `1` to `8`, providing a sampling neighborhood for chunk edges.

## 5. Data Interface and Rendering Hookup

### 5.1 Interface Contract

```js
heightfieldAO.build(terrainMap, placements)
const visibility = heightfieldAO.get(placementIndex)
```

The index for `get(i)` must match the placement order of this `build()` call. After placements are rebuilt or reordered, AO must be rebuilt as well.

`_values` is only reallocated when capacity is insufficient; `_count` records the current valid count, and stale data past the capacity tail is not used as a valid placement. `_samples` is a reused `Float64Array` neighborhood cache, holding 32 height samples by default.

Each chunk render slot holds its own `HeightfieldAO`. Currently AO has no independent GPU attribute and is still uploaded through the final instance color, so shared brick geometry is not overridden by private AO attributes.

### 5.2 Current Material Behavior

Final material still does:

```js
color.multiplyScalar(ao.get(i))
mesh.setColorAt(i, color)
```

So current AO affects the brick albedo and diffuse under direct lighting. It does not modify the palette config, but the uploaded final `instanceColor` already includes the darkening.

In the **Base colors** and **Noise / tone** previews this step is skipped; in the AO grayscale preview a `MeshBasicNodeMaterial` is used, writing visibility as RGB grayscale.

**An independent AO buffer hooked into `material.aoNode` is not yet implemented**; it belongs to a follow-up material-channel improvement for terrain AO.

## 6. Chunk Sampling Constraints

Current default config is `size = 72`, `halo = 8`, with a heightfield sampling extent of `88 × 88`. Default max sampling step is `8`, so the halo covers sampling for visible brick columns in all eight directions.

Must hold:

```text
max(sampleDistances) ≤ chunks.halo
```

Additionally, the current slope-foot neighbor read implicitly requires `sampleDistances[0] === 1`. The distance list should be positive integer grid steps; these constraints are currently guaranteed by config convention, with no runtime validation.

AO reads data from the chunk's own halo-inclusive heightfield; it does not query neighboring chunks' render objects or use debug spacing. A complete neighborhood avoids making results depend on neighbor chunk load timing.

The outer edge of the full map has no halo data and still uses the missing-sample fallback. Comparisons between the full map and chunks should be made at positions with the same sampling neighborhood. Cross-chunk consistency for water, lava, and special surfaces still needs dedicated verification.

## 7. Current Config and Debugging

### 7.1 Defaults

| Config | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Apply terrain AO to the final material |
| `previewGrayscale` | `false` | Show AO grayscale preview |
| `strength` | `1.4` | Total occlusion strength |
| `min` | `0.2` | Visibility floor |
| `sampleDistances` | `[1, 2, 4, 8]` | Grid sampling steps per direction |
| `distanceFalloff` | `0.25` | Far-sample falloff |
| `horizonWeight` | `0.61` | Horizon occlusion weight |
| `creviceWeight` | `0.42` | Slope-foot contact weight |
| `creviceScale` | `2.5` | Slope-foot contact falloff range, in brick layers |

### 7.2 Art Debugging Flow

Open `#debug`, go to **Heightfield AO**:

1. Enable `grayscalePreview` and observe open top faces, cliffs, and slope feet.
2. Adjust the `horizon` weight and `distanceFalloff` to confirm how far occlusion spreads along the ground.
3. Adjust the `footContact` weight and scale to control cliff darkening from bottom to top.
4. Adjust `strength` and `minBrightness` to avoid large areas saturating to the minimum visibility.
5. Return to the final material and compare results with fixed palette, lighting, and camera.

The eight directions are fixed in code; the sampling distance list is currently changed via config, with no matching Tweakpane control.

### 7.3 Update Cost

Currently, except for toggling the grayscale preview, AO parameter changes call `onRegenerate`, which regenerates terrain or resets the chunk load window. Strength and similar parameters already participate in the CPU final visibility computation; there is no separate uniform path that modulates only the result.

`ChunkRenderSlot.buildTimings.aoMs` already records AO build time, useful for evaluating the cost of multi-distance sampling and the larger halo. The per-placement AO array is about 4 bytes per brick; memory is counted by allocated capacity after array reuse.

## 8. Follow-up Terrain AO Improvement Order

1. **Complete boundary and stability verification**: cover halo, chunk seams, instance pool reuse, and water/lava neighborhoods; add sampling config validation.
2. **Optimize the tuning update path**: separate AO recomputation from terrain generation, prefer reusing the heightfield and placements; evaluate caching raw contributions for fast strength and floor modulation.
3. **Separate the material channel**: keep the palette base color, hook up independent per-instance AO data via `aoNode`, and verify shared-material data binding and resource lifecycle.
4. **Evaluate orientation by visual results**: the current per-brick scalar is the baseline; only upgrade to per-face or per-normal terrain occlusion when wrong darkening by cliff orientation is clearly visible.
5. **Measure cost on target devices**: record AO build, halo terrain generation, and instance data update times, then set the sampling range.

All steps above stay at terrain scale; they no longer include implementation phases for local AO.

## 9. Existing Verification and Pending Acceptance

### 9.1 Existing Automated Tests

[`test/heightfieldAO.test.js`](../test/heightfieldAO.test.js) currently contains 7 tests:

- Open top faces and exposed platform edges stay fully visible.
- Cliff faces darken gradually toward the slope foot.
- Ground near tall walls gets occluded.
- Occlusion reaches non-adjacent positions and weakens with distance.
- At the same distance, a tall wall produces stronger occlusion than a short step.
- AO aligns with placements; values are finite and within the configured range; trailing indices return fully visible.
- AO off returns fully visible.

Run with:

```sh
node --test test/heightfieldAO.test.js
```

### 9.2 Pending Acceptance

- Same brick gives identical results on the full map and in a chunk with the same complete neighborhood.
- No bright or dark seams at chunk boundaries; verify halo when expanding/shrinking the sampling list.
- Scalar AO is symmetric on mirrored terrain.
- Results stay stable per brick coordinates after chunk rebuilds, load-order changes, and placement reorderings.
- Water and lava neighborhood occlusion matches the actually exposed terrain.
- No stale AO data after instance pool capacity grows, shrinks, or is reused.
- Switching between grayscale and color previews restores the correct final instance colors.
- After hooking up an independent AO channel, verify that base colors and direct-light diffuse are no longer darkened by AO multiplication.
- Record actual build times on target devices and pick final art parameters from fixed-scene screenshots.

## 10. Related Docs

- [Terrain color debugging notes](terrain-color-workflow.md)
