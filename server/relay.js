/**
 * Multiplayer WebSocket relay — routes messages between players in a room.
 * Does not run simulation physics.
 */
'use strict';

const { WebSocketServer } = require('ws');

const BINARY_SNAPSHOT = 0x01;
const BINARY_TEXTURE_SYNC = 0x02;

/** @type {Map<string, { hostId: string, players: Map<string, object> }>} */
const rooms = new Map();

let nextPlayerId = 1;

const DEFAULT_PERMISSIONS = { paint: true, place: true, pause: false, nuke: false, settings: false };

function sanitizePlayers(room) {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isHost: p.isHost,
    loading: !!p.loading,
    permissions: p.isHost ? undefined : (p.permissions || DEFAULT_PERMISSIONS),
  }));
}

function sendJson(ws, obj) {
  if (ws.readyState === ws.OPEN)
    ws.send(JSON.stringify(obj));
}

function broadcastRoom(roomCode, msg, exceptWs) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const text = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.ws !== exceptWs && p.ws.readyState === p.ws.OPEN)
      p.ws.send(text);
  }
}

function sendToPlayer(room, playerId, data, isBinary) {
  const p = room.players.get(String(playerId));
  if (p && p.ws.readyState === p.ws.OPEN)
    p.ws.send(data, isBinary ? { binary: true } : undefined);
}

function removePlayer(ws) {
  const roomCode = ws._roomCode;
  const playerId = ws._playerId;
  if (!roomCode || !playerId) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  const wasHost = String(room.hostId) === String(playerId);
  room.players.delete(String(playerId));

  if (room.players.size === 0) {
    rooms.delete(roomCode);
    return;
  }

  if (wasHost) {
    broadcastRoom(roomCode, { type: 'host_left', message: 'Host disconnected' });
    rooms.delete(roomCode);
    for (const p of room.players.values()) {
      if (p.ws.readyState === p.ws.OPEN) p.ws.close();
    }
    return;
  }

  broadcastRoom(roomCode, {
    type: 'player_left',
    playerId,
    players: sanitizePlayers(room),
  });
}

/**
 * Attach multiplayer relay WebSocket handler to an existing HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {{ wss: WebSocketServer, stop: () => void }}
 */
