# 2D Weather Sandbox

## Project Overview
A semi-realistic, real-time, two-dimensional interactive weather simulation (fork of Niels Daemen's 2D Weather Sandbox). It simulates atmospheric processes in Earth's troposphere, including cloud formation, precipitation (rain, snow, hail), fluid dynamics, synoptic tools, sounding/meteogram analysis, replay/forecast, and a flight simulator mode.

## Tech Stack
- **Frontend:** Pure HTML5 + JavaScript (ES6+), no framework
- **Graphics:** WebGL 2 with raw GLSL shaders for GPU-accelerated fluid dynamics and rendering
- **Web Workers:** none; lightning is driven by `lightningV2.js`
- **Build System:** None — static files served directly (or via Node for multiplayer)
- **Package Manager:** `npm` for the local server/`ws` relay; browser libs bundled in `libraries/`

## Local Dependencies (in `libraries/`)
- `dat.gui.min.js` — Interactive control panels for simulation parameters
- `pako.min.js` — Gzip compression for save files (`.weathersandbox` format)
- `chart.js` + `chartjs-adapter-date-fns.js` — Weather station / sounding charts

## Project Structure
```
/
├── index.html                 # Entry point, menus, shared overlay CSS
├── app.js                     # Main simulation logic (large monolith)
├── controlHelp.js             # Hover help for tools and GUI controls
├── lightningV2.js             # Lightning strike system
├── aviationTraffic.js         # Air traffic overlay
├── soundingAnalogPresets.js   # Skew-T analog presets
├── js/                        # Feature modules (replay, meteogram, terrain, scenarios, …)
├── shaderMenu/                # Look packs, cloud/rain, sky textures
├── userInteraction/           # Tools, custom brushes, expression lang
├── network/                   # Multiplayer client (WIP)
├── server/                    # Static serve + WebSocket relay
├── libraries/                 # Bundled third-party JS
├── shaders/                   # GLSL fragment / vertex shaders
├── scenarios/                 # Scenario pack JSON
├── resources/                 # Textures, sounds, images
├── saves/                     # Pre-made .weathersandbox states
└── docs/                      # Design notes (next-wave archive, diagrams)
```

## Development Server

The app runs as a **unified Node server** that serves the game and multiplayer on one port:

```bash
npm install
npm start
```

Open **http://localhost:8080** — single-player and multiplayer both work from this URL.

Legacy static-only serving (multiplayer will not work):

```bash
npx serve . -p 5000
```

## Multiplayer

Multiplayer is built into the server — no separate relay process. Players open the site, enter a name, and click **Host Game** or **Join Game**. Status: experimental (lag/desync possible).

**Local:** run `npm start` and open two browser tabs to `http://localhost:8080`.

**Online:** deploy a Node host (e.g. Render) and share that URL. GitHub Pages is static-only and **cannot** run multiplayer.

## Deploy

- **Single-player:** GitHub Pages via `.github/workflows/deploy-pages.yml` → https://weatherin2d.github.io/2D-Weather-Sandbox-Extra/
- **Optional multiplayer relay:** Render blueprint via [`render.yaml`](render.yaml) (free tier sleeps after inactivity).
