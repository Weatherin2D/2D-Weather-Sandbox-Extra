/**
 * Reusable radar GPU readback / composite uniform buffers.
 */
(function (global) {
  'use strict';

  var waterPixelsBuf = null;
  var waterPixelsLen = 0;
  var compositePositions = null;
  var compositeRanges = null;
  var compositeResolutions = null;
  var compositeSensitivities = null;
  var compositeCapacity = 0;

  function getRadarWaterPixelsBuffer(pixelCount) {
    var need = pixelCount * 4;
    if (!waterPixelsBuf || waterPixelsLen !== need) {
      waterPixelsBuf = new Float32Array(need);
      waterPixelsLen = need;
    }
    return waterPixelsBuf;
  }

  function getCompositeRadarBuffers(maxRadars) {
    if (!compositePositions || compositeCapacity !== maxRadars) {
      compositeCapacity = maxRadars;
      compositePositions = new Float32Array(maxRadars * 2);
      compositeRanges = new Float32Array(maxRadars);
      compositeResolutions = new Float32Array(maxRadars);
      compositeSensitivities = new Float32Array(maxRadars);
    }
    return {
      positions: compositePositions,
      ranges: compositeRanges,
      resolutions: compositeResolutions,
      sensitivities: compositeSensitivities,
    };
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.radar = {
    getRadarWaterPixelsBuffer: getRadarWaterPixelsBuffer,
    getCompositeRadarBuffers: getCompositeRadarBuffers,
  };

  global.getRadarWaterPixelsBuffer = getRadarWaterPixelsBuffer;
  global.getCompositeRadarBuffers = getCompositeRadarBuffers;
})(typeof window !== 'undefined' ? window : globalThis);
