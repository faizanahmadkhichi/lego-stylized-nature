# Procedural Terrain: Geometry Nodes Implementation Notes

> Source: the `Cube` mesh under the `stuff` collection in the Blender scene, with the `GeometryNodes` modifier and the `Geometry Nodes` node group (70 nodes total).
> Compiled by reading the node tree structure, links, and parameters via Blender MCP.

![Terrain preview](./assets/terrain-preview.png)

## 1. Overview

This is a **voxel / low-poly terraced (terraced voxel) procedural terrain generator**. The core idea:

1. Use a **Grid** as the terrain's flat sampling mesh.
2. Use **4D noise** to compute a "height layer count" for each grid point.
3. Use **Duplicate Elements** to stack the grid into stepped terraces by layer count, raising each layer along Z by a fixed layer spacing.
4. **Instance block tiles from the `Tierra` collection** at each grid point, switching tile type (grass, dirt, sand, water) based on "layer height / whether below the water level".
5. Scatter points on the terrain's **top surface**, instancing **flowers (`Flores`)** and **rocks (`Rocks`)** above the water level using a noise mask.
6. Finally, `Join Geometry` + `Realize Instances` for the output.

The graph is grouped into Frames by stage (the node name prefix is the execution stage):

| Stage | Frame Name | Responsibility |
|-------|-----------|----------------|
| 10 | Terrain Generation | Grid → noise height → layered stacking → tile instancing |
| 20 | Vegetation Candidate Points | Top-surface candidate points (with scroll/tile wrapping) |
| 30 | Vegetation Base Mask | "Above water" base mask |
| 40 | Flower Mask | Random flower mask |
| 50 | Flower Instance | Flower instancing + random rotation/scale |
| 60 | Rock Mask | Random rock mask |
| 70 | Rock Instance | Rock instancing + random type/rotation |
| 90 | Output | Join Geometry + Realize Instances |

## 2. Exposed Parameters (Node Group Interface)

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `chunkNum` | Int | 1 | Chunk size + grid resolution (number of chunks) |
| `layerSpacing` | Float | 0.1 | Step by which each terrace layer is raised along Z |
| `mountainHeight` | Int | 20 | Max layer count after noise mapping (terrain relief strength) |
| `waterLevel` | Int | 1 | Layer height of the water surface (layers below this use the water tile) |
| `heightOffset` | Float | 0.0 | Height offset (reserved) |
| `flowerDensity` | Float | 0.55 | Flower noise filter threshold |
| `scroll` | Float | 0.0 | Terrain/vegetation scroll offset (enables an infinitely scrolling map) |
| `Seed` | Int | 0 | Noise random seed |
| `rockDensity` | Float | 0.08 | Rock noise filter threshold |

## 3. Stage-by-Stage Implementation Details

### Stage 10: Terrain Generation (Core)

**1) Build the sampling grid**
- `Grid`: `Size X/Y = chunkNum`;
- Vertex count: `Vertex Density (MULTIPLY)`: `chunkNum × 5` → `Vertex Density.001 (ADD)`: `+1` → `Vertices X/Y = chunkNum*5 + 1`.
- Resolution grows linearly with chunk count, roughly 5 subdivisions per chunk.

**2) Compute each point's height layer count (noise)**
- `Position` added to `Combine XYZ.002` (from `scroll`, quantized by `Align.002` SNAP 0.2) → sampling coordinates (supports scroll offset).
- Fed into `Noise Amount (Noise Texture, 4D)`: `Scale=0.3, Detail=2, Roughness=0.5`, `W = Seed`.
- `Map Range`: `From [0.4, 1.0] → To [0, 1]`, stretching the noise and clipping low values (creates flat land / ocean).
- `Multiply Add (MULTIPLY_ADD)`: `noise value × mountainHeight + waterLevel` → the **layer count (height) for that point**.

**3) Stack into stepped terraces**
- `Duplicate Elements (POINT domain)`: `Amount = layer count from the previous step`, duplicating the whole grid N times.
- `Height Multiply (MULTIPLY)`: `layerSpacing × Duplicate Index` → each copy raised along Z by `index × layerSpacing`.
- `Combine Vector → Set Position Offset` → forms the stepped voxel terrain.

**4) Instance terrain tiles at grid points**
- Points output by `Set Position` → the Points input of `Instance on Points`.
- `Collection Info (Tierra)` provides 6 block tiles (`pieza.001~006`) as the instance source.
- **Tile selection** is decided by `Water Level Instance Select (Switch, INT)`, which sets the `Instance Index`:
  - **False branch (normal terrain)**: `Multiply Add.001`: `Duplicate Index × 0.35 + 0.65` → `Index Clamp (CLAMP 0~5)`, i.e. pick a tile by layer height (higher layers use tiles closer to "grass/top").
  - **True branch (underwater)**: `Water Block Index (Integer)`, a fixed water-surface tile index.
  - Switch condition `Water Level Check (COMPARE INT, LESS_THAN)`: `Duplicate Index < waterLevel` → layers below the water level use the water tile.

> This is the source of the layered look: "grassy highlands + sandy transitions + blue water".

