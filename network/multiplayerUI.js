/**
 * Multiplayer UI controls (host/join panel).
 */
(function(global) {
  'use strict';

  const mp = () => global.WeatherMultiplayer;
  const proto = () => global.WeatherMpProtocol;

  function setStatus(text, isError) {
    const el = document.getElementById('mpStatus');
    if (el) {
      el.textContent = text;
      el.style.color = isError ? '#ff6b6b' : '#a8dadc';
    }
  }

  function renderPlayerList(players) {
    const list = document.getElementById('mpPlayerList');
    if (!list) return;
    list.innerHTML = '';
    const session = mp();
    if (!session || !players) return;
    for (const p of players) {
      const li = document.createElement('li');
      li.style.color = p.color || '#fff';
      const tag = p.isHost ? ' (host)' : '';
      const you = p.id === session.playerId ? ' — you' : '';
      li.textContent = p.name + tag + you;
      list.appendChild(li);
    }
  }

  function showPanel(visible) {
    const panel = document.getElementById('multiplayerPanel');
    if (panel) panel.style.display = visible ? 'block' : 'none';
    const hud = document.getElementById('multiplayerHud');
    if (hud) hud.style.display = visible ? 'block' : 'none';
  }

  function updateHud() {
    const session = mp();
    const roomEl = document.getElementById('mpHudRoom');
    const roleEl = document.getElementById('mpHudRole');
    if (roomEl) roomEl.textContent = session ? session.roomCode || '—' : '—';
    if (roleEl && session) {
      roleEl.textContent = session.isHost() ? 'Hosting' : (session.isPeer() ? 'Connected (peer)' : '—');
    }
  }

  function showRoomCode(code) {
    const el = document.getElementById('mpRoomCodeDisplay');
    if (el) el.textContent = code || '—';
  }

  async function hostGame() {
    const nameInput = document.getElementById('mpPlayerName');
    const name = (nameInput && nameInput.value.trim()) || 'Host';
    try {
      setStatus('Connecting to ' + mp().getRelayUrl() + '…');
      const code = await mp().host(name);
      global.multiplayerHostMode = true;
      global.multiplayerPeerMode = false;
      window.multiplayerJoinInfo = { roomCode: code, playerName: name };
      showRoomCode(code);
      setStatus('Hosting room ' + code + ' — create a simulation to start');
      showPanel(true);
      updateHud();
      if (global.enforceMultiplayerGuardrails) global.enforceMultiplayerGuardrails();
    } catch (err) {
      setStatus(err.message || 'Failed to host', true);
      global.multiplayerHostMode = false;
      global.multiplayerPeerMode = false;
    }
  }

  async function joinGame() {
    const nameInput = document.getElementById('mpPlayerName');
    const codeInput = document.getElementById('mpRoomCode');
    const name = (nameInput && nameInput.value.trim()) || 'Player';
    const code = codeInput ? codeInput.value.trim() : '';
    if (!code) {
      setStatus('Enter a room code', true);
      return;
    }
    try {
      setStatus('Connecting to ' + mp().getRelayUrl() + '…');
      await mp().join(code, name);
      global.multiplayerHostMode = false;
      global.multiplayerPeerMode = true;
      window.multiplayerJoinInfo = { roomCode: code.toUpperCase().trim(), playerName: name };
      showRoomCode(code.toUpperCase());
      setStatus('Joined room ' + code.toUpperCase() + ' — waiting for snapshot…');
      showPanel(true);
      updateHud();
      mp().requestSnapshot();
      if (global.enforceMultiplayerGuardrails) global.enforceMultiplayerGuardrails();
    } catch (err) {
      setStatus(err.message || 'Failed to join', true);
      global.multiplayerHostMode = false;
      global.multiplayerPeerMode = false;
    }
  }

  function leaveGame() {
    if (mp()) mp().leave(true);
    global.multiplayerHostMode = false;
    global.multiplayerPeerMode = false;
    window.multiplayerJoinInfo = null;
    showRoomCode('—');
    setStatus('Disconnected');
    renderPlayerList([]);
  }

  function handleDisconnected(wasInRoom) {
    if (global.multiplayerPeerMode && window.multiplayerJoinInfo && global.multiplayerSimReady) {
      setStatus('Reconnecting…');
      mp().reconnectAsPeer().then((ok) => {
        if (ok) {
          setStatus('Reconnected — syncing…');
          mp().requestSnapshot();
        } else {
          setStatus('Disconnected — could not reconnect. Is the relay running?', true);
          global.multiplayerHostMode = false;
          global.multiplayerPeerMode = false;
          renderPlayerList([]);
        }
      });
      return;
    }
    if (wasInRoom)
      setStatus('Disconnected from relay', true);
    global.multiplayerHostMode = false;
    global.multiplayerPeerMode = false;
    renderPlayerList([]);
  }

  function initMultiplayerUI() {
    const hostBtn = document.getElementById('mpHostBtn');
    const joinBtn = document.getElementById('mpJoinBtn');
    const leaveBtn = document.getElementById('mpLeaveBtn');
    if (hostBtn) hostBtn.addEventListener('click', hostGame);
    if (joinBtn) joinBtn.addEventListener('click', joinGame);
    if (leaveBtn) leaveBtn.addEventListener('click', leaveGame);

    if (!mp()) return;

    mp().setHooks({
      onPlayersChanged(players) {
        renderPlayerList(players);
        updateHud();
      },
      onJoinError(msg) {
        setStatus(msg, true);
        global.multiplayerHostMode = false;
        global.multiplayerPeerMode = false;
      },
      onJoined(msg) {
        if (msg.isHost)
          setStatus('Connected — hosting room ' + msg.roomCode);
        else
          setStatus('Connected to room ' + msg.roomCode + ' — waiting for snapshot…');
        updateHud();
      },
      onSnapshotBinary(buf) {
        if (global.loadSnapshotFromNetwork)
          global.loadSnapshotFromNetwork(buf);
      },
      onSyncMeta(meta) {
        if (global.onMultiplayerSyncMeta)
          global.onMultiplayerSyncMeta(meta);
      },
      onDisconnected: handleDisconnected,
    });
  }

  global.WeatherMultiplayerUI = {
    init: initMultiplayerUI,
    hostGame,
    joinGame,
    leaveGame,
    setStatus,
    renderPlayerList,
    showPanel,
    handleDisconnected,
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
  else
    initMultiplayerUI();
})(typeof window !== 'undefined' ? window : global);