function attachMultiplayerRelay(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 128 * 1024 * 1024,
  });

  wss.on('connection', (ws) => {
    ws._roomCode = null;
    ws._playerId = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const roomCode = ws._roomCode;
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;

        const bytes = Buffer.from(data);
        if (bytes.length >= 5 && (bytes[0] === BINARY_SNAPSHOT || bytes[0] === BINARY_TEXTURE_SYNC)) {
          const targetId = bytes.readUInt32LE(1);
          if (targetId > 0) {
            sendToPlayer(room, targetId, data, true);
            return;
          }
        }

        for (const p of room.players.values()) {
          if (p.ws !== ws && p.ws.readyState === p.ws.OPEN)
            p.ws.send(data, { binary: true });
        }
        return;
      }

      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === 'join') {
        const roomCode = String(msg.roomCode || '').toUpperCase().trim();
        const role = msg.role === 'host' ? 'host' : 'peer';
        const playerName = String(msg.playerName || 'Player').slice(0, 24);

        if (!roomCode) {
          sendJson(ws, { type: 'join_error', message: 'Invalid room code' });
          return;
        }

        let room = rooms.get(roomCode);

        if (role === 'host') {
          if (room) {
            sendJson(ws, { type: 'join_error', message: 'Room already exists' });
            return;
          }
          room = { hostId: null, players: new Map() };
          rooms.set(roomCode, room);
        } else {
          if (!room) {
            sendJson(ws, { type: 'join_error', message: 'Room not found' });
            return;
          }
          if (room.players.size >= 8) {
            sendJson(ws, { type: 'join_error', message: 'Room is full' });
            return;
          }
        }

        const playerId = nextPlayerId++;
        const colorIndex = room.players.size;
        const colors = [
          '#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8',
          '#55efc4', '#74b9ff', '#fab1a0',
        ];
        const player = {
          id: playerId,
          name: playerName,
          color: colors[colorIndex % colors.length],
          isHost: role === 'host',
          loading: false,
          permissions: role === 'host' ? undefined : { ...DEFAULT_PERMISSIONS },
          ws,
        };

        room.players.set(String(playerId), player);
        ws._roomCode = roomCode;
        ws._playerId = playerId;

        if (role === 'host')
          room.hostId = String(playerId);

        sendJson(ws, {
          type: 'joined',
          playerId,
          roomCode,
          isHost: role === 'host',
          players: sanitizePlayers(room),
        });

        if (role === 'peer') {
          broadcastRoom(roomCode, {
            type: 'player_joined',
            playerId,
            players: sanitizePlayers(room),
          }, ws);
        }
        return;
      }

      const roomCode = ws._roomCode;
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      msg.playerId = ws._playerId;

      if (msg.type === 'peer_loading' || msg.type === 'peer_ready') {
        const self = room.players.get(String(ws._playerId));
        if (self) self.loading = msg.type === 'peer_loading';
        broadcastRoom(roomCode, {
          type: msg.type,
          playerId: ws._playerId,
          players: sanitizePlayers(room),
        }, ws);
        return;
      }

      if (msg.type === 'snapshot_request') {
        const host = room.players.get(String(room.hostId));
        if (host && host.ws.readyState === host.ws.OPEN)
          sendJson(host.ws, { ...msg, playerId: ws._playerId });
        return;
      }

      if (msg.type === 'snapshot_meta') {
        const targetId = msg.targetPlayerId || 0;
        if (targetId > 0)
          sendToPlayer(room, targetId, JSON.stringify(msg), false);
        else
          broadcastRoom(roomCode, msg, ws);
        return;
      }

      if (msg.type === 'kick_player') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        const targetId = String(msg.targetPlayerId);
        const target = room.players.get(targetId);
        if (!target || target.isHost) return;
        sendJson(target.ws, { type: 'kicked', reason: msg.reason || 'Kicked by host' });
        target.ws.close();
        return;
      }

      if (msg.type === 'room_code_change') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        const newCode = String(msg.newRoomCode || '').toUpperCase().trim();
        if (!newCode || newCode === roomCode) return;
        if (rooms.has(newCode)) {
          sendJson(ws, { type: 'join_error', message: 'Room code already taken' });
          return;
        }
        rooms.delete(roomCode);
        rooms.set(newCode, room);
        for (const p of room.players.values())
          p.ws._roomCode = newCode;
        broadcastRoom(newCode, { type: 'room_code_changed', roomCode: newCode });
        return;
      }

      if (msg.type === 'player_permissions') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        if (msg.permissions) {
          for (const [pid, perms] of Object.entries(msg.permissions)) {
            const p = room.players.get(String(pid));
            if (p && !p.isHost) p.permissions = perms;
          }
        }
        broadcastRoom(roomCode, {
          type: msg.type,
          permissions: msg.permissions,
          players: sanitizePlayers(room),
        }, ws);
        return;
      }

      if (msg.type === 'gui_set') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        broadcastRoom(roomCode, msg, ws);
        return;
      }

      if (msg.type === 'place_apply') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        broadcastRoom(roomCode, msg, ws);
        return;
      }

      if (msg.type === 'nuke_apply') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        broadcastRoom(roomCode, msg, ws);
        return;
      }

      if (msg.type === 'gui_bulk') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        broadcastRoom(roomCode, msg, ws);
        return;
      }

      if (msg.type === 'permissions_denied') {
        if (String(ws._playerId) !== String(room.hostId)) return;
        if (msg.targetPlayerId)
          sendToPlayer(room, msg.targetPlayerId, JSON.stringify(msg), false);
        return;
      }

      const hostOnlyInputs = new Set([
        'input_brush', 'input_place', 'input_pause', 'input_nuke', 'input_gui',
      ]);
      if (hostOnlyInputs.has(msg.type)) {
        const host = room.players.get(String(room.hostId));
        if (host && host.ws.readyState === host.ws.OPEN)
          sendJson(host.ws, msg);
        return;
      }

      broadcastRoom(roomCode, msg, ws);
    });

    ws.on('close', () => removePlayer(ws));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  return {
    wss,
    stop() {
      clearInterval(heartbeat);
      wss.close();
    },
  };
}

module.exports = { attachMultiplayerRelay };

// Standalone relay-only mode: node server/relay.js [port]
if (require.main === module) {
  const http = require('http');
  const PORT = parseInt(process.argv[2] || process.env.PORT || '8787', 10);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('2D Weather Sandbox multiplayer relay\n');
  });
  attachMultiplayerRelay(server);
  server.listen(PORT, () => {
    console.log('Weather Sandbox relay listening on port ' + PORT);
  });
}
