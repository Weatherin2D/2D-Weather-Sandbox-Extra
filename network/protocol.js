/**
 * Multiplayer message protocol for 2D Weather Sandbox.
 * All JSON messages include a `type` field matching MSG.* constants.
 */
(function(global) {
  'use strict';

  const MSG = {
    JOIN: 'join',
    JOINED: 'joined',
    JOIN_ERROR: 'join_error',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    INPUT_BRUSH: 'input_brush',
    INPUT_PLACE: 'input_place',
    PLACE_APPLY: 'place_apply',
    INPUT_PAUSE: 'input_pause',
    INPUT_NUKE: 'input_nuke',
    INPUT_GUI: 'input_gui',
    GUI_SET: 'gui_set',
    PRESENCE: 'presence',
    SYNC_META: 'sync_meta',
    SNAPSHOT_REQUEST: 'snapshot_request',
    SNAPSHOT_META: 'snapshot_meta',
    HOST_LEFT: 'host_left',
    PEER_LOADING: 'peer_loading',
    PEER_READY: 'peer_ready',
    CHAT: 'chat',
    PLAYER_PERMISSIONS: 'player_permissions',
    PERMISSIONS_DENIED: 'permissions_denied',
    KICK_PLAYER: 'kick_player',
    KICKED: 'kicked',
    ROOM_CODE_CHANGE: 'room_code_change',
    ROOM_CODE_CHANGED: 'room_code_changed',
    LIGHTNING_FLASH: 'lightning_flash',
  };

  function defaultPermissions() {
    return { paint: true, place: true, pause: false, nuke: false, settings: false };
  }

  function clonePermissions(perms) {
    return {
      paint: !!(perms && perms.paint),
      place: !!(perms && perms.place),
      pause: !!(perms && perms.pause),
      nuke: !!(perms && perms.nuke),
      settings: !!(perms && perms.settings),
    };
  }

  const LOCAL_PEER_GUI_KEYS = new Set([
    'displayMode', 'exposure', 'saturation', 'contrast', 'bloomStrength', 'sound',
    'readoutCursor', 'graphFixedPosition', 'menuWidth', 'skewTSourceMode',
    'weatherBalloonAscentMps', 'weatherBalloonSampleIntervalM', 'hodograph2DNodes',
    'hodographProfileNodes', 'analogRelevancy',
  ]);

  function isLocalPeerGuiKey(key) {
    return LOCAL_PEER_GUI_KEYS.has(key);
  }

  function isPaintTool(tool) {
    return isBrushTool(tool) && tool !== 'TOOL_NONE';
  }

  function isNukeTool(tool) {
    return tool === 'TOOL_NUKE';
  }

  const BINARY_SNAPSHOT = 0x01;
  const BINARY_TEXTURE_SYNC = 0x02;
  const TEXTURE_SYNC_HEADER_BYTES = 17; // 5-byte wire header + 12-byte payload header minimum

  const PLAYER_COLORS = [
    '#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8',
    '#55efc4', '#74b9ff', '#fab1a0', '#81ecec', '#dfe6e9',
  ];

  function pickPlayerColor(index) {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++)
      code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function encodeJson(msg) {
    return JSON.stringify(msg);
  }

  function decodeJson(text) {
    return JSON.parse(text);
  }

  function isBrushTool(tool) {
    if (!tool) return false;
    if (tool === 'TOOL_NONE') return true;
    if (tool === 'TOOL_NUKE' || tool === 'TOOL_AIRPLANE') return false;
    return tool.startsWith('TOOL_') && ![
      'TOOL_STATION', 'TOOL_BALLOON', 'TOOL_RADAR', 'TOOL_AIRMASS', 'TOOL_MARKER', 'TOOL_NUKE',
    ].includes(tool);
  }

  function isPlacementTool(tool) {
    return [
      'TOOL_STATION', 'TOOL_BALLOON', 'TOOL_RADAR', 'TOOL_AIRMASS', 'TOOL_MARKER',
    ].includes(tool);
  }

  function toolToInputType(tool) {
    switch (tool) {
      case 'TOOL_NONE': return 0;
      case 'TOOL_TEMPERATURE': return 1;
      case 'TOOL_WATER': return 2;
      case 'TOOL_SMOKE': return 3;
      case 'TOOL_WIND': return 4;
      case 'TOOL_WALL': return 10;
      case 'TOOL_WALL_LAND': return 11;
      case 'TOOL_WALL_FRESH': return 12;
      case 'TOOL_WALL_SEA': return 24;
      case 'TOOL_WALL_ICE_SHEET': return 25;
      case 'TOOL_WALL_ICE_CAP': return 26;
      case 'TOOL_WALL_FIRE': return 13;
      case 'TOOL_WALL_URBAN': return 14;
      case 'TOOL_WALL_SUBURBAN': return 17;
      case 'TOOL_WALL_RUNWAY': return 15;
      case 'TOOL_WALL_INDUSTRIAL': return 16;
      case 'TOOL_WALL_MOIST': return 20;
      case 'TOOL_WALL_SNOW': return 21;
      case 'TOOL_VEG_GRASS': return 27;
      case 'TOOL_VEG_FOREST': return 28;
      case 'TOOL_CHARGE': return 23;
      default: return -1;
    }
  }

  global.WeatherMpProtocol = {
    MSG,
    BINARY_SNAPSHOT,
    BINARY_TEXTURE_SYNC,
    TEXTURE_SYNC_HEADER_BYTES,
    PLAYER_COLORS,
    pickPlayerColor,
    generateRoomCode,
    encodeJson,
    decodeJson,
    isBrushTool,
    isPaintTool,
    isPlacementTool,
    isNukeTool,
    isLocalPeerGuiKey,
    LOCAL_PEER_GUI_KEYS,
    toolToInputType,
    defaultPermissions,
    clonePermissions,
  };
})(typeof window !== 'undefined' ? window : global);
