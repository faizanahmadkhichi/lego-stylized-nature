# BRICKLAND — Game Conversion Plan

Turn the BRICKLAND exploration experience into a real game: objectives, scoring,
progression, and fail states — while keeping the calm, beautiful flying that
makes it special.

## 1. Vision

**Today:** a relaxing flight through a procedural brick world. No goals, no
score, no reason to fly anywhere in particular.

**After:** the same world, but every flight has a purpose. You collect brick
studs, fly through rings, complete missions across all 7 biomes, and chase
your best score — with a reason to come back tomorrow.

**Design rule:** the game must never punish exploring. Free Flight stays
exactly as it is today. Game systems are layered on top, not forced on the
player.

## 2. What already exists (reuse it)

| System | File(s) | What we get for free |
| --- | --- | --- |
| Player aircraft | `src/world/player/PlayerAircraft.js`, `aircraftMotion.js`, `AircraftInput.js` | Flight, banking, pause, reset, speed, position |
| Procedural world | `src/world/world.js`, `src/world/WorldConfig.js` | Seed-based terrain, 7 biomes, chunk loading, `regenerate()` |
| Landmarks | `src/world/landmarks/` | Placement, rendering, the Desert Sun Gate — a ready-made destination |
| Minimap | `src/ui/TerrainMinimap.js` | Terrain map; needs objective markers added |
| HUD | `src/ui/ExplorerUI.js` | Biome name, speed, coordinates, pause/home/sound buttons, help dialog, toasts |
| Audio | `src/audio/ExplorerAudio.js` | WebAudio synth (`play(name)`); add pickup/success/fail sounds the same way |
| VFX | `src/world/player/engineFlameVFX.js`, `wingAirflowVFX.js` | Engine + wingtip trails; reuse the pattern for pickup sparkles |
| Persistence | — (none yet) | `localStorage` is all we need for scores/progress |

**What's missing (the whole game layer):** score, collectibles, missions,
rings, fuel, timer, levels, crash/fail states, progression, persistence.

## 3. Core game loop

```
Take off → See the next objective on the HUD + minimap → Fly there →
Collect / fly through it → Score + feedback (sound, sparkle, toast) →
Next objective appears → … → Mission complete → Rewards + next mission
```

One loop, reused by every mode. Everything else is a variation on it.

## 4. Game modes

