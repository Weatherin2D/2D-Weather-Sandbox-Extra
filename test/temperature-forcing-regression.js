const assert = require('assert');
const fs = require('fs');
const path = require('path');

const boundaryShader = fs.readFileSync(path.join(__dirname, '..', 'shaders', 'fragment', 'boundaryShader.frag'), 'utf8');
const commonGlsl = fs.readFileSync(path.join(__dirname, '..', 'shaders', 'common.glsl'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.ok(!boundaryShader.includes('latitudeBasedTemperature != 0'), 'boundary shader must not relax temperatures toward a latitude climate value');
assert.ok(!boundaryShader.includes('climateTempC'), 'boundary shader must not read a climate target temperature');
assert.ok(!/realTemp\s*-\s*1\.0\)/.test(boundaryShader), 'air over water must not be biased 1 K colder than the water');
assert.ok(!boundaryShader.includes('!isLiquidWaterType(wall[TYPE]) && wall[TYPE] != WALLTYPE_ICE'), 'air columns over water / ice must still get infrared heating and cooling');
assert.ok(commonGlsl.includes('float surfaceExchangeRate('), 'air-water heat exchange should use the bulk aerodynamic rate');
assert.ok(boundaryShader.includes('openWaterVaporFlux('), 'evaporation should be the shared bulk vapor flux on both the air and water side');
assert.ok(appSource.includes("'cellHeightM'"), 'app.js should upload the cell height used by the surface exchange');

console.log('Temperature forcing regression test passed');
