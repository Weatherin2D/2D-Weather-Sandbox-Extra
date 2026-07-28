const assert = require('assert');
const fs = require('fs');
const path = require('path');

const shaderPath = path.join(__dirname, '..', 'shaders', 'fragment', 'temperatureDisplayShader.frag');
const shader = fs.readFileSync(shaderPath, 'utf8');

assert.ok(!shader.includes('pressureHpa'), 'Temperature display shader should not apply a pressure-based red tint');
console.log('Temperature display shader regression test passed');
