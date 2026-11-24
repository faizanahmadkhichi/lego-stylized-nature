# BRICKLAND — Game Conversion Plan

Turn the BRICKLAND exploration experience into a real game: shoot down moving
targets to complete levels, collect studs, chase scores, and progress across
all 7 biomes — while keeping the beautiful flying that makes it special.

## 1. Vision

**Today:** a relaxing flight through a procedural brick world. No goals, no
score, no reason to fly anywhere in particular.

**After:** the same world, but every flight has a purpose. Your plane can
fire — you hunt down moving targets, blast them out of the sky, and clear
each level to unlock the next one. Collect brick studs, fly through rings,
complete missions across all 7 biomes, and chase your best score — with a
reason to come back tomorrow.

**Design rule:** the game must never punish exploring. Free Flight stays
exactly as it is today (no enemies, no firing needed). Combat lives in
Adventure and Time Trial, not forced on the player.

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

**What's missing (the whole game layer):** firing/combat, moving targets,
levels, score, collectibles, missions, rings, fuel, timer, progression,
persistence.

## 3. Core game loop

```
Take off → See the next target on the HUD + minimap → Chase it down →
Fire to destroy it → Score + feedback (explosion, sound, toast) →
Next target appears → … → All targets destroyed → Level complete →
Rewards + next level
```

One loop, reused by every mode. Collecting studs and flying rings feed the
same loop. Everything else is a variation on it.

## 4. Game modes

### 4.1 Adventure (the main mode)
A level chain across the 7 biomes. **Each level is completed by destroying
all of its moving targets.** The plane fires brick bolts; targets are
floating brick drones and balloons that drift, bob, and dodge. A level might
ask for "Destroy 8 drones over the Verdant Forest" or "Pop 10 balloons above
the Golden Dunes". Clearing a level unlocks the next one and a new biome.
Later levels add more targets, faster movement, tougher targets (2–3 hits),
and targets that shoot back. This is the mode that turns the world into a game.

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

### 5.1 Combat — Firing from the plane
- **What:** the plane fires brick bolts straight ahead. Press **Space** (or
  tap the fire button on touch) to shoot. Each trigger fires a **burst of 3
  long glowing tracers** with a slight fan spread, starting right at the
  plane's nose and racing to the horizon (speed 60, 5s life = 300 units of
  range).
- **Fire rate:** 3 bursts/second. Unlimited ammo — no reloading, so the fun
  never stops. A tiny muzzle flash + recoil kick on the plane sells each shot.
- **Hit detection:** sphere-vs-sphere per frame (bolt position vs target
  position). Cheap and exact enough for this game — no physics engine needed.
- **Files:** new `src/systems/Combat.js` (fire input, bolt pool, hit
  detection) and `src/world/combat/BoltField.js` (bolt rendering, instanced,
  reuse the prefab instancing pattern).

### 5.2 Moving targets — Drones & balloons
- **What:** the enemies. Two types to start:
  - **Brick drones** — floating brick-built flyers that hover and drift in
    slow circles or sine-wave paths. 1 HP early, 2–3 HP later.
  - **Balloons** — bright balloons that bob up and down and drift with the
    wind. 1 HP, worth less, but they move unpredictably.
- **Movement:** targets follow seeded paths (circle, sine, figure-8) so
  their positions are identical on every visit to a seed — fair and
  learnable. Later levels: targets that drift toward the player, and
  **shooter drones** that fire slow bolts back (dodgeable, 3 HP).
- **Destruction:** hit → flash + pop, a burst of brick particles, a score
  popup, and the target respawns only when the level restarts. Destroying
  the last target in a level triggers the level-complete banner.
- **Placement:** spawned per level from `src/data/levels.json` (count,
  types, paths, HP per level). Targets sit above the terrain, away from
  the ground, so the player fights in the air.
- **Files:** new `src/systems/Targets.js` (spawn, movement, HP, destruction)
  and `src/world/targets/TargetField.js` (target rendering, instanced).

### 5.3 Levels
- **What:** a level is a set of targets to destroy, in one biome. Clear all
  targets → level complete → next level unlocks.
- **Structure:** 3 levels per biome × 7 biomes = 21 levels. Difficulty
  ramps: Level 1 has 5 slow drones (1 HP); later levels add balloons,
  faster paths, 2–3 HP drones, and shooter drones.
- **Data:** plain JSON in `src/data/levels.json` (targets per level, types,
  paths, HP, par time). New levels are data-only — no code change.
- **Files:** `src/data/levels.json` + `src/systems/LevelManager.js`
  (level state, spawn/clear, completion).

### 5.4 Collectibles — Brick Studs
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

### 5.5 Rings / Checkpoints
- **What:** glowing torus rings the player flies through. Big, visible from
  far away, with an arrow beacon so the player always knows where the next
  one is.
- **Use:** Time Trial courses and Adventure missions ("fly through 5 rings").
- **Files:** new `src/world/rings/RingCourse.js` (course definitions per
  biome) and `src/systems/RingPass.js` (pass detection: player crossed the
  ring plane inside its radius).

