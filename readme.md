# BRICKLAND

A little adventure with no finish line. Fly a brick-built plane through a procedural world of forests, rivers, dunes, and snow.

> **中文说明：** 本仓库原为中文项目，现已全部翻译为英文，并改造成了一款游戏 —— 驾驶积木飞机开火，射击移动目标，完成关卡。
> *(This repo was originally a Chinese project. It has been fully translated into English and turned into a game — fly a brick plane, fire bolts, shoot moving targets, and complete levels.)*

[![A brick-built plane above the forest and riverbank](docs/readmeImg/optimized/hero.webp)](https://lego-stylized-nature.pages.dev/)

**[Play live ↗](https://lego-stylized-nature.pages.dev)** · [Watch the flight](docs/readmeImg/optimized/flight-demo.mp4)

## Take flight

Skim the treetops, follow a bend in the river, and let curiosity choose your next stop.

[![Flight preview: turning through a brick-built forest](docs/readmeImg/optimized/flight-preview.gif)](docs/readmeImg/optimized/flight-demo.mp4)

*A 5-second loop; click for the full 7-second recording.*

## World gallery

From green riverbanks to snow-covered hills, every landscape has its own palette.

<table>
  <tr>
    <td width="50%">
      <img src="docs/readmeImg/optimized/landscape.webp" alt="A plane among forest greenery, flowers, and rivers" width="100%">
      <br><strong>Verdant forest</strong>
      <br>Leafy canopies, small flowers, and terraced riverbanks.
    </td>
    <td width="50%">
      <img src="docs/readmeImg/optimized/biome1.webp" alt="Orange autumn woodland crossed by blue rivers" width="100%">
      <br><strong>Autumn woodland</strong>
      <br>Blue rivers wind through valleys of warm autumn color.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/readmeImg/optimized/biome2.webp" alt="Wetland islands and aquatic plants" width="100%">
      <br><strong>Waterside wetlands</strong>
      <br>Small islands and aquatic plants dot the open water.
    </td>
    <td width="50%">
      <img src="docs/readmeImg/optimized/biome3.webp" alt="A monumental brick arch among golden dunes" width="100%">
      <br><strong>Golden dunes</strong>
      <br>A monumental arch waits among the rolling dunes.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/readmeImg/optimized/biome4.webp" alt="Snowy woodland, white hills, and blue lakes" width="100%">
      <br><strong>Snowy forest</strong>
      <br>White hills and evergreen trees surround vivid blue lakes.
    </td>
    <td width="50%">
      <img src="docs/readmeImg/optimized/flight.webp" alt="A plane banking over autumn trees with wingtip trails" width="100%">
      <br><strong>On the wing</strong>
      <br>Bank over the trees with trails following the wingtips.
    </td>
  </tr>
</table>

## About

BRICKLAND is a browser-based, brick-styled nature exploration project, bringing the charm of a miniature landscape into a world you can fly through.

- **Seven biomes** — Verdant forests, autumn woodlands, golden dunes, lava valleys, snowy forests, flower meadows, and waterside wetlands.
- **A world that unfolds** — Seed-based procedural terrain, generated and loaded in chunks as you explore.
- **Brick-built detail** — Layered terrain, studs, vegetation, water, and a plane that banks into turns with wingtip trails.

## Controls

For the best experience, use a recent desktop browser with WebGPU support and hardware acceleration enabled.

| Input | Action |
| --- | --- |
| `W` / `↑` | Forward thrust |
| `S` / `↓` | Reverse thrust |
| `A` / `←` | Turn left |
| `D` / `→` | Turn right |
| Touch joystick (bottom left) | Fly in the direction you push |
| `Space` | Fire bolts |
| `P` | Pause / resume flight |
| `H` | Hide / show the HUD |
| `M` | Toggle sound |
| Map expand button (top-right of minimap) | Expand / collapse the map |
| `Esc` | Collapse the expanded map |

The camera follows the aircraft from a fixed angle. Point the joystick where you want to go: pushing right while flying forward banks the aircraft into a right-hand arc. Push farther for more speed and wider turns. Release to level out and coast to a stop. Use the top toolbar to return home, toggle fullscreen, or open help.

## Run locally

Install [Node.js](https://nodejs.org/) (22 LTS or newer recommended) and [pnpm](https://pnpm.io/installation), then run from the project directory:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed in the terminal. Append `#debug` during development to open the debug panel.

```sh
# Run tests
pnpm test

# Build to dist/
pnpm build
```

## Under the hood & acknowledgements

Built with **Three.js · WebGPU · TSL · Vite**, with **simplex-noise** for procedural noise and **Tweakpane** for development controls. Terrain chunks, Web Workers, instanced rendering, and custom shading bring the brick-built world to life.

The project grew from a Three.js TSL learning template. Thanks to the open-source tools and learning resources behind it:

Special thanks to [Three.js Journey](https://threejs-journey.com/) and [Bruno Simon](https://bruno-simon.com/) for the learning resources and creative inspiration behind this project.

- [Three.js](https://threejs.org/) · [Three.js Shading Language](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [Three.js WebGPU examples](https://threejs.org/examples/?q=webgpu) · [TSL textures](https://github.com/boytchev/tsl-textures)
- [Vite](https://vite.dev/) · [Tweakpane](https://tweakpane.github.io/docs/) · [simplex-noise](https://github.com/jwagner/simplex-noise.js)

More implementation notes live in [`docs/`](docs/).
