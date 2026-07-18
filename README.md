# 2D Weather Sandbox

## Play online

**[Play here](https://weatherin2d.github.io/2D-Weather-Sandbox-Extra/)** — runs in your browser, no install.

Multiplayer co-op is still **work-in-progress** (may be laggy or glitchy). For local multiplayer testing, run `npm start` and share your LAN URL.

This is a fork of 2D Weather Sandbox. It is provided as-is; behavior may differ from upstream.

Previously called "Weather_Sim_4"

This projects aims to produce a semirealistic two-dimensional, realtime, interactive simulation of the weather in earth's troposphere.


## Clouds and precipitation
Simulating clouds and precipitation are the main objectives of this project.
All the equations relating to water phase change are simplified versions of the real ones, to improve performance and ease programming.
Precipitation is simulated using discrete particles but can be viualized as both partiles and smooth realistic looking curtains.

Forming Cell:
![Screenshot (7)](https://user-images.githubusercontent.com/42830240/232745061-25c860c3-8c52-4704-86af-bcba13f74cd6.png)

Mature Cell 1:
![Screenshot (23)](https://user-images.githubusercontent.com/42830240/232744315-5207396b-57e4-4aaa-968a-e85cd9283f3d.png)
Mature Cell 1 with Precipitation Particles:
![Screenshot (26)](https://user-images.githubusercontent.com/42830240/232744406-ba1c7230-a8b2-492a-85bb-c1c57c1c8a81.png)


Mature Cell 2:
![Screenshot (10)](https://user-images.githubusercontent.com/42830240/232746561-341b867e-9fcd-4d34-b200-61c403695d5a.png)


Mature Cell 3 zoomed out:
![Screenshot (17)](https://user-images.githubusercontent.com/42830240/232746022-dcb4755a-219c-474e-8ae6-8a6ebfadbd0e.png)


Sunlight with realistic colors makes clouds and precipitation look real
![Screenshot (31)](https://user-images.githubusercontent.com/42830240/232749322-d4602f66-015e-4405-9da7-2e4969473c55.png)
![Screenshot (32)](https://user-images.githubusercontent.com/42830240/232749511-1e5c2010-e65a-44eb-bbfe-f9e9b87f5c10.png)



![Bui5](https://user-images.githubusercontent.com/42830240/160260713-32ffee8a-18a2-45bc-98be-b4396793b466.PNG)


## Limitations
Due to the two-dimensional nature of the simulation, it cannot simulate 3D vortices such as tornadoes, dust devils or hurricanes. It can only simulate linear storm systems.


# Example: low intensity cell analysis
Warm moist air is rising into the cloud on the right condensing water and releasing heat until it eventually rises well above the freezing level and forming ice (snow), realeasing even more heat. The snow grows until it descents down under the freezing level and melts into rain, absorbing heat and creating a downdraft. Below the cloud level some of the rain evaporates, absorbing even more heat and strengtening the downward motion. Near the surface the air spreads out sideways and in this case mostly to the right, creating a small low level cold front. This cold front pushes even more warm air up.
![Schermopname (92)_LI](https://user-images.githubusercontent.com/42830240/173361271-23383858-f0d3-485d-91b9-21e0d3c75211.jpg)
The dew points and cape are very low in this example, but it's just enough to form a nice stable cell.
![Naamloos](https://user-images.githubusercontent.com/42830240/173365013-cdea3b40-f470-4390-a8fa-b8d93025d893.png)

# The Code
The simulation is based on a simple fluid simulation topology.
All code was written by me (Niels Daemen) except for the libraries included

## Fluid Model
The fluid model consists of a 2 dimensional grid of cells. 
Each cell has the following properties:

<img width="1095" alt="image" src="https://github.com/niels747/2D-Weather-Sandbox/assets/42830240/f08e08e9-4d96-4d80-b890-1f213085668f">


These properties are not simply defined at the center of each cell, but using a so called staggered grid. the velocities are defined exactly on the border between cells. They are therefore exactly in between the centers of the cells, which is where the pressures are defined. In this way the velocities define the exact flow rate from one cell to its neighbor. This makes calculating new velocities and pressures very simple.

![image](https://github.com/niels747/2D-Weather-Sandbox/assets/42830240/107d58f9-359c-4507-b7a9-bb1019a60934)


### Iteration
One iteration or timestep consists of the following steps:
1.	Calculating pressure 
2.	Calculating velocities
3.	Advection
Every step is completed for each cell in the grid, before the next step is executed.



### Calculating pressure
Pressure can be imagined as being the amount of fluid that is in a cell.
The velocities can be imagined as a flow of fluid from a cell to a neighbouring cell. Therefore the change in pressure is equal to the net inflow to the cell this is also known as the divergence (or convergence) in the velocity vector field. To calculate the net inflow to the cell, the total outflow is simply subtracted from the total inflow. This is done for both x and y directions. 

<img width="460" alt="image" src="https://github.com/niels747/2D-Weather-Sandbox/assets/42830240/b2500548-5145-451f-b67b-84d2d8673811">

![image](https://github.com/niels747/2D-Weather-Sandbox/assets/42830240/83ea332f-c5c9-46de-8afb-5a0bf28c7b31)



### Calculating velocities

The change in the velocity trough a point is proportional to the pressure across it. This is basically just Newton's 2nd law (F = m * a) Pressure is force / area, and since the area of the cell is constant, the force (F) is simply the pressure gradient across the point. The mass (M) is also assumed to be constant as if the fluid has a constant density, this is not physically accurate. The acceleration (a) is then simply a function of the pressure gradient. Acceleration is simply the change in velocity / time, and because the timestep is constant all that remains is simply adding the pressure gradients to the velocities for both x and y axis:


<img width="566" alt="image" src="https://github.com/niels747/2D-Weather-Sandbox/assets/42830240/3c8714fc-8b32-4fa8-8591-3a07509001a7">




## Libraries

The simulation and visualization itself is entirely custom js and glsl written by me (Niels Daemen). The sounding graph, keyboard and mouse controls are also custom code. The simulation can run and be partly controlled without any libraries. I do however use the following libraries for part of the user interface and file compression:

DatGui: Used for the user interface because it's very easy to add more controllable variables. It is however getting a bit cluttered and other options should be evaluated. Building a custom interface is also an option.

Pako: Only used for data compression to reduce save file sizes. Size reduction can be 2-4 times depending on the state of the simulation. Not essential. Downside is that it takes longer to save and load files.
  
# How to run it locally and modify code

### Quick start (game + multiplayer)

```bash
npm install
npm start
```

Open **http://localhost:8080** in your browser. Multiplayer works automatically — no separate relay terminal.

### VS Code + Live Server (single-player only)

  1. Install VS code: https://code.visualstudio.com/
  2. Install VS Code extensions:
   * Live Server (required)
   * GLSL lint (recommended)
   * Clang-Format, requires installing CLANG/LLVM: https://github.com/llvm/llvm-project/releases/tag/llvmorg-16.0.0 (recommended)
  
  3. Clone project using GIT, or just download ZIP
  4. Open project folder in VS Code
  5. Open index.html
  6. Start live server (Go Live), automatically opens page in browser

Note: Live Server does **not** include multiplayer. Use **Open in browser** in the menu (points at GitHub Pages) or run `npm start` for local multiplayer.

## Deploy online (GitHub Pages — recommended)

The game is hosted on **GitHub Pages** so it stays free and does not depend on Render monthly quotas.

1. Push to GitHub (`main` branch).
2. In the repo go to **Settings → Pages** → Source: **GitHub Actions** (the included [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) deploys automatically on push to `main`).
3. When the workflow finishes, open **https://weatherin2d.github.io/2D-Weather-Sandbox-Extra/**
4. In repo **Settings → General → Website**, set the URL to the same GitHub Pages link.

[`network/config.js`](network/config.js) and [`package.json`](package.json) `homepage` already point at this URL for local copies and the “Open in browser” button.

### Optional: Render (multiplayer relay)

If you still want a Node server with WebSocket relay (e.g. when Render quota is available), use [`render.yaml`](render.yaml) on [Render.com](https://render.com). Free tier sleeps after inactivity; first connection may take ~30 seconds.

### Local multiplayer (WIP)

| Who | What to do |
|-----|------------|
| Host | `npm install` then `npm start` → open http://localhost:8080 → **Host Game** (optional room password) |
| Friends (same network) | Open the host's `http://<host-ip>:8080` → **Join Game** with room code (and password if set) |

Room codes are 8 characters. The relay limits payload size and rate-limits connections. Multiplayer is experimental — expect lag, desync, or broken sessions.

Sounding imports use a CORS proxy; only `meteociel.fr` hosts are allowed client-side. Override the proxy base with `window.__WEATHER_CORS_PROXY` if you host your own Worker (restrict it to those hosts).