### 5.6 Missions & Objectives
- **What:** a small mission list per Adventure stage. Each mission has 1–3
  objectives (destroy N targets, collect N studs, pass M rings, reach a
  landmark, visit a biome).
- **Data:** plain JSON in `src/data/missions.json` so new missions are added
  without touching code.
- **State machine:** `idle → active → complete → reward`. Completing a
  mission shows a banner, plays a fanfare, unlocks the next mission.
- **Files:** new `src/systems/MissionManager.js` + `src/data/missions.json`.

### 5.7 Scoring
- Target destroyed: **+100** (drone), **+50** (balloon), **+150** (shooter
  drone). Headshot-style bonus: **+25** for a long-range kill.
- Stud: **+10** (× combo multiplier).
- Ring: **+50** (Time Trial: also **+3s**).
- Level complete: **+500** + time bonus + accuracy bonus.
- Kill streaks: destroying 3 targets within 5 seconds builds a combo
  (x2, x3, … x5) — same combo system as studs, shared across both.
- Best score per level/mode stored in `localStorage`
  (`brickland.best.<mode>`, `brickland.best.level.<n>`).
- HUD shows score + combo + targets remaining; a score popup floats at each
  kill.

### 5.8 Fuel (Adventure + Time Trial only)
- **Why:** gives flights a cost and a reason to plan a route. Free Flight
  has no fuel.
- **Rules:** fuel drains with throttle, refills slowly at low speed, and
  refuels fully at fuel stations (glowing pads near landmarks). Empty fuel =
  gentle glide-down, not a crash — the plane lands and the mission restarts
  from the last checkpoint.
- **Files:** `src/systems/Fuel.js`; fuel gauge added to the HUD.

### 5.9 Crash & Fail states
- **Crash:** hitting terrain at high speed (already detectable via player
  height vs terrain height). Today nothing happens — the plane just clips.
  Add: screen shake, a thud, the plane resets to the last checkpoint, combo
  resets, −100 points. No harsh "game over" screen; keep it friendly.
- **Shot down (later levels):** shooter drones can hit the plane. 3 hits =
  the plane spins down and respawns at the last checkpoint, combo resets.
  A brief shield (2s) after respawn so the player isn't instantly hit again.
- **Time out (Time Trial):** the run ends, shows the final time/score and
  the best time. One button: "Fly again".
- **Files:** `src/systems/CrashDetector.js` (terrain-height check per frame,
  reuse `TerrainGenerator` height sampling) and hit handling inside
  `src/systems/Combat.js`.

### 5.10 Progression & Unlocks
- **Biome unlocks:** Adventure levels unlock biomes in order
  (Forest → Wetlands → Autumn → Meadow → Desert → Snow → Volcano).
  Locked biomes are greyed out on the level map.
- **Plane skins:** earn new brick colors by completing levels
  (e.g. red → blue → gold). Purely cosmetic, stored in `localStorage`.
- **Files:** `src/systems/Progression.js` (unlock state + `localStorage`).

### 5.11 Persistence
- `localStorage` keys: `brickland.best.<mode>`, `brickland.best.level.<n>`,
  `brickland.levels`, `brickland.unlocked`, `brickland.skin`,
  `brickland.settings`.
- No accounts, no server. Everything local, so it works offline.

## 6. New files & changed files

**New files**
| File | Purpose |
| --- | --- |
| `src/data/levels.json` | Level definitions: targets per level, types, paths, HP, par time |
| `src/data/missions.json` | Mission definitions (all modes) |
| `src/systems/Game.js` | Game state machine: menu → playing → paused → complete / failed |
| `src/systems/Combat.js` | Firing input, bolt pool, hit detection, player-hit handling |
| `src/systems/Targets.js` | Target spawn, movement paths, HP, destruction |
| `src/systems/LevelManager.js` | Level state, spawn/clear, completion |
| `src/systems/MissionManager.js` | Mission list, objectives, completion |
| `src/systems/Collectibles.js` | Stud placement + pickup detection |
| `src/systems/RingPass.js` | Ring courses + pass detection |
| `src/systems/Scoring.js` | Score, combo, best-score persistence |
| `src/systems/Fuel.js` | Fuel drain/refill/stations |
| `src/systems/CrashDetector.js` | Terrain collision → reset |
| `src/systems/Progression.js` | Unlocks, skins, `localStorage` |
| `src/world/combat/BoltField.js` | Bolt rendering (instanced) |
| `src/world/targets/TargetField.js` | Target rendering (instanced drones + balloons) |
| `src/world/collectibles/StudField.js` | Stud rendering (instanced) |
| `src/world/rings/RingCourse.js` | Ring rendering (instanced torus) |