### 4.1 Adventure (the main mode)
A mission chain across the 7 biomes. Each mission is a short objective list
(e.g. "Collect 12 studs in the Verdant Forest", "Fly through 5 rings over the
Golden Dunes", "Reach the Desert Sun Gate"). Finishing a mission unlocks the
next one and a new biome. This is the mode that turns the world into a game.

### 4.2 Time Trial
A ring course with a countdown. Fly through every ring before the timer hits
zero. Rings give +time. Best times saved per course. Three courses to start:
Forest Loop, Dune Dash, Snow Run.

### 4.3 Free Flight (exists today)
Exactly the current experience. No timer, no fuel, no score pressure.
The "relax" mode. Keep it as the default landing state so existing players
lose nothing.

Mode select lives on the start screen (see §7). The player picks a mode
before takeoff; Free Flight stays the default.

## 5. Systems to build

### 5.1 Collectibles — Brick Studs
- **What:** glowing golden studs (the classic LEGO stud shape) floating above
  the terrain, placed by the same seeded generator as the terrain so they are
  identical on every visit to a seed.
- **Placement:** clusters near biome features (rivers, arches, landmarks),
  some in lines that teach the player to fly low, some high to reward climbing.
- **Pickup:** fly within ~2 cells. Sparkle VFX + chime + `+10` toast.
  Combo multiplier grows when pickups are chained within 5 seconds
  (x2, x3, … x5), resets on a miss or a crash.
- **Files:** new `src/world/collectibles/StudField.js` (placement + instanced
  rendering, reuse the prefab instancing pattern) and
  `src/systems/Collectibles.js` (pickup detection vs player position).

### 5.2 Rings / Checkpoints
- **What:** glowing torus rings the player flies through. Big, visible from
  far away, with an arrow beacon so the player always knows where the next
  one is.
- **Use:** Time Trial courses and Adventure missions ("fly through 5 rings").
- **Files:** new `src/world/rings/RingCourse.js` (course definitions per
  biome) and `src/systems/RingPass.js` (pass detection: player crossed the
  ring plane inside its radius).

### 5.3 Missions & Objectives
- **What:** a small mission list per Adventure stage. Each mission has 1–3
  objectives (collect N, pass M rings, reach a landmark, visit a biome).
- **Data:** plain JSON in `src/data/missions.json` so new missions are added
  without touching code.
- **State machine:** `idle → active → complete → reward`. Completing a
  mission shows a banner, plays a fanfare, unlocks the next mission.
- **Files:** new `src/systems/MissionManager.js` + `src/data/missions.json`.

### 5.4 Scoring
- Stud: **+10** (× combo multiplier).
- Ring: **+50** (Time Trial: also **+3s**).
- Mission complete: **+500** + time bonus.
- Best score per mode stored in `localStorage` (`brickland.best.<mode>`).
- HUD shows score + combo; a small score popup floats at each pickup.

### 5.5 Fuel (Adventure + Time Trial only)
- **Why:** gives flights a cost and a reason to plan a route. Free Flight
  has no fuel.
- **Rules:** fuel drains with throttle, refills slowly at low speed, and
  refuels fully at fuel stations (glowing pads near landmarks). Empty fuel =
  gentle glide-down, not a crash — the plane lands and the mission restarts
  from the last checkpoint.
- **Files:** `src/systems/Fuel.js`; fuel gauge added to the HUD.

### 5.6 Crash & Fail states
- **Crash:** hitting terrain at high speed (already detectable via player
  height vs terrain height). Today nothing happens — the plane just clips.
  Add: screen shake, a thud, the plane resets to the last checkpoint, combo
  resets, −100 points. No harsh "game over" screen; keep it friendly.
- **Time out (Time Trial):** the run ends, shows the final time/score and
  the best time. One button: "Fly again".
- **Files:** `src/systems/CrashDetector.js` (terrain-height check per frame,
  reuse `TerrainGenerator` height sampling).

### 5.7 Progression & Unlocks
- **Biome unlocks:** Adventure missions unlock biomes in order
  (Forest → Wetlands → Autumn → Meadow → Desert → Snow → Volcano).
  Locked biomes are greyed out on the mission map.
- **Plane skins:** earn new brick colors by completing missions
  (e.g. red → blue → gold). Purely cosmetic, stored in `localStorage`.
- **Files:** `src/systems/Progression.js` (unlock state + `localStorage`).

### 5.8 Persistence
- `localStorage` keys: `brickland.best.<mode>`, `brickland.missions`,
  `brickland.unlocked`, `brickland.skin`, `brickland.settings`.
- No accounts, no server. Everything local, so it works offline.

## 6. New files & changed files

**New files**
| File | Purpose |
| --- | --- |
| `src/data/missions.json` | Mission definitions (all modes) |
| `src/systems/Game.js` | Game state machine: menu → playing → paused → complete / failed |
| `src/systems/MissionManager.js` | Mission list, objectives, completion |
| `src/systems/Collectibles.js` | Stud placement + pickup detection |
| `src/systems/RingPass.js` | Ring courses + pass detection |
| `src/systems/Scoring.js` | Score, combo, best-score persistence |
| `src/systems/Fuel.js` | Fuel drain/refill/stations |
| `src/systems/CrashDetector.js` | Terrain collision → reset |
| `src/systems/Progression.js` | Unlocks, skins, `localStorage` |
| `src/world/collectibles/StudField.js` | Stud rendering (instanced) |
| `src/world/rings/RingCourse.js` | Ring rendering (instanced torus) |

**Changed files**
| File | Change |
| --- | --- |
| `src/app/Experience.js` | Owns the `Game` system; wires it into the render loop |
| `src/ui/ExplorerUI.js` | HUD: score, combo, fuel gauge, timer, mission tracker, start screen, results screen |
| `src/ui/TerrainMinimap.js` | Objective markers (studs, rings, mission target) |
| `src/audio/ExplorerAudio.js` | New sounds: `pickup`, `ring`, `success`, `fail`, `fuelLow` |
| `src/world/WorldConfig.js` | Game tuning (stud density, fuel drain, ring sizes) |
| `readme.md` | Document the game modes + how to play |

**Untouched:** terrain generation, chunk system, renderer, biome definitions,
landmark placement. The game layer sits on top of the world, it does not
rewrite it.

## 7. UI / UX changes

- **Start screen** (new): title, mode select (Adventure / Time Trial /
  Free Flight), best scores, "How to play". Replaces the bare loading card
  as the first thing the player sees.
- **HUD additions:** score (top right), combo badge, fuel gauge (Adventure/
  Time Trial), mission tracker (left, collapsible), timer (Time Trial).
  Existing biome/speed/coords stay where they are.
- **Objective beacon:** a floating arrow + distance readout pointing at the
  next objective, so the player is never lost.
- **Results screen** (new): mission complete / run over — score breakdown,
  best score, "Next mission" / "Fly again" / "Menu" buttons.
- **Toasts:** reuse the existing toast system for pickups and mission updates.

## 8. Audio additions

All in the existing `ExplorerAudio.js` synth style (no audio files needed):

| Sound | When | Notes |
| --- | --- | --- |
| `pickup` | Stud collected | Short bright chime; pitch rises with combo |
| `ring` | Ring passed | Airy whoosh + chime |
| `success` | Mission complete | Little three-note fanfare |
| `fail` | Crash / time out | Soft low thud (friendly, not harsh) |
| `fuelLow` | Fuel under 25% | Gentle warning blip, not constant |

## 9. Rollout — build it in phases

### Phase 1 — MVP: "It is a game now" (the core loop)
1. Studs: placement + pickup + score + combo + HUD.
2. One Adventure mission chain (5 missions, Forest → Wetlands).
3. Start screen + results screen.
4. `localStorage` best score.
5. **Done when:** a player can start, collect studs, finish a mission,
   see a score, and come back to beat it.

### Phase 2 — Time Trial + rings
1. Ring courses (Forest Loop, Dune Dash, Snow Run) + pass detection.
2. Countdown timer + ring time bonus.
3. Best times per course.
4. **Done when:** a full Time Trial run works end to end.

### Phase 3 — Fuel, crash, progression
1. Fuel system + fuel stations.
2. Crash detection + checkpoint reset.
3. Biome unlocks + plane skins.
4. **Done when:** Adventure spans all 7 biomes with unlocks.

### Phase 4 — Polish
1. Objective beacon + minimap markers.
2. Mission tracker polish, results-screen breakdown.
3. New sounds + volume balance.
4. Mobile tuning (touch joystick already exists; verify HUD fits).
5. **Done when:** a fresh player can finish Phase 1 missions without help.

**Order matters:** do Phase 1 first and playtest it before adding Phase 2.
Each phase is shippable on its own — the game is never half-broken.

## 10. Testing

- `pnpm test` / `npm test` (existing Node test runner) — add unit tests for
  the pure-logic systems: `Scoring` (combo math), `MissionManager`
  (objective completion), `RingPass` (crossing detection), `Fuel` (drain/refill).
- Manual playtest checklist per phase: start → objective → collect →
  complete → results → best score saved → reload → progress intact.
- Performance: studs and rings use instanced rendering (same pattern as
  prefabs) so the frame cost stays near zero; verify with the existing
  `#debug` panel.

## 11. What this plan deliberately leaves out

- **Multiplayer** — out of scope. The `zaohua-platform-sdk` vendor code has
  multiplayer stubs, but building netcode is a separate project.
- **Combat / enemies** — doesn't fit the calm BRICKLAND feel.
- **Accounts / cloud saves** — `localStorage` only, by design.
- **New biomes or terrain changes** — the world is already great; the game
  layer uses what exists.
