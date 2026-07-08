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
      this._snapshotSending = false;
      this._peersLoading = new Set();
      this._joinInfo = null;
      this._suppressDisconnect = false;
      this._hooks = {
        buildSnapshot: null,
        onSnapshotBinary: null,
        onSyncMeta: null,
        onRemoteBrush: null,
        onRemotePlace: null,
        onPlayersChanged: null,
        onDisconnected: null,
        onJoinError: null,
        onJoined: null,
        getPresence: null,
        isSimRunning: null,
      };

      this.transport.onJson((text) => this._handleJson(text));
      this.transport.onBinary((buf) => this._handleBinary(buf));
      this.transport.onClose(() => {
        this.connected = false;
        const wasInRoom = this.role !== 'none';
        this.role = 'none';
        if (!this._suppressDisconnect && this._hooks.onDisconnected)
          this._hooks.onDisconnected(wasInRoom);
      });
    }

    setHooks(hooks) {
      Object.assign(this._hooks, hooks);
    }

    getRelayUrl() {
      if (global.__WEATHER_MP_RELAY_URL)
        return global.__WEATHER_MP_RELAY_URL;
      const input = global.document && global.document.getElementById('mpRelayUrl');
      if (input && input.value.trim())
        return input.value.trim();
      const host = global.location ? global.location.hostname : '127.0.0.1';
      const proto = global.location && global.location.protocol === 'https:' ? 'wss' : 'ws';
      const port = global.__WEATHER_MP_RELAY_PORT || '8787';
      const relayHost = (host === 'localhost' || host === '127.0.0.1') ? '127.0.0.1' : host;
      return proto + '://' + relayHost + ':' + port;
    }

    async connect(url) {
      const relayUrl = url || this.getRelayUrl();
      try {
        await this.transport.connect(relayUrl);
        this.connected = true;
      } catch (err) {
        this._suppressDisconnect = true;
        this.transport.disconnect();
        this._suppressDisconnect = false;
        this.connected = false;
        throw new Error('Cannot reach relay at ' + relayUrl + '. Run "npm run relay" in the project folder.');
      }
    }

    async host(playerName, roomCode) {
      this.playerName = playerName || 'Host';
      this.roomCode = roomCode || generateRoomCode();
      this._joinInfo = { roomCode: this.roomCode, playerName: this.playerName };
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
      this._joinInfo = { roomCode: this.roomCode, playerName: this.playerName };
      await this.connect();
      this.transport.sendJson({
        type: MSG.JOIN,
        role: 'peer',
        roomCode: this.roomCode,
        playerName: this.playerName,
      });
    }

    async reconnectAsPeer() {
      if (!this._joinInfo) return false;
      try {
        if (this.transport.isConnected()) this.leave(true);
        await this.join(this._joinInfo.roomCode, this._joinInfo.playerName);
        return true;
      } catch (e) {
        console.warn('Peer reconnect failed', e);
        return false;
      }
    }

    notifyPeerLoading(loading) {
      if (!this.isPeer() || !this.connected) return;
      this.transport.sendJson({ type: loading ? MSG.PEER_LOADING : MSG.PEER_READY });
    }

    hasPeersLoading() {
      return this._peersLoading.size > 0;
    }

    leave(silent) {
      this._suppressDisconnect = !!silent;
      this.transport.disconnect();
      this.role = 'none';
      this.playerId = null;
      this.players = [];
      this.remotePlayers.clear();
      this.connected = false;
      this.simStarted = false;
      this._suppressDisconnect = false;
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
      if (!this.isHost() || !this._hooks.buildSnapshot || this._snapshotSending) return;
      this._snapshotSending = true;
      try {
        const blob = await this._hooks.buildSnapshot();
        if (!blob) return;
        const buf = await blob.arrayBuffer();
        const target = playerId || 0;
        this.transport.sendJson({
          type: MSG.SNAPSHOT_META,
          targetPlayerId: target,
          byteLength: buf.byteLength,
          iterNum: metaIterNum(this._hooks),
        });
        const header = new Uint8Array(5);
        header[0] = BINARY_SNAPSHOT;
        new DataView(header.buffer).setUint32(1, target, true);
        const combined = new Uint8Array(header.length + buf.byteLength);
        combined.set(header, 0);
        combined.set(new Uint8Array(buf), header.length);
        this.transport.sendBinary(combined.buffer);
      } finally {
        this._snapshotSending = false;
      }
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
          if (this._hooks.onJoined) this._hooks.onJoined(msg);
          break;
        case MSG.JOIN_ERROR:
          if (this._hooks.onJoinError) this._hooks.onJoinError(msg.message || 'Join failed');
          this.leave(true);
          break;
        case MSG.PLAYER_JOINED:
          this.players = msg.players || this.players;
          this._rebuildRemotePlayers();
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          if (this.isHost() && msg.playerId !== this.playerId)
            setTimeout(() => this.sendSnapshotTo(msg.playerId), 100);
          break;
        case MSG.PLAYER_LEFT:
          this.players = msg.players || [];
          this.remotePlayers.delete(msg.playerId);
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          break;
        case MSG.HOST_LEFT:
          if (this._hooks.onJoinError) this._hooks.onJoinError('Host left the session');
          this.leave(true);
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
        case MSG.PEER_LOADING:
          if (this.isHost() && msg.playerId)
            this._peersLoading.add(msg.playerId);
          if (msg.players) this.players = msg.players;
          break;
        case MSG.PEER_READY:
          if (this.isHost() && msg.playerId)
            this._peersLoading.delete(msg.playerId);
          if (msg.players) this.players = msg.players;
          if (this.isHost() && msg.playerId)
            setTimeout(() => this.sendSnapshotTo(msg.playerId), 250);
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