**Changed files**
| File | Change |
| --- | --- |
| `src/app/Experience.js` | Owns the `Game` system; wires it into the render loop |
| `src/ui/ExplorerUI.js` | HUD: score, combo, targets remaining, fuel gauge, timer, mission tracker, start screen, results screen, fire button (touch) |
| `src/ui/TerrainMinimap.js` | Objective markers (targets, studs, rings, mission target) |
| `src/world/player/AircraftInput.js` | Fire input (Space / touch fire button) |
| `src/audio/ExplorerAudio.js` | New sounds: `shoot`, `explosion`, `hit`, `pickup`, `ring`, `success`, `fail`, `fuelLow` |
| `src/world/WorldConfig.js` | Game tuning (fire rate, bolt speed, target counts/HP, stud density, fuel drain, ring sizes) |
| `readme.md` | Document the game modes + how to play |

**Untouched:** terrain generation, chunk system, renderer, biome definitions,
landmark placement. The game layer sits on top of the world, it does not
rewrite it.

## 7. UI / UX changes

- **Start screen** (new): title, mode select (Adventure / Time Trial /
  Free Flight), best scores, "How to play". Replaces the bare loading card
  as the first thing the player sees.
- **HUD additions:** score (top right), combo badge, **targets remaining**
  ("Targets: 3/8"), fuel gauge (Adventure/Time Trial), mission tracker
  (left, collapsible), timer (Time Trial). Existing biome/speed/coords stay
  where they are.
- **Fire button (touch):** a big fire button on the right side for touch
  players; desktop uses **Space** to fire.
- **Objective beacon:** a floating arrow + distance readout pointing at the
  next target, so the player is never lost.
- **Results screen** (new): mission complete / run over — score breakdown,
  best score, "Next mission" / "Fly again" / "Menu" buttons.
- **Toasts:** reuse the existing toast system for pickups and mission updates.

## 8. Audio additions

All in the existing `ExplorerAudio.js` synth style (no audio files needed):

| Sound | When | Notes |
| --- | --- | --- |
| `shoot` | Plane fires | Short punchy blip, quiet enough to spam |
| `explosion` | Target destroyed | Brick-burst pop + low thump |
| `hit` | Bolt hits a target (no kill) | Small tick so the player knows they connected |
| `pickup` | Stud collected | Short bright chime; pitch rises with combo |
| `ring` | Ring passed | Airy whoosh + chime |
| `success` | Level / mission complete | Little three-note fanfare |
| `fail` | Crash / shot down / time out | Soft low thud (friendly, not harsh) |
| `fuelLow` | Fuel under 25% | Gentle warning blip, not constant |

## 9. Rollout — build it in phases

### Phase 1 — MVP: "It is a game now" (shoot + clear levels)
1. Combat: fire bolts (Space / touch button), bolt pool, hit detection.
2. Moving targets: drones + balloons on seeded paths, HP, destruction +
   explosion VFX.
3. Levels: `levels.json` + `LevelManager` — 5 levels (Forest → Wetlands),
   each cleared by destroying all targets.
4. Scoring: kills, combo, targets-remaining HUD, best score in
   `localStorage`.
5. Start screen + results screen.
6. **Done when:** a player can start, shoot down all targets, clear a
   level, see a score, and come back to beat it.

### Phase 2 — Studs, rings & Time Trial
1. Studs: placement + pickup + score.
2. Ring courses (Forest Loop, Dune Dash, Snow Run) + pass detection.
3. Countdown timer + ring time bonus; best times per course.
4. **Done when:** a full Time Trial run works end to end.

### Phase 3 — Fuel, crash, progression
1. Fuel system + fuel stations.
2. Crash detection + checkpoint reset; shooter drones that fire back.
3. Biome unlocks (all 7 biomes) + plane skins.
4. **Done when:** Adventure spans all 7 biomes (21 levels) with unlocks.

### Phase 4 — Polish
1. Objective beacon + minimap markers.
2. Mission tracker polish, results-screen breakdown.
3. New sounds + volume balance.
4. Mobile tuning (touch joystick already exists; verify HUD + fire button fit).
5. **Done when:** a fresh player can finish Phase 1 levels without help.

**Order matters:** do Phase 1 first and playtest it before adding Phase 2.
Each phase is shippable on its own — the game is never half-broken.

## 10. Testing

- `pnpm test` / `npm test` (existing Node test runner) — add unit tests for
  the pure-logic systems: `Combat` (bolt travel + hit detection), `Targets`
  (movement paths, HP), `LevelManager` (completion), `Scoring` (combo math),
  `MissionManager` (objective completion), `RingPass` (crossing detection),
  `Fuel` (drain/refill).
- Manual playtest checklist per phase: start → find target → shoot → kill →
  level complete → results → best score saved → reload → progress intact.
- Performance: studs and rings use instanced rendering (same pattern as
  prefabs) so the frame cost stays near zero; verify with the existing
  `#debug` panel.

## 11. What this plan deliberately leaves out

- **Multiplayer** — out of scope. The `zaohua-platform-sdk` vendor code has
  multiplayer stubs, but building netcode is a separate project.
- **Accounts / cloud saves** — `localStorage` only, by design.
- **New biomes or terrain changes** — the world is already great; the game
  layer uses what exists.
