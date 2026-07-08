/**
 * Multiplayer session: room management, message routing, presence.
 */
(function(global) {
  'use strict';

  const {
    MSG, BINARY_SNAPSHOT, BINARY_TEXTURE_SYNC, TEXTURE_SYNC_HEADER_BYTES,
    generateRoomCode, decodeJson,
    defaultPermissions, clonePermissions, isLocalPeerGuiKey,
  } = global.WeatherMpProtocol;
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
      this._lastPresenceSend = 0;
      this._presenceIntervalMs = 50;
      this._lastBrushSend = 0;
      this._brushIntervalMs = 33;
      this._guiDebounceTimers = new Map();
      this._guiDebounceMs = 60;
      this._pendingSnapshotTarget = null;
      this._snapshotSending = false;
      this._textureSyncSending = false;
      this._pendingTextureSync = false;
      this._peersLoading = new Set();
      this._pendingSnapshotPeers = new Set();
      this._peerPermissions = new Map();
      this._myPermissions = defaultPermissions();
      this._joinInfo = null;
      this._suppressDisconnect = false;
      this._lastSnapshotReceived = 0;
      this._snapshotRetryCount = 0;
      this._snapshotRetryTimer = null;
      this._hooks = {
        buildSnapshot: null,
        buildTextureSync: null,
        onSnapshotBinary: null,
        onTextureSyncBinary: null,
        onSyncMeta: null,
        onLightningFlash: null,
        onRemoteBrush: null,
        onRemotePlace: null,
        onRemotePause: null,
        onRemoteNuke: null,
        onRemoteGuiChange: null,
        onGuiSet: null,
        onPlayersChanged: null,
        onDisconnected: null,
        onJoinError: null,
        onJoined: null,
        onPermissionsChanged: null,
        onPermissionsDenied: null,
        onRoomCodeChanged: null,
        getPresence: null,
        isSimRunning: null,
      };

      this.transport.onJson((text) => this._handleJson(text));
      this.transport.onBinary((buf) => this._handleBinary(buf));
      this.transport.onClose(() => {
        this.connected = false;
        const wasInRoom = this.role !== 'none';
        this.role = 'none';
        this._clearSnapshotRetry();
        if (!this._suppressDisconnect && this._hooks.onDisconnected)
          this._hooks.onDisconnected(wasInRoom);
      });
    }

    setHooks(hooks) {
      const hadBuild = !!this._hooks.buildSnapshot;
      if (hooks.onPermissionsChanged && this._hooks.onPermissionsChanged) {
        const prev = this._hooks.onPermissionsChanged;
        const next = hooks.onPermissionsChanged;
        hooks.onPermissionsChanged = function(perms) {
          prev.call(this, perms);
          next.call(this, perms);
        };
      }
      Object.assign(this._hooks, hooks);
      if (!hadBuild && this._hooks.buildSnapshot && this.isHost())
        setTimeout(() => this._flushPendingSnapshots(), 50);
    }

    getMyPermissions() {
      return this._myPermissions;
    }

    getPeerPermissions(playerId) {
      return this._peerPermissions.get(String(playerId)) || defaultPermissions();
    }

    /** Live Server / Vite / static dev servers — no WebSocket on the page port. */
    isStaticDevServer() {
      if (!global.location || global.location.protocol === 'file:') return false;
      const port = global.location.port || (global.location.protocol === 'https:' ? '443' : '80');
      const unifiedPort = String(global.__WEATHER_MP_RELAY_PORT || '8080');
      if (port === unifiedPort) return false;
      const staticDevPorts = new Set(['5500', '5501', '5502', '5000', '5173', '3000', '4173']);
      return staticDevPorts.has(port);
    }

    isLocalDevServer() {
      if (!global.location || global.location.protocol === 'file:') return false;
      const port = global.location.port || (global.location.protocol === 'https:' ? '443' : '80');
      const host = global.location.hostname;
      return (host === 'localhost' || host === '127.0.0.1')
        && port === this.getUnifiedServerPort();
    }

    isOnlineMultiplayerOrigin() {
      if (!global.location || global.location.protocol === 'file:') return false;
      if (this.isStaticDevServer()) return false;
      if (this.isLocalDevServer()) return false;
      return true;
    }

    getUnifiedServerPort() {
      return String(global.__WEATHER_MP_RELAY_PORT || '8080');
    }

    getRelayUrl() {
      if (global.__WEATHER_MP_RELAY_URL)
        return global.__WEATHER_MP_RELAY_URL;
      const input = global.document && global.document.getElementById('mpRelayUrl');
      if (input && input.dataset.userOverride === '1' && input.value.trim())
        return input.value.trim();
      if (global.location && global.location.protocol !== 'file:') {
        if (this.isStaticDevServer()) {
          const proto = global.location.protocol === 'https:' ? 'wss' : 'ws';
          const host = global.location.hostname === 'localhost' ? '127.0.0.1' : global.location.hostname;
          return proto + '://' + host + ':' + this.getUnifiedServerPort();
        }
        const proto = global.location.protocol === 'https:' ? 'wss' : 'ws';
        return proto + '://' + global.location.host;
      }
      return 'ws://127.0.0.1:' + this.getUnifiedServerPort();
    }

    _sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    _connectErrorMessage(relayUrl) {
      let msg = 'Multiplayer server unreachable at ' + relayUrl + '.';
      if (this.isOnlineMultiplayerOrigin()) {
        msg += ' The server may be waking up (Render free tier) — wait ~30s and use Test connection, then try again.';
      } else if (this.isStaticDevServer()) {
        msg += ' Live Server cannot host multiplayer — use http://localhost:'
          + this.getUnifiedServerPort() + ' or open the online version.';
      } else {
        msg += ' Run "npm start" in the project folder.';
      }
      return msg;
    }

    async connect(url) {
      const relayUrl = url || this.getRelayUrl();
      const tryConnect = async () => {
        await this.transport.connect(relayUrl);
        this.connected = true;
      };
      try {
        await tryConnect();
      } catch (err) {
        if (this.isOnlineMultiplayerOrigin()) {
          this._suppressDisconnect = true;
          this.transport.disconnect();
          this._suppressDisconnect = false;
          this.connected = false;
          await this._sleep(3000);
          try {
            await tryConnect();
            return;
          } catch (retryErr) {
            this._suppressDisconnect = true;
            this.transport.disconnect();
            this._suppressDisconnect = false;
            this.connected = false;
            throw new Error(this._connectErrorMessage(relayUrl));
          }
        }
        this._suppressDisconnect = true;
        this.transport.disconnect();
        this._suppressDisconnect = false;
        this.connected = false;
        throw new Error(this._connectErrorMessage(relayUrl));
      }
    }

    async host(playerName, roomCode) {
      this.playerName = playerName || 'Host';
      this.roomCode = roomCode || generateRoomCode();
      this._joinInfo = { roomCode: this.roomCode, playerName: this.playerName };
      this._peerPermissions.clear();
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
      this._myPermissions = defaultPermissions();
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
      this._clearSnapshotRetry();
      this.transport.disconnect();
      this.role = 'none';
      this.playerId = null;
      this.players = [];
      this.remotePlayers.clear();
      this.connected = false;
      this.simStarted = false;
      this._pendingSnapshotPeers.clear();
      this._peerPermissions.clear();
      this._myPermissions = defaultPermissions();
      this._lastSnapshotReceived = 0;
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

    hasReadyPeers() {
      return (this.players || []).some((p) => !p.isHost && !p.loading);
    }

    broadcastSyncMeta(meta) {
      if (!this.isHost()) return;
      this.simStarted = !!meta.simStarted;
      this.transport.sendJson({ type: MSG.SYNC_META, ...meta });
    }

    _canSendSnapshot() {
      if (!this.isHost() || !this._hooks.buildSnapshot) return false;
      if (this._hooks.isSimRunning && !this._hooks.isSimRunning()) return false;
      return true;
    }

    _canSendTextureSync() {
      if (!this.isHost() || !this._hooks.buildTextureSync) return false;
      if (this._hooks.isSimRunning && !this._hooks.isSimRunning()) return false;
      return true;
    }

    async _buildSnapshotBuffer() {
      if (!this._hooks.buildSnapshot || this._snapshotSending) return null;
      this._snapshotSending = true;
      try {
        const blob = await this._hooks.buildSnapshot();
        if (!blob) return null;
        return await blob.arrayBuffer();
      } finally {
        this._snapshotSending = false;
      }
    }

    _sendSnapshotBuffer(playerId, buf) {
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
    }

    async sendSnapshotTo(playerId) {
      if (!this.isHost()) return;
      if (!this._canSendSnapshot()) {
        if (playerId) this._pendingSnapshotPeers.add(String(playerId));
        return;
      }
      const buf = await this._buildSnapshotBuffer();
      if (!buf) {
        if (playerId) this._pendingSnapshotPeers.add(String(playerId));
        return;
      }
      this._sendSnapshotBuffer(playerId, buf);
    }

    async broadcastSnapshotToAll() {
      if (!this.isHost()) return;
      const peers = (this.players || []).filter((p) => !p.isHost && !p.loading);
      if (peers.length === 0) return;
      if (!this._canSendSnapshot()) {
        for (const p of peers) this._pendingSnapshotPeers.add(String(p.id));
        return;
      }
      const buf = await this._buildSnapshotBuffer();
      if (!buf) return;
      for (const peer of peers)
        this._sendSnapshotBuffer(peer.id, buf);
    }

    _flushPendingSnapshots() {
      if (!this.isHost() || this._pendingSnapshotPeers.size === 0) return;
      this._pendingSnapshotPeers.clear();
      this.broadcastSnapshotToAll();
    }

    _buildTextureSyncBuffer() {
      if (!this._hooks.buildTextureSync || this._textureSyncSending) return null;
      this._textureSyncSending = true;
      try {
        return this._hooks.buildTextureSync();
      } catch (e) {
        console.warn('Texture sync build failed', e);
        return null;
      } finally {
        this._textureSyncSending = false;
        if (this._pendingTextureSync) {
          this._pendingTextureSync = false;
          setTimeout(() => this.broadcastTextureSyncToAll(), 0);
        }
      }
    }

    _sendTextureSyncBuffer(playerId, buf) {
      const target = playerId || 0;
      const header = new Uint8Array(5);
      header[0] = BINARY_TEXTURE_SYNC;
      new DataView(header.buffer).setUint32(1, target, true);
      const combined = new Uint8Array(header.length + buf.byteLength);
      combined.set(header, 0);
      combined.set(new Uint8Array(buf), header.length);
      this.transport.sendBinary(combined.buffer);
    }

    broadcastTextureSyncToAll() {
      if (!this.isHost() || !this.hasReadyPeers()) return;
      if (!this._canSendTextureSync()) return;
      if (this._textureSyncSending) {
        this._pendingTextureSync = true;
        return;
      }
      const buf = this._buildTextureSyncBuffer();
      if (!buf) return;
      const peers = (this.players || []).filter((p) => !p.isHost && !p.loading);
      for (const peer of peers)
        this._sendTextureSyncBuffer(peer.id, buf);
    }

    emitLightningFlash(flash) {
      if (!this.isHost() || !this.connected || !flash) return;
      this.transport.sendJson({ type: MSG.LIGHTNING_FLASH, ...flash });
    }

    requestSnapshot() {
      if (!this.isPeer()) return;
      this.transport.sendJson({ type: MSG.SNAPSHOT_REQUEST });
    }

    startSnapshotRetry() {
      if (!this.isPeer()) return;
      this._snapshotRetryCount = 0;
      this._lastSnapshotReceived = 0;
      this._scheduleSnapshotRetry();
    }

    markSnapshotReceived() {
      this._lastSnapshotReceived = performance.now();
      this._clearSnapshotRetry();
    }

    getLastSnapshotAgeSec() {
      if (!this._lastSnapshotReceived) return null;
      return Math.floor((performance.now() - this._lastSnapshotReceived) / 1000);
    }

    _clearSnapshotRetry() {
      if (this._snapshotRetryTimer) {
        clearTimeout(this._snapshotRetryTimer);
        this._snapshotRetryTimer = null;
      }
    }

    _scheduleSnapshotRetry() {
      this._clearSnapshotRetry();
      if (!this.isPeer() || !this.connected) return;
      this._snapshotRetryTimer = setTimeout(() => {
        if (!this.isPeer() || !this.connected) return;
        if (this._lastSnapshotReceived > 0) return;
        if (this._snapshotRetryCount >= 3) return;
        this.requestSnapshot();
        this._snapshotRetryCount++;
        this._scheduleSnapshotRetry();
      }, 5000);
    }

    setPlayerPermissions(playerId, perms) {
      if (!this.isHost() || !playerId) return;
      const id = String(playerId);
      const merged = clonePermissions(Object.assign({}, this.getPeerPermissions(id), perms));
      this._peerPermissions.set(id, merged);
      for (const p of this.players) {
        if (!p.isHost && String(p.id) === id)
          p.permissions = merged;
      }
      this._broadcastPermissions();
    }

    kickPlayer(playerId) {
      if (!this.isHost() || !playerId) return;
      if (String(playerId) === String(this.playerId)) return;
      this.transport.sendJson({
        type: MSG.KICK_PLAYER,
        targetPlayerId: playerId,
        reason: 'Kicked by host',
      });
    }

    rerollRoomCode() {
      if (!this.isHost()) return null;
      const newCode = generateRoomCode();
      this.transport.sendJson({
        type: MSG.ROOM_CODE_CHANGE,
        newRoomCode: newCode,
      });
      return newCode;
    }

    _broadcastPermissions() {
      const permissions = {};
      for (const [id, perms] of this._peerPermissions.entries())
        permissions[id] = perms;
      this.transport.sendJson({ type: MSG.PLAYER_PERMISSIONS, permissions });
    }

    _sendPermissionsDenied(targetPlayerId, reason) {
      if (!this.isHost()) return;
      this.transport.sendJson({
        type: MSG.PERMISSIONS_DENIED,
        targetPlayerId,
        reason: reason || 'Action not allowed',
      });
    }

    _checkBrushPermission(playerId, msg) {
      const perms = this.getPeerPermissions(playerId);
      if (!perms.paint) {
        this._sendPermissionsDenied(playerId, 'Painting is disabled for your account');
        return false;
      }
      return true;
    }

    _checkPlacePermission(playerId) {
      const perms = this.getPeerPermissions(playerId);
      if (!perms.place) {
        this._sendPermissionsDenied(playerId, 'Placing objects is disabled for your account');
        return false;
      }
      return true;
    }

    _checkPausePermission(playerId) {
      const perms = this.getPeerPermissions(playerId);
      if (!perms.pause) {
        this._sendPermissionsDenied(playerId, 'Pause is disabled for your account');
        return false;
      }
      return true;
    }

    _checkNukePermission(playerId) {
      const perms = this.getPeerPermissions(playerId);
      if (!perms.nuke) {
        this._sendPermissionsDenied(playerId, 'Nukes are disabled for your account');
        return false;
      }
      return true;
    }

    _checkGuiPermission(playerId, key) {
      const perms = this.getPeerPermissions(playerId);
      if (!perms.settings) {
        this._sendPermissionsDenied(playerId, 'Settings panel is disabled for your account');
        return false;
      }
      if (!key || isLocalPeerGuiKey(key)) {
        this._sendPermissionsDenied(playerId, 'That setting cannot be changed remotely');
        return false;
      }
      return true;
    }

    _denyLocal(reason) {
      if (this._hooks.onPermissionsDenied)
        this._hooks.onPermissionsDenied(reason);
    }

    emitBrush(brush) {
      if (!this.isPeer() || !this.connected) return;
      if (!this._myPermissions.paint) {
        if (brush.active) {
          this._denyLocal('Painting is disabled for your account');
          return;
        }
        // Still send brush release so the host clears any in-progress stroke.
      }
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
      if (!this._myPermissions.place) {
        this._denyLocal('Placing objects is disabled for your account');
        return;
      }
      this.transport.sendJson({
        type: MSG.INPUT_PLACE,
        tool: place.tool,
        x: place.x,
        y: place.y,
      });
    }

    emitPause(paused) {
      if (!this.isPeer() || !this.connected) return;
      if (!this._myPermissions.pause) {
        this._denyLocal('Pause is disabled for your account');
        return;
      }
      this.transport.sendJson({
        type: MSG.INPUT_PAUSE,
        paused: !!paused,
      });
    }

    emitNuke(x, y) {
      if (!this.isPeer() || !this.connected) return;
      if (!this._myPermissions.nuke) {
        this._denyLocal('Nukes are disabled for your account');
        return;
      }
      this.transport.sendJson({
        type: MSG.INPUT_NUKE,
        x,
        y,
      });
    }

    emitGuiChange(key, value) {
      if (!this.isPeer() || !this.connected) return;
      if (!this._myPermissions.settings) {
        this._denyLocal('Settings panel is disabled for your account');
        return;
      }
      if (!key || isLocalPeerGuiKey(key)) return;
      this.transport.sendJson({
        type: MSG.INPUT_GUI,
        key,
        value,
      });
    }

    _flushGuiSet(key, value) {
      if (!this.isHost() || !this.connected) return;
      if (!key || isLocalPeerGuiKey(key)) return;
      this.transport.sendJson({
        type: MSG.GUI_SET,
        key,
        value,
      });
    }

    broadcastGuiSet(key, value, immediate) {
      if (!this.isHost() || !this.connected) return;
      if (!key || isLocalPeerGuiKey(key)) return;
      if (immediate) {
        const pending = this._guiDebounceTimers.get(key);
        if (pending) {
          clearTimeout(pending);
          this._guiDebounceTimers.delete(key);
        }
        this._flushGuiSet(key, value);
        return;
      }
      const existing = this._guiDebounceTimers.get(key);
      if (existing) clearTimeout(existing);
      this._guiDebounceTimers.set(key, setTimeout(() => {
        this._guiDebounceTimers.delete(key);
        this._flushGuiSet(key, value);
      }, this._guiDebounceMs));
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

    _applyPermissionsMap(permissions) {
      if (!permissions) return;
      let changed = false;
      if (this.isHost()) {
        for (const [id, perms] of Object.entries(permissions)) {
          const cloned = clonePermissions(perms);
          this._peerPermissions.set(String(id), cloned);
          for (const p of this.players) {
            if (!p.isHost && String(p.id) === String(id)) {
              p.permissions = cloned;
              changed = true;
            }
          }
        }
      } else if (this.playerId != null) {
        const idKey = String(this.playerId);
        const next = permissions[idKey] || permissions[this.playerId];
        if (next) {
          this._myPermissions = clonePermissions(next);
          changed = true;
          for (const p of this.players) {
            if (String(p.id) === idKey) {
              p.permissions = clonePermissions(next);
              break;
            }
          }
        }
      }
      if (changed && this._hooks.onPermissionsChanged)
        this._hooks.onPermissionsChanged(this._myPermissions);
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
          this._applyPermissionsFromPlayers();
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          if (this._hooks.onJoined) this._hooks.onJoined(msg);
          if (this.isPeer()) this.startSnapshotRetry();
          break;
        case MSG.JOIN_ERROR:
          if (this._hooks.onJoinError) this._hooks.onJoinError(msg.message || 'Join failed');
          this.leave(true);
          break;
        case MSG.PLAYER_JOINED:
          this.players = msg.players || this.players;
          this._rebuildRemotePlayers();
          this._applyPermissionsFromPlayers();
          if (this.isHost() && msg.playerId !== this.playerId) {
            this._peerPermissions.set(String(msg.playerId), defaultPermissions());
            this._broadcastPermissions();
            setTimeout(() => this.sendSnapshotTo(msg.playerId), 100);
          }
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          break;
        case MSG.PLAYER_LEFT:
          this.players = msg.players || [];
          this.remotePlayers.delete(msg.playerId);
          if (this.isHost()) this._peerPermissions.delete(String(msg.playerId));
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          break;
        case MSG.HOST_LEFT:
          if (this._hooks.onJoinError) this._hooks.onJoinError('Host left the session');
          this.leave(true);
          break;
        case MSG.INPUT_BRUSH:
          if (this.isHost() && this._checkBrushPermission(msg.playerId, msg) && this._hooks.onRemoteBrush)
            this._hooks.onRemoteBrush(msg.playerId, msg);
          break;
        case MSG.INPUT_PLACE:
          if (this.isHost() && this._checkPlacePermission(msg.playerId) && this._hooks.onRemotePlace)
            this._hooks.onRemotePlace(msg.playerId, msg);
          break;
        case MSG.INPUT_PAUSE:
          if (this.isHost() && this._checkPausePermission(msg.playerId)) {
            if (this._hooks.onRemotePause)
              this._hooks.onRemotePause(msg.playerId, msg);
            if (msg.paused != null)
              this.broadcastGuiSet('paused', !!msg.paused, true);
          }
          break;
        case MSG.INPUT_NUKE:
          if (this.isHost() && this._checkNukePermission(msg.playerId) && this._hooks.onRemoteNuke)
            this._hooks.onRemoteNuke(msg.playerId, msg);
          break;
        case MSG.INPUT_GUI:
          if (this.isHost() && this._checkGuiPermission(msg.playerId, msg.key)) {
            if (this._hooks.onRemoteGuiChange)
              this._hooks.onRemoteGuiChange(msg.playerId, msg);
            this.broadcastGuiSet(msg.key, msg.value, true);
          }
          break;
        case MSG.GUI_SET:
          if (this.isPeer() && msg.key != null && this._hooks.onGuiSet)
            this._hooks.onGuiSet(msg);
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
          break;
        case MSG.PLAYER_PERMISSIONS:
          if (msg.players) this.players = msg.players;
          this._applyPermissionsMap(msg.permissions);
          if (this._hooks.onPlayersChanged) this._hooks.onPlayersChanged(this.players);
          break;
        case MSG.PERMISSIONS_DENIED:
          if (String(msg.targetPlayerId) === String(this.playerId)) {
            if (this._hooks.onPermissionsDenied)
              this._hooks.onPermissionsDenied(msg.reason);
          }
          break;
        case MSG.KICKED:
          if (this._hooks.onJoinError)
            this._hooks.onJoinError(msg.reason || 'Kicked from the session');
          this.leave(true);
          break;
        case MSG.ROOM_CODE_CHANGED:
          if (msg.roomCode) {
            this.roomCode = msg.roomCode;
            if (this._joinInfo) this._joinInfo.roomCode = msg.roomCode;
            if (this._hooks.onRoomCodeChanged) this._hooks.onRoomCodeChanged(msg.roomCode);
          }
          break;
        case MSG.LIGHTNING_FLASH:
          if (this.isPeer() && this._hooks.onLightningFlash)
            this._hooks.onLightningFlash(msg);
          break;
        default:
          break;
      }
    }

    _applyPermissionsFromPlayers() {
      for (const p of this.players) {
        if (p.isHost || !p.permissions) continue;
        if (this.isHost())
          this._peerPermissions.set(String(p.id), clonePermissions(p.permissions));
        else if (String(p.id) === String(this.playerId))
          this._myPermissions = clonePermissions(p.permissions);
      }
    }

    _handleBinary(buf) {
      const bytes = new Uint8Array(buf);
      if (bytes.length < 5) return;

      if (bytes[0] === BINARY_TEXTURE_SYNC) {
        if (bytes.length < TEXTURE_SYNC_HEADER_BYTES) return;
        const payload = bytes.slice(5);
        const slice = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        if (this._hooks.onTextureSyncBinary) {
          this.markSnapshotReceived();
          this._hooks.onTextureSyncBinary(slice);
        }
        return;
      }

      if (bytes[0] !== BINARY_SNAPSHOT) return;
      const payload = bytes.slice(5);
      const slice = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
      if (this._hooks.onSnapshotBinary) {
        this.markSnapshotReceived();
        this._hooks.onSnapshotBinary(slice, this._pendingSnapshotTarget);
      }
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
