/**
 * Multiplayer session: room management, message routing, presence.
 */
(function(global) {
  'use strict';

  const { MSG, BINARY_SNAPSHOT, pickPlayerColor, generateRoomCode, decodeJson } = global.WeatherMpProtocol;
  const { WebSocketTransport } = global.WeatherMpTransport;

  class MultiplayerSession {
    constructor() {
      this.transport = new WebSocketTransport();
      this.role = 'none'; // 'none' | 'host' | 'peer'
      this.playerId = null;
      this.playerName = 'Player';
      this.roomCode = '';
      this.players = [];
      this.remotePlayers = new Map();
      this.connected = false;
      this.simStarted = false;
      this._callbacks = {};
      this._lastPresenceSend = 0;
      this._presenceIntervalMs = 50;
      this._lastBrushSend = 0;
      this._brushIntervalMs = 33;
      this._pendingSnapshotTarget = null;
      this._hooks = {
        buildSnapshot: null,
        onSnapshotBinary: null,
        onSyncMeta: null,
        onRemoteBrush: null,
        onRemotePlace: null,
        onPlayersChanged: null,
        onDisconnected: null,
        onJoinError: null,
        getPresence: null,
        isSimRunning: null,
      };

      this.transport.onJson((text) => this._handleJson(text));
      this.transport.onBinary((buf) => this._handleBinary(buf));
      this.transport.onClose(() => {
        this.connected = false;
        this.role = 'none';
        if (this._hooks.onDisconnected) this._hooks.onDisconnected();
      });
    }

    setHooks(hooks) {
      Object.assign(this._hooks, hooks);
    }

    getDefaultRelayUrl() {
      const host = global.location ? global.location.hostname : 'localhost';
      const proto = global.location && global.location.protocol === 'https:' ? 'wss' : 'ws';
      const port = global.__WEATHER_MP_RELAY_PORT || '8787';
      if (host === 'localhost' || host === '127.0.0.1')
        return proto + '://' + host + ':' + port;
      return proto + '://' + host + ':' + port;
    }

    async connect(url) {
      const relayUrl = url || this.getDefaultRelayUrl();
      await this.transport.connect(relayUrl);
      this.connected = true;
    }

    async host(playerName, roomCode) {
      this.playerName = playerName || 'Host';
      this.roomCode = roomCode || generateRoomCode();
      await this.connect();
      this.transport.sendJson({
        type: MSG.JOIN,
        role: 'host',
        roomCode: this.roomCode,
        playerName: this.playerName,
      });
      return this.roomCode;
    }

    async join(roomCode, playerName) {
      this.playerName = playerName || 'Player';
      this.roomCode = (roomCode || '').toUpperCase().trim();
      if (!this.roomCode) throw new Error('Room code required');
      await this.connect();
      this.transport.sendJson({
        type: MSG.JOIN,
        role: 'peer',
        roomCode: this.roomCode,
        playerName: this.playerName,
      });
    }

    leave() {
      this.transport.disconnect();
      this.role = 'none';
      this.playerId = null;
      this.players = [];
      this.remotePlayers.clear();
      this.connected = false;
      this.simStarted = false;
    }

    isActive() {
      return this.role === 'host' || this.role === 'peer';
    }

    isHost() {
      return this.role === 'host';
    }

    isPeer() {
      return this.role === 'peer';
    }

    getRemotePlayers() {
      return Array.from(this.remotePlayers.values());
    }

    broadcastSyncMeta(meta) {
      if (!this.isHost()) return;
      this.simStarted = !!meta.simStarted;
      this.transport.sendJson({ type: MSG.SYNC_META, ...meta });
    }

    async sendSnapshotTo(playerId) {
      if (!this.isHost() || !this._hooks.buildSnapshot) return;
      const blob = await this._hooks.buildSnapshot();
      if (!blob) return;
      const buf = await blob.arrayBuffer();
      const header = new Uint8Array(5);
      header[0] = BINARY_SNAPSHOT;
      new DataView(header.buffer).setUint32(1, playerId ? playerId : 0, true);
      const combined = new Uint8Array(header.length + buf.byteLength);
      combined.set(header, 0);
      combined.set(new Uint8Array(buf), header.length);
      this.transport.sendBinary(combined.buffer);
      this.transport.sendJson({
        type: MSG.SNAPSHOT_META,
        targetPlayerId: playerId || 0,
        byteLength: buf.byteLength,
        iterNum: metaIterNum(this._hooks),
      });
    }

    requestSnapshot() {
      if (!this.isPeer()) return;
      this.transport.sendJson({ type: MSG.SNAPSHOT_REQUEST });
    }

    emitBrush(brush) {
      if (!this.isPeer() || !this.connected) return;
      const now = performance.now();
      if (brush.active && now - this._lastBrushSend < this._brushIntervalMs) return;
      this._lastBrushSend = now;
      this.transport.sendJson({
        type: MSG.INPUT_BRUSH,
        inputType: brush.inputType,
        x: brush.x,
        y: brush.y,
        intensity: brush.intensity,
        brushSize: brush.brushSize,
        moveX: brush.moveX,
        moveY: brush.moveY,
        wrap: !!brush.wrap,
        active: !!brush.active,
      });
    }

    emitPlace(place) {
      if (!this.isPeer() || !this.connected) return;
      this.transport.sendJson({
        type: MSG.INPUT_PLACE,
        tool: place.tool,
        x: place.x,
        y: place.y,
      });
    }

    tick() {
      if (!this.connected || !this._hooks.getPresence) return;
      const now = performance.now();
      if (now - this._lastPresenceSend < this._presenceIntervalMs) return;
      this._lastPresenceSend = now;
      const p = this._hooks.getPresence();
      if (!p) return;
      this.transport.sendJson({
        type: MSG.PRESENCE,
        x: p.x,
        y: p.y,
        tool: p.tool,
        painting: !!p.painting,
      });
    }

    _handleJson(text) {
      let msg;
      try {
        msg = decodeJson(text);
      } catch (e) {
        console.warn('Bad multiplayer message', e);
        return;
      }
      switch (msg.type) {
        case MSG.JOINED:
          this.playerId = msg.playerId;
          this.role = msg.isHost ? 'host' : 'peer';
          this.players = msg.players || [];
          this._rebuildRemotePlayers();
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          break;
        case MSG.JOIN_ERROR:
          if (this._hooks.onJoinError) this._hooks.onJoinError(msg.message || 'Join failed');
          this.leave();
          break;
        case MSG.PLAYER_JOINED:
          this.players = msg.players || this.players;
          this._rebuildRemotePlayers();
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          if (this.isHost() && msg.playerId !== this.playerId)
            this.sendSnapshotTo(msg.playerId);
          break;
        case MSG.PLAYER_LEFT:
          this.players = msg.players || [];
          this.remotePlayers.delete(msg.playerId);
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          break;
        case MSG.HOST_LEFT:
          if (this._hooks.onJoinError) this._hooks.onJoinError('Host left the session');
          this.leave();
          break;
        case MSG.INPUT_BRUSH:
          if (this.isHost() && this._hooks.onRemoteBrush)
            this._hooks.onRemoteBrush(msg.playerId, msg);
          break;
        case MSG.INPUT_PLACE:
          if (this.isHost() && this._hooks.onRemotePlace)
            this._hooks.onRemotePlace(msg.playerId, msg);
          break;
        case MSG.PRESENCE:
          this._updateRemotePresence(msg.playerId, msg);
          break;
        case MSG.SYNC_META:
          if (this.isPeer() && this._hooks.onSyncMeta)
            this._hooks.onSyncMeta(msg);
          break;
        case MSG.SNAPSHOT_REQUEST:
          if (this.isHost())
            this.sendSnapshotTo(msg.playerId || 0);
          break;
        case MSG.SNAPSHOT_META:
          this._pendingSnapshotTarget = msg;
          break;
        default:
          break;
      }
    }

    _handleBinary(buf) {
      const bytes = new Uint8Array(buf);
      if (bytes.length < 5 || bytes[0] !== BINARY_SNAPSHOT) return;
      const payload = bytes.slice(5);
      if (this._hooks.onSnapshotBinary)
        this._hooks.onSnapshotBinary(payload.buffer, this._pendingSnapshotTarget);
      this._pendingSnapshotTarget = null;
    }

    _rebuildRemotePlayers() {
      this.remotePlayers.clear();
      for (const p of this.players) {
        if (p.id !== this.playerId)
          this.remotePlayers.set(p.id, { ...p, x: 0.5, y: 0.5, tool: 'TOOL_NONE', painting: false });
      }
    }

    _updateRemotePresence(playerId, msg) {
      if (playerId === this.playerId) return;
      const existing = this.remotePlayers.get(playerId) || { id: playerId, name: 'Player', color: '#fff' };
      this.remotePlayers.set(playerId, {
        ...existing,
        x: msg.x,
        y: msg.y,
        tool: msg.tool,
        painting: msg.painting,
      });
    }
  }

  function metaIterNum(hooks) {
    return hooks.getPresence ? (hooks.getPresence().iterNum || 0) : 0;
  }

  global.WeatherMultiplayer = new MultiplayerSession();
})(typeof window !== 'undefined' ? window : global);
