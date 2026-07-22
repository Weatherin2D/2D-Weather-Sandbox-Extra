# Next Wave — Concrete Implementation Plan

**Lane chosen:** Recommended next wave (physics authenticity + tools that reuse existing systems).

**Order:**

1. Realistic atmospheric pressure (this document — fully scoped)
2. Dryline + sea-breeze tools
3. Meteogram / time-height panel
4. Procedural terrain generator
5. Scenario packs

---

## Feature 1: Realistic atmospheric pressure

### Problem

Sim `PRESSURE` (`base[2]`) is a **dimensionless fluid / acoustic field** used by the staggered-grid solver. It is **not** meteorological hPa.

Today, anything labeled “surface pressure” is almost entirely **ISA barometric pressure from altitude**:

```js
// app.js — computeColumnSoundingMetrics
sfcPress_hPa = 1013.25 * Math.pow(1.0 - 2.25577e-5 * sfcAltM, 5.25588);
```

Synoptic Low/High only nudge **velocity + temperature**. Weather stations show **no pressure**. `guiControls.surfacePressure` is referenced by the temperature display shader but has **no default** in `guiControls`.

### Approach (chosen)

**Dual pressure model — do not replace fluid `PRESSURE`.**

| Channel | Role |
|---------|------|
| `base[2]` PRESSURE | Keep as fluid projection / wave field (solver unchanged) |
| Meteorological MSLP / station pressure | New derived diagnostic + optional weak synoptic coupling |

**MSLP formula (display + stations + `DISP_SFC_PRES`):**

```
MSLP_hPa = ISA(0) + thermalAnomaly + dynamicAnomaly + synopticAnomaly
```

Where:

- `ISA(z)` — existing barometric formula (keep for CAPE/skew-T vertical coordinate unless Phase B is done)
- `thermalAnomaly` — warm column → lower pressure:  
  `kT * (T_col_mean − T_isa_mean)` over lowest ~1.5 km AGL, reduced to MSL using station elevation
- `dynamicAnomaly` — map near-surface fluid pressure:  
  `kP * mean(base[PRESSURE])` over a small surface neighborhood (same spirit as `temperatureDisplayShader.frag`’s `base[2] * 20.0`, but terrain-aware and clamped)
- `synopticAnomaly` — from placed Synoptic Low/High: smooth radial blob  
  Low: `−A * strength * weight`, High: `+A * strength * weight`

**Phase A (ship first):** diagnostic MSLP only — overlays, stations, synoptic contribution to the **displayed** field. Solver and CAPE keep ISA `P(z)`.

**Phase B (follow-up, out of scope for first PR):** optional hydrostatic `P(z)` for CAPE/skew-T; optional weak write-back of synoptic anomaly into fluid `PRESSURE` (was unstable when tried raw in `boundaryShader.frag`).

### Files to change

| File | Changes |
|------|---------|
| [`app.js`](../app.js) | Add `computeMslpHpa(x, surfaceLevel, opts)` helper; replace ISA-only `sfcPress_hPa` in `computeColumnSoundingMetrics`; add `guiControls.surfacePressure` default (1013.25) + anomaly scale sliders under Advanced; wire synoptic anomaly into MSLP; `Weatherstation.measure()` / `updateCanvas()` / chart dataset for pressure; clarify `DISP_PRESSURE` vs `DISP_SFC_PRES` labels |
| [`shaders/fragment/temperatureDisplayShader.frag`](../shaders/fragment/temperatureDisplayShader.frag) | Use defined `surfacePressure` + documented scale; or remove broken high-P red overlay if MSLP overlay supersedes it |
| [`shaders/fragment/capeShader.frag`](../shaders/fragment/capeShader.frag) | Phase A: no change. Phase B: swap `pressureFromAlt` if hydrostatic lands |
| [`controlHelp.js`](../controlHelp.js) | Help for MSLP overlay, station pressure, synoptic→MSLP coupling, scale sliders |
| [`TODO.md`](../TODO.md) | Check off “Simulate realistic atmospheric pressure” when Phase A ships |
| Save/load path in [`app.js`](../app.js) / [`js/saveLoad.js`](../js/saveLoad.js) | Persist new `guiControls` pressure scales if added (match existing GUI save pattern) |

**No new texture required for Phase A** — MSLP is computed per-column on CPU where sounding overlays and stations already sample.

### Implementation steps

1. Add `isaPressureHpa(altM)` shared helper (dedupe existing formula sites that are easy to touch).
2. Add `computeMslpHpa(...)` with thermal + dynamic + synoptic terms; clamp to ~870–1080 hPa.
3. Use it in `computeColumnSoundingMetrics` for `sfcPress_hPa` (keeps `DISP_SFC_PRES` working).
4. Define `guiControls.surfacePressure = 1013.25` and optional `pressureDynamicScale` / `pressureThermalScale`.
5. Weather station: sample MSLP (and optional station pressure at instrument height); show on canvas; optional history series.
6. Synoptic: when computing MSLP at column `x`, sum contributions from `synopticSystems[]` (same radius/weight as `applySynopticSystemsCpu`).
7. Labels: `DISP_PRESSURE` = “Fluid Pressure”; `DISP_SFC_PRES` = “MSLP (hPa)”.
8. Manual test checklist below; mark TODO done.

### Acceptance criteria (Phase A)

