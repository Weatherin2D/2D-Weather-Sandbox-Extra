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

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

server.listen(0, async () => {
  const port = server.address().port;
  const url = 'ws://127.0.0.1:' + port;
  const peerMsgs = [];
  const hostInputMsgs = [];
  let failed = false;

  try {
    // --- Open room (no password) ---
    const host = await openWs(url);
    host.send(JSON.stringify({ type: 'join', role: 'host', roomCode: 'TESTABCD', playerName: 'Host' }));
    await waitMsg(host, 'joined');

    const peer = await openWs(url);
    peer.on('message', (d) => peerMsgs.push(JSON.parse(d.toString())));
    host.on('message', (d) => hostInputMsgs.push(JSON.parse(d.toString())));

    peer.send(JSON.stringify({ type: 'join', role: 'peer', roomCode: 'TESTABCD', playerName: 'Peer' }));
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

    console.log('open-room checks:', JSON.stringify(checks, null, 2));
    if (!Object.values(checks).every(Boolean)) {
      console.error('FAIL: open room relay checks');
      failed = true;
    }

    host.close();
    peer.close();
    await sleep(50);

    // --- Password room ---
    const hostPw = await openWs(url);
    hostPw.send(JSON.stringify({
      type: 'join', role: 'host', roomCode: 'PASSROOM', playerName: 'Host', roomPassword: 'secret',
    }));
    await waitMsg(hostPw, 'joined');

    const badPeer = await openWs(url);
    const badJoin = waitMsg(badPeer, 'join_error');
    badPeer.send(JSON.stringify({
      type: 'join', role: 'peer', roomCode: 'PASSROOM', playerName: 'Bad', roomPassword: 'wrong',
    }));
    const badMsg = await badJoin;
    if (badMsg.message !== 'Incorrect room password') {
      console.error('FAIL: expected incorrect password error, got', badMsg);
      failed = true;
    } else {
      console.log('password reject: ok');
    }
    badPeer.close();

    const goodPeer = await openWs(url);
    goodPeer.send(JSON.stringify({
      type: 'join', role: 'peer', roomCode: 'PASSROOM', playerName: 'Good', roomPassword: 'secret',
    }));
    const goodJoined = await waitMsg(goodPeer, 'joined');
    if (!goodJoined || goodJoined.isHost) {
      console.error('FAIL: password peer join');
      failed = true;
    } else {
      console.log('password join: ok');
    }

    // Peer binary should be ignored (no crash)
    goodPeer.send(Buffer.from([0x01, 0, 0, 0, 0, 1, 2, 3]));
    await sleep(50);

    hostPw.close();
    goodPeer.close();

    if (failed) {
      console.error('relay-integration FAILED');
      process.exitCode = 1;
    } else {
      console.log('relay-integration OK');
      process.exitCode = 0;
    }
  } catch (e) {
    console.error('relay-integration error', e);
    process.exitCode = 1;
  } finally {
    server.close();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  }
});
