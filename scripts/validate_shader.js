// Usage: node scripts/validate_shader.js [shader.frag ...]
// Inlines common.glsl / commonDisplay.glsl like loadShader() in app.js, then compiles with glslang.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const common = fs.readFileSync(path.join(root, 'shaders/common.glsl'), 'utf8');
const commonDisplay = fs.readFileSync(path.join(root, 'shaders/commonDisplay.glsl'), 'utf8');

const DEFAULT_SHADERS = [
  'boundaryShader.frag',
  'velocityShader.frag',
  'pressureShader.frag',
  'advectionShader.frag',
  'pressureDisplayShader.frag',
  'pressureRowMeanShader.frag',
  'capeShader.frag',
];

function expandIncludes(src)
{
  if (src.includes('#include "common.glsl"')) {
    const before = src.split('#include "common.glsl"')[0];
    if (!/\bdryLapse\b/.test(before))
      src = src.replace('#include "common.glsl"', 'const float dryLapse = 0.;\n#include "common.glsl"');
    src = src.replace('#include "common.glsl"', common);
  }
  if (src.includes('#include "commonDisplay.glsl"'))
    src = src.replace('#include "commonDisplay.glsl"', commonDisplay);
  return src;
}

// glslang only targets SPIR-V, which rejects WebGL's GLSL ES 3.00. Rewrite to ES 3.10 with explicit
// locations, bindings and one uniform block per loose uniform; type rules stay the same.
function toSpirvCompatibleEs(src)
{
  src = src.replace(/^#version 300 es/m, '#version 310 es');
  let inLoc = 0, outLoc = 0, binding = 0, block = 0;
  return src.split(/\r?\n/).map((line) => {
    let m;
    if ((m = /^\s*uniform\s+(highp\s+|mediump\s+|lowp\s+)?(\w+)\s+([^;]+);(.*)$/.exec(line))) {
      const prec = m[1] || '';
      if (/sampler/.test(m[2]))
        return `layout(binding = ${binding++}) uniform ${prec}${m[2]} ${m[3]};${m[4]}`;
      return `layout(std140, binding = ${binding++}) uniform UB${block++} { ${prec}${m[2]} ${m[3]}; };${m[4]}`;
    }
    if ((m = /^\s*(flat\s+)?in\s+(\w+)\s+([^;]+);(.*)$/.exec(line)))
      return `layout(location = ${inLoc++}) ${m[1] || ''}in ${m[2]} ${m[3]};${m[4]}`;
    if ((m = /^\s*out\s+(\w+)\s+([^;]+);(.*)$/.exec(line)))
      return `layout(location = ${outLoc++}) out ${m[1]} ${m[2]};${m[3]}`;
    return line;
  }).join('\n');
}

const glslang = require('@webgpu/glslang')();
const shaders = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SHADERS;
let failed = 0;
for (const name of shaders) {
  const stage = name.endsWith('.vert') ? 'vertex' : 'fragment';
  const src = toSpirvCompatibleEs(expandIncludes(fs.readFileSync(path.join(root, 'shaders', stage, name), 'utf8')));
  try {
    glslang.compileGLSL(src, stage, false);
    console.log('VALID  ' + name);
  } catch (e) {
    failed++;
    console.error('ERROR  ' + name + ': ' + e.message);
  }
}
process.exitCode = failed ? 1 : 0;