- [x] `DISP_SFC_PRES` varies with column temperature and near-surface fluid convergence/divergence — not altitude alone on flat terrain.
- [x] Placing a Synoptic Low lowers displayed MSLP near the center; High raises it; effect falls off with radius/strength.
- [x] Weather stations show MSLP (hPa) and it updates each measure tick.
- [x] Fluid solver behavior unchanged: same velocity/precip for a given seed when new scales are at defaults and synoptic MSLP is display-only.
- [x] `guiControls.surfacePressure` is defined; temperature-display high-pressure overlay no longer reads `undefined`.
- [x] CAPE / skew-T vertical coordinates still use ISA `P(z)` (Phase A); no CAPE regression on stock analogs.
- [x] Save → reload preserves new pressure GUI scales (via `guiControls` / defaults migration).
- [x] `TODO.md` item checked when merged.

### Out of scope (Phase A)

- Rewriting the fluid pressure solver
- Tornado / hurricane 3D vortices
- Full hydrostatic CAPE rework (Phase B)
- Writing synoptic MSLP directly into `base[PRESSURE]` as the primary forcing

---

## Feature 2: Dryline + sea-breeze tools — IMPLEMENTED

**Goal:** Synoptic-category placeables that force sharp moisture gradients and land/sea circulations.

| Piece | Detail |
|-------|--------|
| Dryline tool | `TOOL_DRYLINE` — moisture boundary + heating contrast + low-level convergence ([`js/synopticBoundaries.js`](../js/synopticBoundaries.js)) |
| Sea-breeze | `TOOL_SEA_BREEZE` placeable + optional Auto Sea Breeze on coasts; day onshore / night offshore from `sunAngle` |
| Files | [`js/synopticBoundaries.js`](../js/synopticBoundaries.js), [`userInteraction/toolRegistry.js`](../userInteraction/toolRegistry.js), [`app.js`](../app.js), [`controlHelp.js`](../controlHelp.js) |
| Acceptance | Dryline moist/dry contrast + Cu along boundary; sea-breeze reverses with sun; save/load via `__savedDrylines` / `__savedSeaBreezes` |

---

## Feature 3: Meteogram / time-height panel — IMPLEMENTED

**Goal:** Time series of T, Td, wind, precip at a station or fixed column.

| Piece | Detail |
|-------|--------|
| UI | Double-click station or Advanced → Overlays → Meteogram Panel ([`js/meteogram.js`](../js/meteogram.js)) |
| Data | Column subsample each station measure (~60 sim-s); ring buffer up to 180 samples (~3 h) |
| Fields | Temperature / dewpoint / RH / wind / cloud heatmap + surface wind·MSLP·precip strip; hover to scrub |
| Acceptance | Scrubbable meteogram; ≥1 sim-hour when 60+ samples; units via `printTemp` / `printVelocity` |

---

## Feature 4: Procedural terrain generator — IMPLEMENTED

**Goal:** Close TODO “Improve terrain generation” — mountains, coastline, valleys with moisture/temp bias.

| Piece | Detail |
|-------|--------|
| UI | Advanced → **Generate Procedural Terrain** (seed / sea / mountains / roughness prompts) |
| Impl | Seeded FBM heightmap → land/sea/lakes + soil/veg/snow; upload via `__applySnapshotInPlace` ([`js/terrainGen.js`](../js/terrainGen.js)) |
| Acceptance | Reproducible from seed; wrap-aware noise; TODO checked |

---

## Feature 5: Scenario packs — IMPLEMENTED

**Goal:** One-click “event days” bundling terrain + sounding forcing + synoptic + tools.

| Piece | Detail |
|-------|--------|
| Packs | Dryline day, lake-effect, sea-breeze coast, fire weather, monsoon surge ([`scenarios/packs.json`](../scenarios/packs.json)) |
| Loader | [`js/scenarios.js`](../js/scenarios.js) — Advanced → **Load Scenario Pack** |
| Acceptance | Pack applies terrain + placeables + GUI time; confirm prompt before replace |

---

## Suggested PR sequence

```text
PR1  Realistic MSLP (Phase A)     ✓
PR2  Dryline + sea-breeze tools   ✓
PR3  Meteogram panel              ✓
PR4  Procedural terrain           ✓
PR5  Scenario packs               ✓
PR6  Roadmap polish (precip×Y, lake depth, albedo, mobile precip) ✓
PR7  MSLP Phase B (hydrostatic CAPE P(z)) — implemented via `useHydrostaticCapePressure` / `beginHydrostaticPressureColumn` (fluid solver PRESSURE unchanged)
```

## Roadmap polish (plan “Already on the roadmap”) — IMPLEMENTED

| Item | Change |
|------|--------|
| Precip × vertical res | `cellHComp = 300/resolution.y` on growth/freeze/melt/evap/fall in [`precipitationShader.vert`](../shaders/vertex/precipitationShader.vert) |
| Lake/sea under sim | Below-domain water color + 45° shores in [`realisticDisplayShader.frag`](../shaders/fragment/realisticDisplayShader.frag) |
| Surface albedos | Tuned `ALBEDO_*` + grass/inert/fresh water in [`common.glsl`](../shaders/common.glsl) / [`boundaryShader.frag`](../shaders/fragment/boundaryShader.frag) |
| Mobile precip | Float-FBO check, mobile droplet caps, auto-reduce in [`app.js`](../app.js) `configurePrecipitationGpuCapabilities` |