### Stage 20: Vegetation Candidate Points (Top-Surface Sampling)

- Reuse the original `Grid` → `Set Position.002` → `Set Position.001` → `Capture Attribute (POINT)`, producing a scatter mesh aligned with the terrain's top surface.
- **Position wrapping (seamless scrolling)**: `Vector Math.001 (SUBTRACT)` subtracts the scroll offset, `Vector Math.003 (WRAP)` wraps coordinates within the chunk size (`Value = chunkNum×0.5`, `Value.001 = chunkNum×0.5×-1`), enabling a scrollable/tileable map.
- **Snap to top-surface height**: `Set Position.001 Offset.Z = Multiply Add.002`: `FLOOR(terrain layer count) × 0.1 (layerSpacing)`, attaching vegetation to the terrace tops.
- `Capture Attribute` captures the `Index` onto the points, so later white noise can draw per-point random values.

### Stage 30: Base Mask (Above Water)

- `Flower Position → Separate XYZ → Z`, compared against the `Water Threshold (MULTIPLY)` (`waterLevel × 0.12`):
- `Above Water (COMPARE, GREATER_THAN)`: Z > threshold → the point is above the water surface. **Flowers and rocks share this mask**, so they only grow on land.

### Stages 40 / 50: Flowers

- **Mask**: `White Noise Texture (White Noise, sampled by the captured Index)` → `Noise Filter (COMPARE, LESS_THAN flowerDensity)`;
  `Flower selection = above water AND noise filter` → used as the Selection for `Instantiate Flowers`.
- **Instances**: `Collection Info – Flowers (Flores)` as the instance source.
- **Random rotation**: `Random Value (0–1, ID = Index)` → `Align (SNAP π/2)` → quantized to 90° orientations.
- **Random scale**: `Random Scale (0.5–1.0)` → `Scale Steps (SNAP 0.1)` → discrete scale steps, keeping the pixel-art look consistent.

### Stages 60 / 70: Rocks

- **Mask**: `Rock White Noise Texture → Rock Noise Filter (LESS_THAN rockDensity 0.08)`;
  `Rock selection = above water AND rock noise filter`.
- **Instances**: `Collection Info – Rocks (Rocks)`, 7 rock variants.
- **Random type**: `Random Rock Index (INT 0–6, Seed=11)` → `Instance Index`.
- **Random rotation**: `Random Rock Rotation Z (-π–π, Seed=23)` → rotation around the Z axis.

### Stage 90: Output

- `Join Geometry` merges three streams: terrain tile instances, flower instances, rock instances.
- `Realize Instances` → `Group Output Geometry`.

## 4. Main Data Flow (Simplified)

```
chunkNum ─→ Grid ─┬─→ Duplicate Elements (stack by noise layer count) ─→ Set Position (raise per layer) ─→ Instance Tiles (Tierra) ─┐
                  │        ▲                                   ▲(Switch: water / layer-height tile select)      │
Seed,scroll ─→ Noise ─→ Map Range ─→ Multiply Add (×mountainHeight + waterLevel)                                       │
                  │                                                                          ├─→ Join Geometry ─→ Realize Instances ─→ Output
                  └─→ Capture top-surface candidate points ─→ Above-water mask ─┬─→ Flower mask ─→ Instantiate Flowers (Flores) ───────┤
                                                                        └─→ Rock mask ─→ Instantiate Rocks (Rocks) ─────────┘
```

## 5. Key Design Points / Replication Notes

- **The essence of stepped terrain**: instead of displacing vertices, `Duplicate Elements` copies the flat grid into multiple layers, then raises each by `index × layerSpacing` → the voxel-step look comes for free.
- **Layered look via "tile selection by layer"**: the layer count is mapped to the tile library index via `×0.35 + 0.65` + `CLAMP(0,5)`; underwater layers switch to the water tile via `Switch`.
- **Vegetation snaps to the top surface**: `FLOOR(layer count) × layerSpacing` places flowers/rocks at the matching terrace height.
- **Infinitely scrolling map**: `scroll` applies to both the noise sampling coordinates and the vegetation coordinates' `WRAP`, so the map can pan with continuous content.
- **Random but restrained**: rotation/scale are quantized with `SNAP` to discrete steps, keeping the low-poly/pixel-art look tidy.
- **Required collections**: `Tierra` (terrain tiles ×6), `Flores` (flowers ×1+), `Rocks` (rocks ×7). Prepare these three collections first when replicating.

## 6. Suggested Replication Steps (Equivalent Implementation in Three.js / TSL)

To rebuild the same effect on the WebGPU/TSL side, follow this mapping:

1. Use a flat grid + noise (`mx_noise` / custom) to compute each vertex's discrete layer count `floor(noise * mountainHeight + waterLevel)`.
2. Stack blocks by layer count via instancing (or use a heightmap + vertex displacement quantized to `layerSpacing` for the steps).
3. Select tile material/texture by layer height / water threshold.
4. Instance flowers and rocks on the top surface with a white-noise mask, reusing the "above water" test.
5. `scroll` maps to a uniform, applying the same offset and wrap to the noise coordinates and vegetation coordinates for scrolling.
