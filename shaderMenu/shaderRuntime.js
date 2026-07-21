/**
 * Live shader source editing + hot-swap runtime for the Shader Menu.
 *
 * Stores edited fragment shader sources for the 'post', 'sky' and 'realistic'
 * stages, both in memory and in localStorage, and drives recompilation
 * through host-supplied dependencies (see init()).
 *
 * Host contract (deps passed to init()):
 *   gl                          - the WebGL context (kept for reference; not required to be used here)
 *   getVertexShader(stage)      - returns the compiled vertex shader object used to link `stage`
 *   getStockSource(stage)       - returns the original/default fragment shader source string for `stage`
 *   setProgram(stage, program)  - installs `program` as the live program for `stage`
 *   getProgram(stage)           - returns the currently active program object for `stage` (used to
 *                                  keep the old program alive if recompilation fails)
 *   recompileStage(stage, sourceString)
 *                               - REQUIRED. Must return a Promise<{ ok, program?, error? }>.
 *                                 app.js is expected to implement this by compiling `sourceString`
 *                                 as a fragment shader (resolving any '#include'-style directives
 *                                 the project uses) and linking it against getVertexShader(stage),
 *                                 e.g. via its existing loadShaderFromSource()/linkProgramAsync()
 *                                 helpers. On success it should also call setProgram(stage, program)
 *                                 itself (or applyStage() will call it for you if omitted from the
 *                                 result) so the caller does not need special-case logic per stage.
 *
 * Older/alternate host contract (still honored if present, for flexibility):
 *   loadShaderFromSource(name, source, opts) - compiles a shader from source text
 *   linkProgramAsync(vert, frag, tf, label)  - links vertex+fragment into a program
 *   compileFragmentFromSource(source)        - resolves includes and returns compiled fragment shader
 * These are only used as a fallback inside the default recompileStage implementation when the host
 * does not provide its own recompileStage.
 */
(function(global) {
  'use strict';

  const STORAGE_KEY = 'weatherSandboxCustomShaders_v1';
  const STAGES = ['post', 'sky', 'realistic'];

  let deps = null;
  const editedSources = { post: null, sky: null, realistic: null };
  const compileLogs = { post: null, sky: null, realistic: null };

  function isValidStage(stage) {
    return STAGES.indexOf(stage) >= 0;
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      for (let i = 0; i < STAGES.length; i++) {
        const stage = STAGES[i];
        const v = parsed[stage];
        editedSources[stage] = typeof v === 'string' ? v : null;
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        post: editedSources.post,
        sky: editedSources.sky,
        realistic: editedSources.realistic,
      }));
    } catch (e) {
      /* ignore quota errors */
    }
  }

  function init(hostDeps) {
    deps = hostDeps || {};
    loadFromStorage();
    return api;
  }

  function requireStage(stage) {
    if (!isValidStage(stage)) throw new Error('Unknown shader stage: ' + stage);
  }

  function getEditedSource(stage) {
    requireStage(stage);
    return editedSources[stage];
  }

  function setEditedSource(stage, src) {
    requireStage(stage);
    editedSources[stage] = typeof src === 'string' ? src : null;
    saveToStorage();
  }

  function clearEditedSource(stage) {
    requireStage(stage);
    editedSources[stage] = null;
    saveToStorage();
  }

  function hasCustom(stage) {
    requireStage(stage);
    return typeof editedSources[stage] === 'string' && editedSources[stage].length > 0;
  }

  function getCompileLog(stage) {
    requireStage(stage);
    return compileLogs[stage];
  }

  function getStockSource(stage) {
    if (deps && typeof deps.getStockSource === 'function') {
      return deps.getStockSource(stage);
    }
    return '';
  }

  /**
   * Default fallback recompile path used only when the host did not supply its
   * own deps.recompileStage. Relies on the older-style compile/link helpers.
   */
  async function defaultRecompileStage(stage, sourceString) {
    if (!deps) return { ok: false, error: 'Shader runtime not initialized' };
    try {
      let fragmentShader;
      if (typeof deps.compileFragmentFromSource === 'function') {
        fragmentShader = await deps.compileFragmentFromSource(sourceString);
      } else if (typeof deps.loadShaderFromSource === 'function') {
        fragmentShader = await deps.loadShaderFromSource(stage + '.frag', sourceString, { stage: stage });
      } else {
        return { ok: false, error: 'No fragment compile function provided (compileFragmentFromSource/loadShaderFromSource)' };
      }
      if (!fragmentShader) {
        return { ok: false, error: 'Fragment shader compilation returned nothing' };
      }
      const vertexShader = typeof deps.getVertexShader === 'function' ? deps.getVertexShader(stage) : null;
      if (!vertexShader) {
        return { ok: false, error: 'No vertex shader available for stage: ' + stage };
      }
      if (typeof deps.linkProgramAsync !== 'function') {
        return { ok: false, error: 'No linkProgramAsync function provided' };
      }
      const program = await deps.linkProgramAsync(vertexShader, fragmentShader, null, 'shader menu: ' + stage);
      if (!program) {
        return { ok: false, error: 'Program linking returned nothing' };
      }
      return { ok: true, program: program };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  async function applyStage(stage) {
    requireStage(stage);
    if (!deps) return { ok: false, error: 'Shader runtime not initialized' };

    const source = hasCustom(stage) ? editedSources[stage] : getStockSource(stage);
    if (typeof source !== 'string' || !source.length) {
      const error = 'No source available for stage: ' + stage;
      compileLogs[stage] = error;
      return { ok: false, error: error };
    }

    let result;
    try {
      if (typeof deps.recompileStage === 'function') {
        result = await deps.recompileStage(stage, source);
      } else {
        result = await defaultRecompileStage(stage, source);
      }
    } catch (e) {
      result = { ok: false, error: (e && e.message) || String(e) };
    }

    if (!result || !result.ok) {
      const error = (result && result.error) || 'Unknown compile error';
      compileLogs[stage] = error;
      return { ok: false, error: error };
    }

    compileLogs[stage] = null;

    if (result.program && typeof deps.setProgram === 'function') {
      deps.setProgram(stage, result.program);
    }

    return { ok: true, program: result.program };
  }

  async function revertStage(stage) {
    requireStage(stage);
    clearEditedSource(stage);
    return applyStage(stage);
  }

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    STAGES: STAGES,
    init: init,
    getEditedSource: getEditedSource,
    setEditedSource: setEditedSource,
    clearEditedSource: clearEditedSource,
    hasCustom: hasCustom,
    applyStage: applyStage,
    revertStage: revertStage,
    getCompileLog: getCompileLog,
  };

  global.ShaderMenu = global.ShaderMenu || {};
  global.ShaderMenu.runtime = api;
})(typeof window !== 'undefined' ? window : this);
