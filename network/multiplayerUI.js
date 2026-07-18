/**
 * Multiplayer UI controls (host/join panel).
 */
(function(global) {
  'use strict';

  const mp = () => global.WeatherMultiplayer;

  const MP_WIP_ACK_KEY = 'weatherMpWipAck';

  function ensureMultiplayerWipModal() {
    let modal = document.getElementById('mpWipModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'mpWipModal';
    modal.innerHTML =
      '<div class="mp-wip-dialog" role="dialog" aria-labelledby="mpWipTitle" aria-modal="true">' +
        '<h3 id="mpWipTitle">Multiplayer is work-in-progress</h3>' +
        '<p>Co-op multiplayer is still being developed. Sessions may be laggy, glitchy, and at times unplayable. ' +
        'Single-player works normally.</p>' +
        '<button type="button" id="mpWipOkBtn">Got it</button>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function ensureMultiplayerWipAcknowledged() {
    if (global.sessionStorage && global.sessionStorage.getItem(MP_WIP_ACK_KEY) === '1')
      return Promise.resolve(true);
    const modal = ensureMultiplayerWipModal();
    return new Promise((resolve) => {
      const okBtn = document.getElementById('mpWipOkBtn');
      const onOk = () => {
        modal.classList.remove('visible');
        if (global.sessionStorage) global.sessionStorage.setItem(MP_WIP_ACK_KEY, '1');
        okBtn.removeEventListener('click', onOk);
        resolve(true);
      };
      okBtn.addEventListener('click', onOk);
      modal.classList.add('visible');
    });
  }

  function getPublicPlayUrl() {
    const configured = (global.__WEATHER_PUBLIC_PLAY_URL || '').trim().replace(/\/$/, '');
    if (configured) return configured;
    if (mp() && mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin())
      return global.location.origin;
    return '';
  }

  function buildInviteUrl(roomCode) {
    const base = (mp() && mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin())
      ? global.location.origin
      : getPublicPlayUrl() || global.location.origin;
    const code = String(roomCode || '').toUpperCase().trim();
    if (!code) return base;
    return base + '?room=' + encodeURIComponent(code);
  }

  function updateUrlRoomParam(roomCode) {
    if (!global.history || !global.location) return;
    const code = String(roomCode || '').toUpperCase().trim();
    const url = new URL(global.location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    const next = url.pathname + url.search + url.hash;
    global.history.replaceState(null, '', next);
  }

  function applyRoomFromQuery() {
    if (!global.location || !global.URLSearchParams) return '';
    const params = new URLSearchParams(global.location.search);
    const room = (params.get('room') || '').toUpperCase().trim();
    if (!room) return '';
    const codeInput = document.getElementById('mpRoomCode');
    if (codeInput) codeInput.value = room;
    return room;
  }

  function needsPlayOnlineCta() {
    if (!global.location) return false;
    if (global.location.protocol === 'file:') return true;
    return mp() && mp().isStaticDevServer && mp().isStaticDevServer();
  }

  function updateMultiplayerIntro() {
    const el = document.getElementById('mpIntroText');
    if (!el) return;
    if (mp() && mp().isGitHubPagesOrigin && mp().isGitHubPagesOrigin()) {
      el.textContent = 'Play single-player in your browser. Multiplayer is experimental — run npm start locally on your PC to host a LAN session.';
      return;
    }
    if (needsPlayOnlineCta()) {
      el.textContent = 'Host runs the simulation. Peers paint and place tools in real time. Open the GitHub Pages version below for browser play.';
      return;
    }
    if (mp() && mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin()) {
      el.textContent = 'Host runs the simulation. Peers paint and place tools in real time. Share this page URL with friends — no install needed.';
      return;
    }
    if (mp() && mp().isLocalDevServer && mp().isLocalDevServer()) {
      el.textContent = 'Host runs the simulation. Peers paint and place tools in real time. Local dev server — share http://localhost:'
        + mp().getUnifiedServerPort() + ' with others on your network.';
      return;
    }
    el.textContent = 'Host runs the simulation. Peers paint and place tools in real time.';
  }

  function updatePlayOnlineBanner() {
    const banner = document.getElementById('mpPlayOnlineBanner');
    const btn = document.getElementById('mpPlayOnlineBtn');
    const text = document.getElementById('mpPlayOnlineText');
    if (!banner) return;
    const show = needsPlayOnlineCta();
    banner.style.display = show ? 'block' : 'none';
    if (!show) return;
    const url = getPublicPlayUrl();
    if (text) {
      text.textContent = url
        ? 'You are on a local copy. Open the GitHub Pages version in your browser for online single-player.'
        : 'You are on a local copy. Set the URL in network/config.js, then open the GitHub Pages version.';
    }
    if (btn) {
      btn.style.display = url ? 'block' : 'none';
      btn.disabled = !url;
    }
  }

  function updateRelayDetailsVisibility() {
    const details = document.getElementById('mpRelayDetails');
    if (!details) return;
    const hide = mp() && mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin();
    details.style.display = hide ? 'none' : '';
  }

  function updateInviteRow() {
    const row = document.getElementById('mpInviteRow');
    const session = mp();
    if (!row) return;
    const show = session && session.isHost() && session.roomCode
      && mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin();
    row.style.display = show ? 'block' : 'none';
  }

  function updateMultiplayerChrome() {
    updateMultiplayerIntro();
    updatePlayOnlineBanner();
    updateRelayDetailsVisibility();
    updateInviteRow();
  }

  function openPlayOnline() {
    const url = getPublicPlayUrl();
    if (url) global.location.href = url;
    else setStatus('Set your deployed URL in network/config.js (see README)', true);
  }

  function copyInviteLink() {
    const session = mp();
    const url = session && session.roomCode
      ? buildInviteUrl(session.roomCode)
      : buildInviteUrl();
    navigator.clipboard.writeText(url).then(() => {
      setStatus('Invite link copied — send to friends');
    }).catch(() => {
      setStatus('Invite link: ' + url);
    });
  }

  function copyJoinInstructions() {
    const session = mp();
    if (!session || !session.roomCode) return;
    const url = buildInviteUrl(session.roomCode);
    const text = 'Join room ' + session.roomCode + ' at ' + url;
    navigator.clipboard.writeText(text).then(() => {
      setStatus('Join instructions copied');
    }).catch(() => {
      setStatus(text);
    });
  }

  let syncAgeTimer = null;
  let hostMenuOpen = false;
  let adminDragActive = false;
  let adminDragOffsetX = 0;
  let adminDragOffsetY = 0;

  function preserveMultiplayerOverlays()
  {
    const ids = ['multiplayerHud', 'mpHostMenuBtn', 'multiplayerAdminPanel'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.closest('#IntroScreen'))
        document.body.appendChild(el);
    }
  }

  function clampAdminPanelPosition(panel)
  {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - Math.min(panel.offsetHeight, 80));
    const left = Math.min(Math.max(0, rect.left), maxLeft);
    const top = Math.min(Math.max(0, rect.top), maxTop);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
  }

  function initAdminPanelDrag()
  {
    const panel = document.getElementById('multiplayerAdminPanel');
    const handle = document.getElementById('mpAdminDragHandle');
    if (!panel || !handle || handle.dataset.dragInit === '1') return;
    handle.dataset.dragInit = '1';

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      adminDragOffsetX = e.clientX - rect.left;
      adminDragOffsetY = e.clientY - rect.top;
      adminDragActive = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!adminDragActive) return;
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - Math.min(panel.offsetHeight, 80));
      const left = Math.min(Math.max(0, e.clientX - adminDragOffsetX), maxLeft);
      const top = Math.min(Math.max(0, e.clientY - adminDragOffsetY), maxTop);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      adminDragActive = false;
    });

    window.addEventListener('resize', () => clampAdminPanelPosition(panel));
  }

  function updateLoadPhaseStatus(phase) {
    if (!global.multiplayerPeerMode) return;
    switch (phase) {
      case 'parsing':
        setStatus('Decompressing world…');
        break;
      case 'initializing':
        setStatus('Compiling shaders…');
        break;
      case 'ready':
        setStatus('Connected — synced with host');
        break;
      default:
        break;
    }
  }

  function setStatus(text, isError) {
    const el = document.getElementById('mpStatus');
    if (el) {
      el.textContent = text;
      el.style.color = isError ? '#ff6b6b' : '#a8dadc';
    }
  }

  function renderPeerPermissionsHud() {
    const el = document.getElementById('mpHudPerms');
    const session = mp();
    if (!el || !session || !session.isPeer()) {
      if (el) el.style.display = 'none';
      return;
    }
    const perms = session.getMyPermissions();
    const labels = [
      { key: 'paint', label: 'Paint' },
      { key: 'place', label: 'Place' },
      { key: 'pause', label: 'Pause' },
      { key: 'nuke', label: 'Nuke' },
      { key: 'settings', label: 'Settings' },
    ];
    el.style.display = 'block';
    el.textContent = labels.map((p) => p.label + ': ' + (perms[p.key] ? 'on' : 'off')).join(' · ');
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
    renderAdminPanel(players);
  }

  function showPanel(visible) {
    const panel = document.getElementById('multiplayerPanel');
    if (panel) panel.style.display = visible ? 'block' : 'none';
    updateHudVisibility();
  }

  function setHostMenuOpen(open) {
    hostMenuOpen = !!open;
    const admin = document.getElementById('multiplayerAdminPanel');
    const btn = document.getElementById('mpHostMenuBtn');
    if (admin) admin.style.display = hostMenuOpen ? 'block' : 'none';
    if (btn) btn.style.display = hostMenuOpen ? 'none' : 'block';
    updateHudVisibility();
  }

  function toggleHostMenu() {
    setHostMenuOpen(!hostMenuOpen);
  }

  function updateHudVisibility() {
    const session = mp();
    const hud = document.getElementById('multiplayerHud');
    const hostBtn = document.getElementById('mpHostMenuBtn');
    const admin = document.getElementById('multiplayerAdminPanel');
    const inRoom = session && session.isActive();
    const isHost = inRoom && session.isHost();
    const isPeer = inRoom && session.isPeer();

    if (hostBtn) hostBtn.style.display = (isHost && !hostMenuOpen) ? 'block' : 'none';
    if (admin) admin.style.display = (isHost && hostMenuOpen) ? 'block' : 'none';
    if (hud) hud.style.display = isPeer ? 'block' : 'none';
    if (isPeer) renderPeerPermissionsHud();
  }

  function updateHud() {
    const session = mp();
    const roomEl = document.getElementById('mpHudRoom');
    const roleEl = document.getElementById('mpHudRole');
    const adminRoom = document.getElementById('mpAdminRoomCode');
    const roomStatus = document.getElementById('mpAdminRoomStatus');
    const playerCount = document.getElementById('mpAdminPlayerCount');
    if (roomEl) roomEl.textContent = session ? session.roomCode || '—' : '—';
    if (adminRoom) adminRoom.textContent = session ? session.roomCode || '—' : '—';
    if (roleEl && session) {
      if (session.isHost())
        roleEl.textContent = session.simStarted ? 'Hosting (in game)' : 'Hosting — start simulation';
      else if (session.isPeer())
        roleEl.textContent = 'Connected (peer)';
      else
        roleEl.textContent = '—';
    }
    if (roomStatus && session && session.isHost()) {
      roomStatus.textContent = session.simStarted
        ? 'Simulation running — peers syncing'
        : 'Waiting for you to start simulation';
    }
    if (playerCount && session && session.isHost()) {
      const count = (session.players || []).length;
      playerCount.textContent = 'Players: ' + count + ' / 8';
    }
    updateHudVisibility();
    updateSyncAgeDisplay();
    renderPeerPermissionsHud();
  }

  function updateSyncAgeDisplay() {
    const session = mp();
    const el = document.getElementById('mpHudSyncAge');
    if (!el || !session || !session.isPeer()) {
      if (el) el.style.display = 'none';
      return;
    }
    const age = session.getLastSnapshotAgeSec();
    el.style.display = 'block';
    if (age == null)
      el.textContent = 'Waiting for host simulation…';
    else
      el.textContent = 'Last synced ' + age + 's ago';
  }

  function startSyncAgeTimer() {
    if (syncAgeTimer) return;
    syncAgeTimer = setInterval(updateSyncAgeDisplay, 1000);
  }

  function renderAdminPanel(players) {
    const container = document.getElementById('mpAdminPlayerList');
    const session = mp();
    if (!container || !session || !session.isHost() || !players) return;

    container.innerHTML = '';
    const peers = players.filter((p) => !p.isHost);
    if (peers.length === 0) {
      container.textContent = 'No peers connected yet.';
      return;
    }

    for (const p of peers) {
      const row = document.createElement('div');
      row.style.marginBottom = '10px';
      row.style.paddingBottom = '8px';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.15)';

      const nameLine = document.createElement('div');
      nameLine.style.color = p.color || '#fff';
      nameLine.style.marginBottom = '4px';
      nameLine.textContent = p.name + (p.loading ? ' (loading…)' : '');
      row.appendChild(nameLine);

      const perms = session.getPeerPermissions(p.id);
      const permKeys = [
        { key: 'paint', label: 'Paint' },
        { key: 'place', label: 'Place' },
        { key: 'pause', label: 'Pause' },
        { key: 'nuke', label: 'Nuke' },
        { key: 'settings', label: 'Settings' },
      ];
      const permRow = document.createElement('div');
      permRow.style.display = 'flex';
      permRow.style.flexWrap = 'wrap';
      permRow.style.gap = '6px';
      permRow.style.marginBottom = '4px';
      for (const pk of permKeys) {
        const label = document.createElement('label');
        label.style.fontSize = '11px';
        label.style.cursor = 'pointer';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!perms[pk.key];
        cb.dataset.playerId = String(p.id);
        cb.dataset.permKey = pk.key;
        cb.addEventListener('change', () => {
          const update = {};
          update[pk.key] = cb.checked;
          session.setPlayerPermissions(p.id, update);
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + pk.label));
        permRow.appendChild(label);
      }
      row.appendChild(permRow);

      const kickBtn = document.createElement('button');
      kickBtn.type = 'button';
      kickBtn.textContent = 'Kick';
      kickBtn.style.padding = '2px 10px';
      kickBtn.style.fontSize = '11px';
      kickBtn.addEventListener('click', () => {
        if (confirm('Kick ' + p.name + ' from the session?'))
          session.kickPlayer(p.id);
      });
      row.appendChild(kickBtn);

      container.appendChild(row);
    }
  }

  function showRoomCode(code) {
    const el = document.getElementById('mpRoomCodeDisplay');
    if (el) el.textContent = code || '—';
    updateHud();
    updateInviteRow();
  }

  async function hostGame() {
    if (!await ensureMultiplayerWipAcknowledged()) return;
    const nameInput = document.getElementById('mpPlayerName');
    const pwInput = document.getElementById('mpRoomPassword');
    const name = (nameInput && nameInput.value.trim()) || 'Host';
    const password = (pwInput && pwInput.value) || '';
    try {
      setStatus('Connecting to ' + mp().getRelayUrl() + '…');
      const code = await mp().host(name, null, password);
      global.multiplayerHostMode = true;
      global.multiplayerPeerMode = false;
      window.multiplayerJoinInfo = { roomCode: code, playerName: name, role: 'host', roomPassword: password };
      if (typeof global.SETUP_MODE !== 'undefined' && !global.SETUP_MODE)
        global.multiplayerSimReady = true;
      showRoomCode(code);
      updateUrlRoomParam(code);
      if (mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin())
        setStatus('Hosting room ' + code + (password ? ' (password set)' : '') + ' — share this page with friends');
      else
        setStatus('Hosting room ' + code + (password ? ' (password set)' : '') + ' — create a simulation to start');
      showPanel(true);
      setHostMenuOpen(true);
      updateHud();
      if (global.enforceMultiplayerGuardrails) global.enforceMultiplayerGuardrails();
      if (global.syncMultiplayerModeFlags) global.syncMultiplayerModeFlags();
    } catch (err) {
      setStatus(err.message || 'Failed to host', true);
      global.multiplayerHostMode = false;
      global.multiplayerPeerMode = false;
    }
  }

  async function joinGame() {
    if (!await ensureMultiplayerWipAcknowledged()) return;
    const nameInput = document.getElementById('mpPlayerName');
    const codeInput = document.getElementById('mpRoomCode');
    const pwInput = document.getElementById('mpRoomPassword');
    const name = (nameInput && nameInput.value.trim()) || 'Player';
    const code = codeInput ? codeInput.value.trim() : '';
    const password = (pwInput && pwInput.value) || '';
    if (!code) {
      setStatus('Enter a room code', true);
      return;
    }
    try {
      setStatus('Connecting to ' + mp().getRelayUrl() + '…');
      await mp().join(code, name, password);
      global.multiplayerHostMode = false;
      global.multiplayerPeerMode = true;
      window.multiplayerJoinInfo = {
        roomCode: code.toUpperCase().trim(),
        playerName: name,
        role: 'peer',
        roomPassword: password,
      };
      updateIntroForPeerMode();
      showRoomCode(code.toUpperCase());
      setStatus('Joined room ' + code.toUpperCase() + ' — waiting for host simulation…');
      showPanel(true);
      setHostMenuOpen(false);
      updateHud();
      startSyncAgeTimer();
      if (global.enforceMultiplayerGuardrails) global.enforceMultiplayerGuardrails();
      if (global.syncMultiplayerModeFlags) global.syncMultiplayerModeFlags();
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
    updateIntroForPeerMode();
    showRoomCode('—');
    setHostMenuOpen(false);
    setStatus(getDefaultIdleStatus(), needsPlayOnlineCta() && !getPublicPlayUrl());
    renderPlayerList([]);
    updateHudVisibility();
  }

  function getDefaultIdleStatus() {
    if (needsPlayOnlineCta()) {
      if (getPublicPlayUrl())
        return 'Use “Open in browser” above for the GitHub Pages version';
      return 'Set your online URL in network/config.js to enable the browser link';
    }
    if (mp() && mp().isGitHubPagesOrigin && mp().isGitHubPagesOrigin())
      return 'Single-player ready — run npm start locally for experimental multiplayer';
    if (mp() && mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin())
      return 'Multiplayer ready — share this page with friends';
    if (mp() && mp().isLocalDevServer && mp().isLocalDevServer())
      return 'Multiplayer ready — share this URL on your LAN';
    return 'Multiplayer ready — click Host or Join';
  }

  function testConnection() {
    if (!mp()) return;
    ensureMultiplayerWipAcknowledged().then((ack) => {
      if (!ack) return;
      runTestConnection();
    });
  }

  function runTestConnection() {
    if (!mp()) return;
    const url = mp().getRelayUrl();
    setStatus('Testing ' + url + '…');
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      setStatus('Connection timed out — server may be offline or still starting', true);
    }, 8000);
    ws.onopen = () => {
      clearTimeout(timeout);
      ws.close();
      setStatus('Connection OK — multiplayer is available');
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      if (needsPlayOnlineCta()) {
        const url = getPublicPlayUrl();
        setStatus(url
          ? 'Cannot reach multiplayer here — use npm start locally, or try again later'
          : 'Cannot reach multiplayer — set network/config.js to your deployed URL', true);
        return;
      }
      const hint = mp().isGitHubPagesOrigin && mp().isGitHubPagesOrigin()
        ? ' GitHub Pages hosts single-player only — run npm start locally for multiplayer.'
        : mp().isStaticDevServer()
        ? ' Open http://localhost:' + mp().getUnifiedServerPort() + ' or your deployed site URL.'
        : ' Check your connection or try again in a moment.';
      setStatus('Cannot reach multiplayer at ' + url + '.' + hint, true);
    };
  }

  function copyRoomCode() {
    const session = mp();
    if (!session || !session.roomCode) return;
    navigator.clipboard.writeText(session.roomCode).then(() => {
      setStatus('Room code copied: ' + session.roomCode);
    }).catch(() => {
      setStatus('Room code: ' + session.roomCode);
    });
  }

  function rerollRoomCode() {
    const session = mp();
    if (!session || !session.isHost()) return;
    if (!confirm('Generate a new join code? Connected players stay in the session; share the new code for future joins.'))
      return;
    const newCode = session.rerollRoomCode();
    if (newCode) {
      showRoomCode(newCode);
      updateUrlRoomParam(newCode);
      setStatus('New room code: ' + newCode);
    }
  }

  function handleDisconnected(wasInRoom) {
    const joinInfo = window.multiplayerJoinInfo;
    const wasPeer = global.multiplayerPeerMode
      || (joinInfo && joinInfo.role === 'peer');
    if (wasPeer && joinInfo) {
      setStatus('Reconnecting…');
      mp().reconnectAsPeer().then((ok) => {
        if (ok) {
          global.multiplayerPeerMode = true;
          global.multiplayerHostMode = false;
          if (global.syncMultiplayerModeFlags) global.syncMultiplayerModeFlags();
          setStatus('Reconnected — syncing…');
          mp().requestSnapshot();
          mp().startSnapshotRetry();
          updateHud();
        } else {
          setStatus('Disconnected — could not reconnect. Refresh the page and try again.', true);
          global.multiplayerHostMode = false;
          global.multiplayerPeerMode = false;
          renderPlayerList([]);
          updateHudVisibility();
        }
      });
      return;
    }
    if (wasInRoom)
      setStatus('Disconnected from relay', true);
    global.multiplayerHostMode = false;
    global.multiplayerPeerMode = false;
    setHostMenuOpen(false);
    renderPlayerList([]);
    updateHudVisibility();
    updateIntroForPeerMode();
  }

  function updateIntroForPeerMode() {
    const createBtn = document.getElementById('mpCreateSimBtn');
    const hint = document.getElementById('mpPeerWaitHint');
    const session = mp();
    const isPeer = global.multiplayerPeerMode && session && session.isPeer();
    if (createBtn) {
      createBtn.disabled = !!isPeer;
      createBtn.style.opacity = isPeer ? '0.45' : '';
      createBtn.style.cursor = isPeer ? 'not-allowed' : '';
    }
    if (hint) {
      hint.style.display = isPeer ? 'block' : 'none';
      if (isPeer && session && session.roomCode)
        hint.textContent = 'Joined room ' + session.roomCode + ' — waiting for host simulation…';
    }
  }

  function initMultiplayerUI() {
    const hostBtn = document.getElementById('mpHostBtn');
    const joinBtn = document.getElementById('mpJoinBtn');
    const leaveBtn = document.getElementById('mpLeaveBtn');
    const testBtn = document.getElementById('mpTestBtn');
    const copyBtn = document.getElementById('mpCopyCodeBtn');
    const rerollBtn = document.getElementById('mpRerollCodeBtn');
    const hostMenuBtn = document.getElementById('mpHostMenuBtn');
    const hostMenuClose = document.getElementById('mpHostMenuClose');
    const relayInput = document.getElementById('mpRelayUrl');
    const copyInviteLinkBtn = document.getElementById('mpCopyInviteLinkBtn');
    const copyJoinInstructionsBtn = document.getElementById('mpCopyJoinInstructionsBtn');
    const playOnlineBtn = document.getElementById('mpPlayOnlineBtn');
    if (hostBtn) hostBtn.addEventListener('click', hostGame);
    if (joinBtn) joinBtn.addEventListener('click', joinGame);
    if (leaveBtn) leaveBtn.addEventListener('click', leaveGame);
    if (testBtn) testBtn.addEventListener('click', testConnection);
    if (copyBtn) copyBtn.addEventListener('click', copyRoomCode);
    if (rerollBtn) rerollBtn.addEventListener('click', rerollRoomCode);
    if (copyInviteLinkBtn) copyInviteLinkBtn.addEventListener('click', copyInviteLink);
    if (copyJoinInstructionsBtn) copyJoinInstructionsBtn.addEventListener('click', copyJoinInstructions);
    if (playOnlineBtn) playOnlineBtn.addEventListener('click', openPlayOnline);
    if (hostMenuBtn) hostMenuBtn.addEventListener('click', toggleHostMenu);
    if (hostMenuClose) hostMenuClose.addEventListener('click', () => setHostMenuOpen(false));
    initAdminPanelDrag();
    preserveMultiplayerOverlays();
    if (relayInput) {
      relayInput.addEventListener('input', () => {
        relayInput.dataset.userOverride = relayInput.value.trim() ? '1' : '';
      });
    }

    updateMultiplayerChrome();

    const roomFromUrl = applyRoomFromQuery();
    if (roomFromUrl) {
      if (mp() && mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin())
        setStatus('Room code loaded — enter your name and click Join Game');
      else
        setStatus('Room code loaded from link — click Join Game');
    }

    if (!mp()) return;

    if (!roomFromUrl)
      setStatus(getDefaultIdleStatus(), needsPlayOnlineCta() && !getPublicPlayUrl());

    startSyncAgeTimer();

    mp().setHooks({
      onPlayersChanged(players) {
        renderPlayerList(players);
        updateHud();
      },
      onJoinError(msg) {
        setStatus(msg, true);
        global.multiplayerHostMode = false;
        global.multiplayerPeerMode = false;
        updateHudVisibility();
      },
      onJoined(msg) {
        if (msg.isHost) {
          if (mp().isOnlineMultiplayerOrigin && mp().isOnlineMultiplayerOrigin())
            setStatus('Connected — hosting room ' + msg.roomCode + '. Share this page with friends.');
          else
            setStatus('Connected — hosting room ' + msg.roomCode);
          setHostMenuOpen(true);
          updateInviteRow();
        } else {
          setStatus('Connected to room ' + msg.roomCode + ' — waiting for host simulation…');
          mp().requestSnapshot();
          mp().startSnapshotRetry();
          updateIntroForPeerMode();
        }
        if (global.syncMultiplayerModeFlags) global.syncMultiplayerModeFlags();
        updateHud();
      },
      onSnapshotBinary() {
        updateSyncAgeDisplay();
      },
      onSyncMeta(meta) {
        if (global.onMultiplayerSyncMeta)
          global.onMultiplayerSyncMeta(meta);
        updateHud();
      },
      onPermissionsChanged(perms) {
        if (global.enforceMultiplayerGuardrails) global.enforceMultiplayerGuardrails();
        renderPeerPermissionsHud();
        if (global.multiplayerPeerMode)
          setStatus('Permissions updated by host');
        if (mp() && mp().isHost()) {
          const players = mp().players || [];
          renderAdminPanel(players);
        }
      },
      onPermissionsDenied(reason) {
        setStatus(reason || 'Action not allowed', true);
      },
      onRoomCodeChanged(code) {
        showRoomCode(code);
        updateUrlRoomParam(code);
        setStatus('Room code updated: ' + code);
      },
      onDisconnected: handleDisconnected,
    });
  }

  global.WeatherMultiplayerUI = {
    init: initMultiplayerUI,
    hostGame,
    joinGame,
    leaveGame,
    testConnection,
    setStatus,
    renderPlayerList,
    showPanel,
    handleDisconnected,
    updateHud,
    renderPeerPermissionsHud,
    updateSyncAgeDisplay,
    toggleHostMenu,
    setHostMenuOpen,
    preserveMultiplayerOverlays,
    updateLoadPhaseStatus,
    updateIntroForPeerMode,
    copyInviteLink,
    copyJoinInstructions,
    openPlayOnline,
    updateMultiplayerChrome,
    getPublicPlayUrl,
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initMultiplayerUI);
  else
    initMultiplayerUI();
})(typeof window !== 'undefined' ? window : global);
