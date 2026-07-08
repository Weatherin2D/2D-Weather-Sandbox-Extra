# 2D Weather Sandbox

## Project Overview
A semi-realistic, real-time, two-dimensional interactive weather simulation built by Niels Daemen. It simulates atmospheric processes in Earth's troposphere, including cloud formation, precipitation (rain, snow, hail), fluid dynamics (pressure and velocity), and a flight simulator mode.

## Tech Stack
- **Frontend:** Pure HTML5 + JavaScript (ES6+), no framework
- **Graphics:** WebGL 2 with raw GLSL shaders for GPU-accelerated fluid dynamics and rendering
- **Web Workers:** Used for off-main-thread computations (lightning generation via `lightningGenerator.js`)
- **Build System:** None — static files served directly
- **Package Manager:** None — all dependencies bundled locally in `libraries/`

## Local Dependencies (in `libraries/`)
- `dat.gui.min.js` — Interactive control panels for simulation parameters
- `pako.min.js` — Gzip compression for save files (`.weathersandbox` format)
- `chart.js` + `chartjs-adapter-date-fns.js` — Meteorological sounding graphs

## Project Structure
```
/
├── index.html              # Entry point and UI layout
├── app.js                  # Main simulation logic (~6,700 lines)
├── lightningGenerator.js   # Web Worker for lightning bolt generation
├── libraries/              # Bundled third-party JS libraries
├── shaders/
│   ├── fragment/           # GLSL fragment shaders (advection, precipitation, etc.)
│   └── vertex/             # GLSL vertex shaders
├── resources/
│   ├── img/                # Textures and UI icons
│   └── sounds/             # Ambient audio files
├── saves/                  # Pre-made simulation state files (.weathersandbox)
└── docs/                   # Technical documentation and diagrams
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

Multiplayer is built into the server — no separate relay process. Players open the site, enter a name, and click **Host Game** or **Join Game**.

**Local:** run `npm start` and open two browser tabs to `http://localhost:8080`.

**Online:** deploy to Render (see below) and share your `https://*.onrender.com` URL.

GitHub Pages hosts static files only and **cannot** run multiplayer.

## Deploy to Render (recommended)

1. Push this repo to GitHub.
2. Create a [Render](https://render.com) account and **New → Blueprint** (or Web Service).
3. Connect the repo — Render reads [`render.yaml`](render.yaml) automatically.
4. Deploy completes with `npm start` — visit your `https://weather-sandbox.onrender.com` URL.
5. Share that URL with friends; Host/Join works with no terminal commands.

Free tier note: the server sleeps after inactivity. First connection may take ~30 seconds to wake up — use **Test connection** on the menu if needed.

## Deployment (legacy static)

Configured as a **static** deployment. The entire project root (`.`) is the public directory. Use this for GitHub Pages single-player only.
