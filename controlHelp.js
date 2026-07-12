/**
 * Contextual help overlays for simulation tools and dat.GUI settings.
 */
const ControlHelp = (function() {
  'use strict';

  const TOOL_HELP = {
    TOOL_NONE: {
      title: 'Flashlight',
      body: 'Default view mode. Click and drag to pan the camera. Scroll to zoom. No painting — use this to explore the simulation without changing the atmosphere.',
      keys: 'Esc',
    },
    TOOL_TEMPERATURE: {
      title: 'Temperature',
      body: 'Paint warmer or cooler air. Click and drag on the simulation. Higher brush intensity changes temperature faster. Use the invert option to cool instead of heat.',
      keys: 'Q',
    },
    TOOL_WATER: {
      title: 'Water Vapor / Cloud',
      body: 'Add or remove moisture and cloud water. Essential for building clouds, fog, and storms. Combine with the temperature tool to trigger convection.',
      keys: 'W',
    },
    TOOL_WALL_LAND: {
      title: 'Land',
      body: 'Draw dry land terrain. Surface type affects evaporation, vegetation, and how the ground heats under sunlight.',
      keys: 'E',
    },
    TOOL_WALL_FRESH: {
      title: 'Fresh Water / Lake',
      body: 'Paint lakes and rivers. Fresh water evaporates and can modify local humidity and lake-breeze circulations.',
      keys: 'R',
    },
    TOOL_WALL_SEA: {
      title: 'Salt Water / Ocean',
      body: 'Paint ocean surfaces. Oceans provide a large moisture source and stabilize coastal temperatures.',
      keys: 'T',
    },
    TOOL_WALL_ICE_SHEET: {
      title: 'Ice Sheet',
      body: 'Place flat ice sheets. High albedo — reflects sunlight and keeps the surface cold.',
      keys: 'Y',
    },
    TOOL_WALL_ICE_CAP: {
      title: 'Ice Cap / Glacier',
      body: 'Draw sloped glacial ice. Useful for mountain snowpack and cold elevated terrain.',
      keys: 'U',
    },
    TOOL_WALL_URBAN: {
      title: 'Urban',
      body: 'Dense city surfaces. Heats quickly during the day and can enhance local convection and storms.',
      keys: '1',
    },
    TOOL_WALL_SUBURBAN: {
      title: 'Suburban',
      body: 'Lighter built-up areas between city and countryside. Moderate heat retention and evaporation.',
      keys: '2',
    },
    TOOL_WALL_RUNWAY: {
      title: 'Runway',
      body: 'Flat paved surfaces. Very low vegetation and distinct heating characteristics.',
      keys: '3',
    },
    TOOL_WALL_INDUSTRIAL: {
      title: 'Industrial',
      body: 'Industrial zones with distinct surface properties. Can act as localized heat sources.',
      keys: '4',
    },
    TOOL_WALL_FIRE: {
      title: 'Fire',
      body: 'Ignite vegetation where grass or forest exists. Fire spreads with wind, produces smoke, and releases heat.',
      keys: 'I',
    },
    TOOL_SMOKE: {
      title: 'Smoke / Dust',
      body: 'Add airborne smoke or dust. Absorbs sunlight, warms the air, and reduces visibility in the realistic view.',
      keys: 'O',
    },
    TOOL_WALL_MOIST: {
      title: 'Soil Moisture',
      body: 'Wet or dry the soil under vegetation. Affects evaporation, vegetation health, and surface coloring.',
      keys: 'P',
    },
    TOOL_VEG_GRASS: {
      title: 'Grass / Shrub',
      body: 'Paint grassy vegetation. Increases evaporation and can fuel fire spread. Color varies with soil moisture.',
      keys: 'A',
    },
    TOOL_VEG_FOREST: {
      title: 'Forest',
      body: 'Paint forest canopy. Stronger evaporation and fuel for larger fires than grass.',
      keys: 'S',
    },
    TOOL_WALL_SNOW: {
      title: 'Snow',
      body: 'Add snow cover on terrain. High albedo cools the surface and affects precipitation behavior.',
      keys: 'D',
    },
    TOOL_WIND: {
      title: 'Wind',
      body: 'Push air horizontally by dragging. Creates shear, convergence, and can organize storms. Whole-width mode applies wind across the full domain width.',
      keys: 'F',
    },
    TOOL_CHARGE: {
      title: 'Charge',
      body: 'Manually add atmospheric electrical charge in clouds. Use invert to remove charge. Drives lightning when storms are mature.',
      keys: 'G',
    },
    TOOL_STATION: {
      title: 'Weather Station',
      body: 'Click to place a weather station. Shows live conditions and history plots for temperature, wind, humidity, and radiation.',
      keys: 'H (then click)',
    },
    TOOL_BALLOON: {
      title: 'Weather Balloon',
      body: 'Click to launch a sounding balloon. Ascends through the atmosphere and feeds skew-T and hodograph data.',
      keys: 'J (then click)',
    },
    TOOL_RADAR: {
      title: 'Radar Tower',
      body: 'Place a Doppler radar tower. Open its menu to change product, range, and sensitivity. Supports reflectivity, velocity, and more.',
      keys: 'K (then click)',
    },
    TOOL_AIRMASS: {
      title: 'Airmass Generator',
      body: 'Place a device that continuously modifies temperature and moisture in a region. Useful for feeding storms or testing boundaries.',
      keys: 'L (then click)',
    },
    TOOL_MARKER: {
      title: 'Marker',
      body: 'Drop a map marker for reference. Does not affect the simulation physics.',
      keys: 'M (then click)',
    },
    TOOL_NUKE: {
      title: 'Nuke',
      body: 'Detonate a nuclear-scale heat and smoke burst. Adjust blast radius, temperature, and smoke in the Nukes settings folder.',
      keys: 'N (then click)',
    },
  };

  const SETTING_HELP = {
    vorticity: 'Rotational stirring in the fluid. Higher values add turbulent eddies; lower values look smoother.',
    dragMultiplier: 'Air resistance on wind. Higher drag calms strong flows more quickly.',
    wind: 'Background horizontal wind applied across the domain.',
    globalDrying: 'Slowly removes moisture everywhere below the altitude limits.',
    globalHeating: 'Uniform heating or cooling applied below the altitude limits.',
    soundingForcing: 'Nudges the atmosphere toward the sounding profile on the right side of the map.',
    globalEffectsStartAlt: 'Lowest altitude (meters) where global drying/heating applies.',
    globalEffectsEndAlt: 'Highest altitude (meters) where global drying/heating applies.',
    tool: 'Active painting or placement tool. Also switch with keyboard shortcuts (see key column in Controls).',
    brushSize: 'Diameter of the tool brush in simulation cells.',
    wholeWidth: 'Apply the tool across the entire width of the map at the current height.',
    brushIntensity: 'Strength of each paint stroke. Higher values change fields faster.',
    invertTool: 'Reverses the tool effect — e.g. cool instead of heat, remove instead of add.',
    allowCaves: 'Allow terrain to have overhangs and enclosed air pockets underground.',
    timeOfDay: 'Time in hours (0–24). Noon is 12:00. Drives sun position when day/night cycle is on.',
    dayNightCycle: 'Automatically advance time and move the sun. Turn off to set sun angle manually.',
    accelerateNight: 'Speed through nighttime faster than daytime for shorter nights.',
    latitude: 'Latitude for the solar path. Affects day length and sun height through the year.',
    month: 'Month of the year (1–12). Changes solar declination and day/night balance.',
    sunAngle: 'Sun elevation in degrees (manual mode). 90° is directly overhead.',
    sunIntensity: 'Strength of incoming solar radiation. 1.0 is roughly realistic clear-sky flux.',
    greenhouseGases: 'Trace greenhouse gas absorption of outgoing longwave radiation.',
    waterGreenHouseEffect: 'Water-vapor greenhouse effect strength in the radiation model.',
    IR_rate: 'Multiplier on infrared radiative transfer speed.',
    waterTemperature: 'Default temperature of lakes and oceans in °C.',
    dynamicWaterTemperature: 'Let water bodies heat and cool from sunlight and air contact.',
    landEvaporation: 'Moisture added to the air from vegetated land.',
    waterEvaporation: 'Moisture added from open water surfaces.',
    evapHeat: 'Cooling of the surface when evaporation occurs.',
    meltingHeat: 'Energy absorbed when snow or ice melts.',
    condensationRate: 'How quickly excess vapor condenses into cloud water.',
    waterWeight: 'Weight of cloud water on dynamics — higher values make clouds sink more.',
    aboveZeroThreshold: 'Cloud water needed to spawn rain above 0°C.',
    subZeroThreshold: 'Cloud water needed to spawn snow below 0°C.',
    spawnChance: 'Probability per step that precipitation particles spawn.',
    snowDensity: 'Density of snow particles relative to rain.',
    fallSpeed: 'Terminal fall speed scale for precipitation particles.',
    displayMode: 'Visualization mode — realistic view, raw fields, radar products, and more.',
    exposure: 'HDR exposure for the realistic view. Raise to brighten dark scenes.',
    camSpeed: 'Camera pan speed when using smooth camera controls.',
    wrapHorizontally: 'Wrap the view horizontally so the map tiles side to side when zoomed out.',
    SmoothCam: 'Smooth interpolated camera movement instead of instant jumps.',
    showGraph: 'Show the skew-T / sounding graph at the cursor or fixed position.',
    showDrops: 'Draw individual precipitation particles over the realistic view.',
    saturation: 'Color saturation in post-processing.',
    contrast: 'Image contrast in post-processing.',
    starVisibility: 'Brightness of stars at night in the realistic view.',
    autoMinShadowLight: 'Automatically lift shadow brightness near twilight so night scenes are not pure black.',
    minShadowLight: 'Minimum shadow fill light (0 = darkest shadows).',
    enablePrecipitation: 'Master switch for rain, snow, and hail particle simulation.',
    IterPerFrame: 'Physics iterations per rendered frame. Higher = faster simulation time, lower FPS.',
    auto_IterPerFrame: 'Automatically tune iterations per frame to hold a target frame rate.',
    sound: 'Enable environmental wind and storm audio.',
    enableBloom: 'HDR bloom on bright clouds and lightning.',
    performanceAutoScaling: 'Reduce visual quality under load to keep the frame rate stable.',
    enableVectorField: 'Overlay wind arrows in the realistic view when zoomed in.',
    skipLightingCalculation: 'Skip the radiation/lighting pass for a large performance gain. Shadows freeze.',
    skipCurlCalculation: 'Skip vorticity calculation — faster but less turbulent flow.',
    skipCAPECalculation: 'Skip CAPE calculation — faster storm thermodynamics.',
    skipAdvection: 'Skip fluid advection — atmosphere stops flowing (tools still work).',
    skipChargeCalculation: 'Skip automatic charge buildup — lightning needs manual charge tool.',
    showControlHelp: 'Show the help panel describing the active tool and hovered settings.',
    paused: 'Pause the simulation. Sound and lightning visuals also pause.',
    radarOverlay: 'Draw radar data on top of the realistic view.',
    radarOpacity: 'Opacity of the radar overlay.',
    nukeBlastRadius: 'Radius of the thermal blast in cells.',
    nukeTemperature: 'Peak temperature added by a nuke detonation.',
    lightningRenderStyle: 'Enhanced GPU lightning (V2) or legacy particle-based bolts.',
    globalLightningMultiplier: 'Overall scale for lightning frequency.',
    lightningBrightness: 'Brightness of lightning bolt rendering.',
    flashDuration: 'How long lightning flashes illuminate the scene.',
    chargeGenerationRate: 'How quickly storms build electrical charge naturally.',
    gpuEffectQuality: 'Quality of GPU lightning and shadow smoothing effects.',
    realtimeMode: 'Run simulation time 1:1 with your system clock.',
    airplaneMode: 'Fly an aircraft through the clouds in first-person style.',
    lightningIllumTexture: 'Pre-render lightning scene illumination to textures for stable flashes. Bolts stay procedural.',
  };

  const FOLDER_HELP = {
    Fluid: 'Core atmosphere dynamics — wind stirring, drag, and global nudging.',
    'User Interaction': 'Tools for painting the atmosphere and terrain, plus brush options.',
    Radiation: 'Sun, time of day, and greenhouse-gas radiation settings.',
    Water: 'Evaporation, condensation, and water body temperatures.',
    Precipitation: 'Rain, snow, and hail formation thresholds and behavior.',
    Radar: 'On-map radar overlay, world radar, and lightning icons.',
    Lightning: 'Lightning appearance, frequency, and storm electrification.',
    Display: 'Visual modes, camera, color grading, and units.',
    Advanced: 'Performance toggles, precipitation, and simulation speed.',
    Nukes: 'Parameters for the nuke placement tool.',
    'Skew-T': 'Weather balloon ascent and sounding graph options.',
  };

  let panelEl = null;
  let titleEl = null;
  let bodyEl = null;
  let keysEl = null;
  let controls = null;
  let enabled = true;
  let hoverKey = null;
  let lastTool = null;

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'controlHelpPanel';
    panelEl.innerHTML =
      '<div class="chp-inner">' +
        '<div class="chp-title"></div>' +
        '<div class="chp-body"></div>' +
        '<div class="chp-keys"></div>' +
      '</div>';
    document.body.appendChild(panelEl);
    titleEl = panelEl.querySelector('.chp-title');
    bodyEl = panelEl.querySelector('.chp-body');
    keysEl = panelEl.querySelector('.chp-keys');

    if (!document.getElementById('controlHelpStyles')) {
      const style = document.createElement('style');
      style.id = 'controlHelpStyles';
      style.textContent =
        '#controlHelpPanel{position:fixed;left:12px;bottom:12px;max-width:min(420px,calc(100vw - 440px));' +
        'z-index:950;pointer-events:none;opacity:0;transform:translateY(8px);' +
        'transition:opacity .2s ease,transform .2s ease;font-family:Arial,sans-serif;}' +
        '#controlHelpPanel.visible{opacity:1;transform:translateY(0);}' +
        '#controlHelpPanel .chp-inner{background:rgba(12,14,22,.88);border:1px solid rgba(74,144,226,.35);' +
        'border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.45);backdrop-filter:blur(8px);}' +
        '#controlHelpPanel .chp-title{font-size:13px;font-weight:600;color:#7eb8ff;margin-bottom:4px;letter-spacing:.02em;}' +
        '#controlHelpPanel .chp-body{font-size:12px;line-height:1.45;color:#d8dde8;}' +
        '#controlHelpPanel .chp-keys{margin-top:6px;font-size:11px;color:#8a93a8;}' +
        '#controlHelpPanel .chp-keys strong{color:#a8c4e8;font-weight:600;}' +
        '.dg .cr.ch-help-hover{background:rgba(74,144,226,.12)!important;}' +
        '@media(max-width:900px){#controlHelpPanel{max-width:calc(100vw - 24px);left:12px;right:12px;}}';
      document.head.appendChild(style);
    }
  }

  function setContent(title, body, keys) {
    ensurePanel();
    titleEl.textContent = title || '';
    bodyEl.textContent = body || '';
    if (keys) {
      keysEl.innerHTML = 'Shortcut: <strong>' + keys + '</strong>';
      keysEl.style.display = '';
    } else {
      keysEl.textContent = '';
      keysEl.style.display = 'none';
    }
  }

  function refreshVisibility() {
    ensurePanel();
    const show = enabled && controls && controls.showControlHelp !== false;
    const hasContent = titleEl.textContent.length > 0;
    panelEl.classList.toggle('visible', show && hasContent);
  }

  function showTool(tool) {
    if (!enabled || !controls || controls.showControlHelp === false) {
      refreshVisibility();
      return;
    }
    if (hoverKey) return;
    const info = TOOL_HELP[tool];
    if (!info) {
      setContent('', '', '');
      refreshVisibility();
      return;
    }
    setContent(info.title, info.body, info.keys || '');
    refreshVisibility();
  }

  function showSetting(property, label) {
    if (!enabled || !controls || controls.showControlHelp === false) return;
    const body = SETTING_HELP[property];
    if (!body) return;
    hoverKey = property;
    setContent(label || property, body, '');
    refreshVisibility();
  }

  function clearHover() {
    hoverKey = null;
    if (controls && controls.tool)
      showTool(controls.tool);
    else
      refreshVisibility();
  }

  function onRowEnter(row, property, label) {
    row.classList.add('ch-help-hover');
    showSetting(property, label);
  }

  function onRowLeave(row) {
    row.classList.remove('ch-help-hover');
    clearHover();
  }

  function attachRow(row, property, label) {
    if (!row || row.dataset.chHelpBound) return;
    row.dataset.chHelpBound = '1';
    row.addEventListener('mouseenter', function() { onRowEnter(row, property, label); });
    row.addEventListener('mouseleave', function() { onRowLeave(row); });
  }

  function walkFolder(folder) {
    if (!folder) return;
    const folderName = folder.name;
    if (folder.domElement) {
      const titleBtn = folder.domElement.querySelector('.title');
      if (titleBtn && !titleBtn.dataset.chHelpBound) {
        titleBtn.dataset.chHelpBound = '1';
        const fHelp = FOLDER_HELP[folderName];
        if (fHelp) {
          titleBtn.addEventListener('mouseenter', function() {
            if (!enabled || !controls || controls.showControlHelp === false) return;
            hoverKey = 'folder:' + folderName;
            setContent(folderName, fHelp, '');
            refreshVisibility();
          });
          titleBtn.addEventListener('mouseleave', clearHover);
        }
      }
    }
    if (folder.__controllers) {
      for (const c of folder.__controllers) {
        if (!c || !c.property || typeof controls[c.property] === 'function') continue;
        const row = c.domElement;
        const label = (c.name && c.name()) || c.property;
        attachRow(row, c.property, label);
      }
    }
    if (folder.__folders) {
      const subs = Array.isArray(folder.__folders) ? folder.__folders : Object.values(folder.__folders);
      for (const sub of subs) walkFolder(sub);
    }
  }

  const SKY_HELP = {
    'Time of day (hours)': 'Clock hour (0–24). Drives sun position when the day/night cycle is enabled.',
    'Sun angle (°)': 'Manual sun elevation. 90° is overhead; lower values mean a lower sun.',
    'Month': 'Calendar month — shifts day length and solar declination.',
    'Latitude (°)': 'Observer latitude for the solar path and day/night balance.',
    'Sun intensity': 'Scales incoming solar radiation strength.',
    'Min shadow light': 'Minimum fill light in shadows. 0 is darkest.',
    'Star visibility': 'How bright stars appear at night.',
    'Star light emit': 'How much light stars add to the night sky.',
    'Star density': 'How many stars are visible.',
  };

  const COLOR_SCALE_TAB_HELP = {
    'RH': 'Relative humidity color scale used in moisture display modes.',
    'Temp': 'Temperature color scale for thermal display modes.',
    'CAPE': 'Convective available potential energy colors on risk overlays.',
    'Hail': 'Hail size or intensity color scale.',
    'Wind': 'Wind speed color scale for velocity displays.',
    'Precip': 'Precipitation intensity color scale.',
    'IR': 'Infrared temperature or heating color scale.',
    'Soil': 'Soil moisture color scale.',
    'Risk': 'Convective risk overlay color scale.',
  };

  const COLOR_SCALE_ACTION_HELP = {
    '+ Add': 'Insert a new color stop into the active scale.',
    '− Remove': 'Delete the selected color stop.',
    'Copy': 'Copy the current scale JSON to the import/export box.',
    'Paste': 'Apply scale colors from the JSON in the import/export box.',
    '↺ Apply': 'Apply manual JSON edits from the text area.',
    '↓ Import': 'Load scale colors from the JSON text area.',
    '⎘ Copy to Clipboard': 'Copy the active scale definition to the clipboard.',
    'Interpolate stops': 'Smoothly blend colors between stops instead of hard steps.',
  };

  const KEYBIND_HELP = {
    panel: 'Remap keyboard shortcuts for tools, camera, and simulation controls. Click Change, then press the desired key.',
    change: 'Start listening for a new key assignment.',
    clear: 'Remove the binding for the selected action.',
    reset: 'Restore all keybinds to defaults.',
  };

  const ENTITY_HELP = {
    'radar-product': 'Radar product to display — reflectivity, velocity, correlation coefficient, and more.',
    'radar-range': 'Maximum range of the radar beam in simulation cells.',
    'radar-resolution': 'Gate size — smaller values give sharper but noisier data.',
    'radar-sensitivity': 'Gain applied to weak returns. Raise to see light precipitation.',
    'radar-overlay': 'Draw this radar on the realistic view while the menu is open.',
    'station-name': 'Label shown above the weather station icon.',
    'balloon-ascent': 'How fast the balloon rises through the atmosphere.',
    'airmass-temp': 'Temperature offset this generator applies to nearby air.',
    'airmass-moisture': 'Moisture added or removed by the airmass generator.',
    'marker-label': 'Optional text label for the map marker.',
  };

  const PANEL_INTRO = {
    '#skyPanel': {
      title: 'Sky Editor',
      body: 'Fine-tune sky colors, twilight bands, stars, and sun appearance. Changes apply live to the realistic view.',
    },
    '#colorScalePanel': {
      title: 'Color Scale Editor',
      body: 'Edit the color ramps used by display modes and overlays. Select a scale tab, adjust stops, and optionally interpolate smoothly between them.',
    },
    '#keybindPanel': {
      title: 'Keybind Editor',
      body: KEYBIND_HELP.panel,
    },
  };

  let panelIntroEl = null;

  function attachElement(el, title, body, keys) {
    if (!el || el.dataset.chHelpBound) return;
    el.dataset.chHelpBound = '1';
    el.addEventListener('mouseenter', function() {
      if (!enabled || !controls || controls.showControlHelp === false) return;
      hoverKey = 'el:' + title;
      setContent(title, body, keys || '');
      refreshVisibility();
    });
    el.addEventListener('mouseleave', function() {
      if (hoverKey === 'el:' + title) clearHover();
    });
  }

  function attachBySelector(selector, getHelp) {
    document.querySelectorAll(selector).forEach((el) => {
      const info = getHelp(el);
      if (info) attachElement(el, info.title, info.body, info.keys);
    });
  }

  function attachPanelIntro(panelSelector) {
    const intro = PANEL_INTRO[panelSelector];
    const panel = document.querySelector(panelSelector);
    if (!intro || !panel) return;
    const hdr = panel.querySelector('[class*="-hdr"], .cse-hdr, .kbe-hdr, .ske-hdr');
    if (hdr) attachElement(hdr, intro.title, intro.body);
  }

  function attachSkyEditor() {
    attachPanelIntro('#skyPanel');
    document.querySelectorAll('#skyPanel .ske-row').forEach((row) => {
      const lbl = row.querySelector('.ske-lbl');
      if (!lbl) return;
      const title = lbl.childNodes[0] && lbl.childNodes[0].textContent
        ? lbl.childNodes[0].textContent.trim() : lbl.textContent.trim();
      const body = SKY_HELP[title] || lbl.querySelector('small')?.textContent;
      if (body) attachElement(row, title, body);
    });
    document.querySelectorAll('#skyPanel .ske-chk').forEach((chk) => {
      const title = chk.textContent.trim();
      if (SKY_HELP[title]) attachElement(chk, title, SKY_HELP[title]);
    });
  }

  function attachColorScaleEditor() {
    attachPanelIntro('#colorScalePanel');
    document.querySelectorAll('#colorScalePanel .cse-tab').forEach((tab) => {
      const name = tab.textContent.trim();
      const body = COLOR_SCALE_TAB_HELP[name] || 'Color stops for the ' + name + ' display scale.';
      attachElement(tab, name + ' scale', body);
    });
    document.querySelectorAll('#colorScalePanel .cse-ctrl-btn, #colorScalePanel .cse-btn').forEach((btn) => {
      const label = btn.textContent.trim();
      const body = COLOR_SCALE_ACTION_HELP[label];
      if (body) attachElement(btn, label, body);
    });
    const interp = document.querySelector('#colorScalePanel .cse-opt-lbl');
    if (interp) attachElement(interp, 'Interpolate stops', COLOR_SCALE_ACTION_HELP['Interpolate stops']);
  }

  function attachKeybindEditor() {
    attachPanelIntro('#keybindPanel');
    const hint = document.querySelector('#keybindPanel .kbe-hint');
    if (hint) attachElement(hint, 'Keybind help', KEYBIND_HELP.panel);
  }

  function attachEntityMenu(menuEl, entityType) {
    if (!menuEl) return;
    menuEl.querySelectorAll('[data-ch-help]').forEach((el) => {
      const key = el.getAttribute('data-ch-help');
      const body = ENTITY_HELP[key];
      if (!body) return;
      const title = el.getAttribute('data-ch-title') || key;
      attachElement(el, title, body);
    });
  }

  function attachCustomPanels() {
    attachSkyEditor();
    attachColorScaleEditor();
    attachKeybindEditor();
  }

  function registerEntityMenu(menuEl) {
    attachEntityMenu(menuEl);
  }

  function attachDatGui(datGui) {
    if (!datGui) return;
    walkFolder(datGui);
    refreshVisibility();
  }

  function init(guiControlsRef) {
    controls = guiControlsRef;
    ensurePanel();
    if (controls.tool)
      lastTool = controls.tool;
    showTool(controls.tool || 'TOOL_NONE');
  }

  function onToolChanged(tool) {
    lastTool = tool;
    if (!hoverKey)
      showTool(tool);
  }

  function setEnabled(on) {
    enabled = on;
    if (!on) {
      ensurePanel();
      panelEl.classList.remove('visible');
    } else if (!hoverKey) {
      showTool(lastTool || (controls && controls.tool) || 'TOOL_NONE');
    }
    refreshVisibility();
  }

  return {
    TOOL_HELP,
    SETTING_HELP,
    init,
    attachDatGui,
    attachCustomPanels,
    registerEntityMenu,
    attachElement,
    onToolChanged,
    setEnabled,
    refresh: refreshVisibility,
  };
})();

if (typeof window !== 'undefined')
  window.ControlHelp = ControlHelp;
