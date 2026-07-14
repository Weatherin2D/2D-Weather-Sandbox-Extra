'use strict';

const http = require('http');
const WebSocket = require('ws');
const { attachMultiplayerRelay } = require('../server/relay');

const server = http.createServer();
attachMultiplayerRelay(server);

function waitMsg(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + type)), timeout);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(t);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

server.listen(0, async () => {
  const port = server.address().port;
  const url = 'ws://127.0.0.1:' + port;
  const peerMsgs = [];
  const hostInputMsgs = [];

  try {
    const host = new WebSocket(url);
    await new Promise((r) => host.once('open', r));
    host.send(JSON.stringify({ type: 'join', role: 'host', roomCode: 'TEST01', playerName: 'Host' }));
    await waitMsg(host, 'joined');

    const peer = new WebSocket(url);
    await new Promise((r) => peer.once('open', r));
    peer.on('message', (d) => peerMsgs.push(JSON.parse(d.toString())));
    host.on('message', (d) => hostInputMsgs.push(JSON.parse(d.toString())));

    peer.send(JSON.stringify({ type: 'join', role: 'peer', roomCode: 'TEST01', playerName: 'Peer' }));
    await waitMsg(peer, 'joined');
    peer.send(JSON.stringify({ type: 'snapshot_request' }));
    await sleep(100);

    host.send(JSON.stringify({ type: 'gui_set', key: 'wind', value: 0.5 }));
    host.send(JSON.stringify({ type: 'place_apply', tool: 'TOOL_STATION', x: 0.1, y: 0.2, placementId: 'p1' }));
    host.send(JSON.stringify({ type: 'gui_bulk', values: { wind: 0.7 } }));
    host.send(JSON.stringify({ type: 'nuke_apply', x: 0.3, y: 0.4, nukeId: 'n1' }));
    await sleep(100);

    peer.send(JSON.stringify({ type: 'input_brush', inputType: 1, x: 0.5, y: 0.5, active: true }));
    peer.send(JSON.stringify({ type: 'input_gui', key: 'wind', value: 0.9 }));
    peer.send(JSON.stringify({ type: 'input_place', tool: 'TOOL_BALLOON', x: 0.2, y: 0.3 }));
    await sleep(150);

    const peerTypes = peerMsgs.map((m) => m.type);
    const hostInputTypes = hostInputMsgs.map((m) => m.type);

    const checks = {
      peer_gui_set: peerTypes.includes('gui_set'),
      peer_place_apply: peerTypes.includes('place_apply'),
      peer_gui_bulk: peerTypes.includes('gui_bulk'),
      peer_nuke_apply: peerTypes.includes('nuke_apply'),
      host_input_brush: hostInputTypes.includes('input_brush'),
      host_input_gui: hostInputTypes.includes('input_gui'),
      host_input_place: hostInputTypes.includes('input_place'),
      peer_no_input_brush: !peerTypes.includes('input_brush'),
    };

    console.log('peer received:', peerTypes.join(', '));
    console.log('host received:', hostInputTypes.join(', '));
    console.log('checks:', JSON.stringify(checks, null, 2));

    const ok = Object.values(checks).every(Boolean);
    console.log(ok ? 'INTEGRATION_OK' : 'INTEGRATION_FAIL');
    host.close();
    peer.close();
    server.close();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error(err);
    server.close();
    process.exit(1);
  }
});
