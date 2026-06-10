'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  connected: false,
  mode: null,       // 'usb' | 'octoprint' | 'moonraker'
  printing: false,
  paused: false,
  ejecting: false,
  queue: [],
  currentItem: null,
};

// ── DOM refs ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Mode tabs
const modeTabs       = document.querySelectorAll('.mode-tab');
const wifiPanel      = $('wifi-panel');
const usbPanel       = $('usb-panel');

// WiFi
const wifiType          = $('wifi-type');
const wifiIp            = $('wifi-ip');
const wifiApikey        = $('wifi-apikey');
const apikeyField       = $('apikey-field');
const bambuSerialField  = $('bambu-serial-field');
const bambuCodeField    = $('bambu-code-field');
const bambuSerial       = $('bambu-serial');
const bambuCode         = $('bambu-code');
const wifiConnectBtn    = $('wifi-connect-btn');
const wifiDiscBtn       = $('wifi-disconnect-btn');

// USB
const portSelect     = $('port-select');
const baudSelect     = $('baud-select');
const usbConnectBtn  = $('usb-connect-btn');
const usbDiscBtn     = $('usb-disconnect-btn');
const refreshPortsBtn= $('refresh-ports');

// Shared
const statusChip     = $('status-chip');
const statusText     = $('status-text');
const addFilesBtn    = $('add-files-btn');
const clearQueueBtn  = $('clear-queue-btn');
const startQueueBtn  = $('start-queue-btn');
const dropZone       = $('drop-zone');
const emptyState     = $('empty-state');
const queueCount     = $('queue-count');
const consoleOutput  = $('console-output');
const consoleInput   = $('console-input');
const consoleSend    = $('console-send');
const clearConsoleBtn= $('clear-console-btn');
const currentFileEl  = $('current-file');
const progressFill   = $('progress-fill');
const progressPct    = $('progress-pct');
const gcodeLineEl    = $('gcode-line');
const pauseBtn       = $('pause-btn');
const resumeBtn      = $('resume-btn');
const cancelBtn      = $('cancel-btn');
const tempHotend     = $('temp-hotend');
const tempHotendTgt  = $('temp-hotend-target');
const tempBed        = $('temp-bed');
const tempBedTgt     = $('temp-bed-target');
const editEjectBtn   = $('edit-eject-btn');
const ejectModal     = $('eject-modal');
const ejectInput     = $('eject-gcode-input');
const ejectSaveBtn   = $('eject-save-btn');
const ejectCancelBtn = $('eject-cancel-btn');

// Update banner
const updateBanner      = $('update-banner');
const updateMsg         = $('update-msg');
const updateInstallBtn  = $('update-install-btn');
const updateDismissBtn  = $('update-dismiss-btn');

// Reconnect badge
const reconnectBadge    = $('reconnect-badge');

// Webcam
const webcamPanel       = $('webcam-panel');
const webcamImg         = $('webcam-img');
const webcamPlaceholder = $('webcam-placeholder');
const webcamToggleBtn   = $('webcam-toggle-btn');
let webcamCollapsed     = false;

// History
const historyBtn        = $('history-btn');
const historyModal      = $('history-modal');
const historyList       = $('history-list');
const historyClearBtn   = $('history-clear-btn');
const historyCloseBtn   = $('history-close-btn');

// ── Init ───────────────────────────────────────────────────────────────────────
(async () => {
  await refreshPorts();
  await loadQueue();
  const lines = await window.printer.getEjectGcode();
  ejectInput.value = lines.join('\n');
})();

// ── Mode tabs ──────────────────────────────────────────────────────────────────
modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (state.connected) { toast('Disconnect first', 'error'); return; }
    modeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const m = tab.dataset.mode;
    wifiPanel.classList.toggle('hidden', m !== 'wifi');
    usbPanel.classList.toggle('hidden',  m !== 'usb');
  });
});

// Show/hide fields based on wifi type
wifiType.addEventListener('change', () => {
  const v = wifiType.value;
  apikeyField.classList.toggle('hidden',      v !== 'octoprint');
  bambuSerialField.classList.toggle('hidden', v !== 'bambu');
  bambuCodeField.classList.toggle('hidden',   v !== 'bambu');
});

// ── WiFi connect ───────────────────────────────────────────────────────────────
wifiConnectBtn.addEventListener('click', async () => {
  const ip = wifiIp.value.trim();
  if (!ip) { toast('Enter the printer IP address', 'error'); return; }

  wifiConnectBtn.disabled = true;
  wifiConnectBtn.textContent = 'Connecting…';
  logLine(`Connecting to ${ip} via ${wifiType.value}…`, 'info');

  let res;
  if (wifiType.value === 'octoprint') {
    const apiKey = wifiApikey.value.trim();
    if (!apiKey) { toast('Enter your OctoPrint API key', 'error'); wifiConnectBtn.disabled = false; wifiConnectBtn.textContent = 'Connect'; return; }
    res = await window.printer.connectOctoPrint({ ip, apiKey });
  } else if (wifiType.value === 'bambu') {
    const serial = bambuSerial.value.trim();
    const accessCode = bambuCode.value.trim();
    if (!serial)     { toast('Enter the Bambu serial number', 'error'); wifiConnectBtn.disabled = false; wifiConnectBtn.textContent = 'Connect'; return; }
    if (!accessCode) { toast('Enter the Bambu access code', 'error');   wifiConnectBtn.disabled = false; wifiConnectBtn.textContent = 'Connect'; return; }
    res = await window.printer.connectBambu({ ip, serial, accessCode });
  } else {
    res = await window.printer.connectMoonraker({ ip });
  }

  if (res.success) {
    state.mode = wifiType.value;
    setConnected(true);
    const label = state.mode === 'octoprint' ? 'OctoPrint' : state.mode === 'bambu' ? 'Bambu Lab' : 'Moonraker';
    logLine(`Connected via ${label}${res.version ? ' v' + res.version : ''}`, 'info');
    toast('Connected to ' + ip, 'success');
    startWebcam();
  } else {
    wifiConnectBtn.disabled = false;
    wifiConnectBtn.textContent = 'Connect';
    logLine('Connection failed: ' + res.error, 'error');
    toast('Failed: ' + res.error, 'error');
  }
});

wifiDiscBtn.addEventListener('click', async () => {
  await window.printer.disconnectWifi();
  stopWebcam();
  setConnected(false);
  logLine('Disconnected', 'info');
  toast('Disconnected', 'info');
});

// ── USB connect ────────────────────────────────────────────────────────────────
async function refreshPorts() {
  const ports = await window.printer.listPorts();
  portSelect.innerHTML = '<option value="">Select port…</option>';
  for (const p of ports) {
    const opt = document.createElement('option');
    opt.value = p.path;
    opt.textContent = p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path;
    portSelect.appendChild(opt);
  }
}

refreshPortsBtn.addEventListener('click', refreshPorts);

usbConnectBtn.addEventListener('click', async () => {
  const portPath = portSelect.value;
  if (!portPath) { toast('Select a port first', 'error'); return; }
  usbConnectBtn.disabled = true;
  usbConnectBtn.textContent = 'Connecting…';
  logLine(`Connecting to ${portPath} @ ${baudSelect.value} baud…`, 'info');
  const res = await window.printer.connectUsb({ portPath, baudRate: baudSelect.value });
  if (res.success) {
    state.mode = 'usb';
    setConnected(true);
    logLine('Connected via USB', 'info');
    toast('Connected to ' + portPath, 'success');
  } else {
    usbConnectBtn.disabled = false;
    usbConnectBtn.textContent = 'Connect';
    logLine('Failed: ' + res.error, 'error');
    toast('Failed: ' + res.error, 'error');
  }
});

usbDiscBtn.addEventListener('click', async () => {
  await window.printer.disconnectUsb();
  setConnected(false);
  logLine('Disconnected', 'info');
  toast('Disconnected', 'info');
});

function setConnected(connected) {
  state.connected = connected;
  if (!connected) { state.mode = null; state.printing = false; state.paused = false; }

  // WiFi buttons
  const isWifi = state.mode === 'octoprint' || state.mode === 'moonraker' || state.mode === 'bambu';
  wifiConnectBtn.classList.toggle('hidden', connected && isWifi);
  wifiDiscBtn.classList.toggle('hidden',    !connected || state.mode === 'usb');
  wifiConnectBtn.disabled = false;
  wifiConnectBtn.textContent = 'Connect';
  wifiIp.disabled = connected;
  wifiType.disabled = connected;
  wifiApikey.disabled = connected;
  bambuSerial.disabled = connected;
  bambuCode.disabled = connected;

  // USB buttons
  usbConnectBtn.classList.toggle('hidden', connected && state.mode === 'usb');
  usbDiscBtn.classList.toggle('hidden',    !connected || state.mode !== 'usb');
  usbConnectBtn.disabled = false;
  usbConnectBtn.textContent = 'Connect';
  portSelect.disabled = connected;
  baudSelect.disabled = connected;

  startQueueBtn.disabled = !connected || state.printing;
  updateStatusChip();
}

// ── Queue management ───────────────────────────────────────────────────────────
addFilesBtn.addEventListener('click', async () => {
  const result = await window.printer.browseFiles();
  if (!result.canceled && result.filePaths.length > 0) {
    const res = await window.printer.addFilesToQueue(result.filePaths);
    if (res.success) {
      state.queue.push(...res.items);
      renderQueue();
      toast(`Added ${res.items.length} file(s)`, 'success');
    }
  }
});

clearQueueBtn.addEventListener('click', async () => {
  await window.printer.clearQueue();
  state.queue = state.queue.filter(i => i.status === 'printing');
  renderQueue();
});

startQueueBtn.addEventListener('click', async () => {
  if (!state.connected) { toast('Connect to a printer first', 'error'); return; }
  await window.printer.startQueue();
});

async function loadQueue() {
  state.queue = await window.printer.getQueue();
  renderQueue();
}

function renderQueue() {
  const active = state.queue.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  queueCount.textContent = `${active.length} item${active.length !== 1 ? 's' : ''}`;
  emptyState.style.display = state.queue.length === 0 ? 'flex' : 'none';
  document.querySelectorAll('.queue-item').forEach(el => el.remove());

  for (const item of state.queue) {
    const div = document.createElement('div');
    div.className = `queue-item ${item.status === 'printing' ? 'active' : ''} ${item.status === 'done' ? 'done' : ''} ${item.status === 'cancelled' ? 'cancelled' : ''}`;
    div.dataset.id = item.id;

    const statusLabel = { queued: 'Queued', printing: 'Printing…', done: 'Done', cancelled: 'Cancelled', error: 'Error' }[item.status] || item.status;
    const icon = item.status === 'done' ? '✓' : item.status === 'printing' ? '⚙' : '📄';

    div.innerHTML = `
      <div class="item-icon">${icon}</div>
      <div class="item-info">
        <div class="item-name" title="${item.filePath}">${item.name}</div>
        <div class="item-meta">${item.totalLines?.toLocaleString() || '?'} lines · ${formatTime(item.addedAt)}</div>
      </div>
      <div class="item-status status-${item.status}">${statusLabel}</div>
      <div class="item-actions">
        ${item.status === 'queued' ? `
          <button class="btn-icon" onclick="moveItem('${item.id}','up')" title="Up">↑</button>
          <button class="btn-icon" onclick="moveItem('${item.id}','down')" title="Down">↓</button>
          <button class="btn-icon" onclick="removeItem('${item.id}')" title="Remove">✕</button>
        ` : ''}
      </div>`;
    dropZone.appendChild(div);
  }

  startQueueBtn.disabled = !state.connected || state.printing || active.filter(i => i.status === 'queued').length === 0;
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Drag & drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', async e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  const paths = Array.from(e.dataTransfer.files)
    .filter(f => /\.(gcode|g|gc|gco|ngc)$/i.test(f.name)).map(f => f.path);
  if (!paths.length) { toast('Drop .gcode files only', 'error'); return; }
  const res = await window.printer.addFilesToQueue(paths);
  if (res.success) { state.queue.push(...res.items); renderQueue(); toast(`Added ${res.items.length} file(s)`, 'success'); }
});

window.moveItem = async (id, dir) => {
  await window.printer.moveQueueItem({ id, direction: dir });
  const idx = state.queue.findIndex(i => i.id === id);
  if (dir === 'up'   && idx > 0)                    [state.queue[idx-1], state.queue[idx]] = [state.queue[idx], state.queue[idx-1]];
  if (dir === 'down' && idx < state.queue.length-1) [state.queue[idx+1], state.queue[idx]] = [state.queue[idx], state.queue[idx+1]];
  renderQueue();
};

window.removeItem = async (id) => {
  const res = await window.printer.removeFromQueue(id);
  if (res.success) { state.queue = state.queue.filter(i => i.id !== id); renderQueue(); }
};

// ── Print controls ─────────────────────────────────────────────────────────────
pauseBtn.addEventListener('click', async () => {
  if (state.mode === 'usb') await window.printer.pausePrint();
  else await window.printer.wifiPause();
});
resumeBtn.addEventListener('click', async () => {
  if (state.mode === 'usb') await window.printer.resumePrint();
  else await window.printer.wifiResume();
});
cancelBtn.addEventListener('click', async () => {
  if (!confirm('Cancel the current print?')) return;
  if (state.mode === 'usb') await window.printer.cancelPrint();
  else await window.printer.wifiCancel();
});

// ── Eject config ───────────────────────────────────────────────────────────────
editEjectBtn.addEventListener('click', () => ejectModal.classList.remove('hidden'));
ejectCancelBtn.addEventListener('click', () => ejectModal.classList.add('hidden'));
ejectSaveBtn.addEventListener('click', async () => {
  const lines = ejectInput.value.split('\n').map(l => l.trim()).filter(Boolean);
  await window.printer.setEjectGcode(lines);
  ejectModal.classList.add('hidden');
  toast('Eject sequence saved', 'success');
});

// ── Console ────────────────────────────────────────────────────────────────────
function logLine(text, type = 'recv') {
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  const prefix = { sent: '→ ', info: '◉ ', error: '✗ ', eject: '⇥ ' }[type] || '← ';
  div.textContent = prefix + text;
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
  while (consoleOutput.children.length > 500) consoleOutput.removeChild(consoleOutput.firstChild);
}

clearConsoleBtn.addEventListener('click', () => { consoleOutput.innerHTML = ''; });
consoleSend.addEventListener('click', sendConsoleCmd);
consoleInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendConsoleCmd(); });

async function sendConsoleCmd() {
  const cmd = consoleInput.value.trim();
  if (!cmd || !state.connected) { if (!state.connected) toast('Not connected', 'error'); return; }
  logLine(cmd, 'sent');
  if (state.mode === 'usb') await window.printer.sendGcode(cmd);
  else await window.printer.sendGcodeWifi(cmd);
  consoleInput.value = '';
}

window.sendCmd = async (cmd) => {
  if (!state.connected) { toast('Not connected', 'error'); return; }
  for (const line of cmd.split('\n')) {
    logLine(line, 'sent');
    if (state.mode === 'usb') await window.printer.sendGcode(line);
    else await window.printer.sendGcodeWifi(line);
  }
};

// ── Printer events ─────────────────────────────────────────────────────────────
window.printer.onResponse(line => {
  if (!line.startsWith('ok') && !line.startsWith('wait')) logLine(line, 'recv');
});


window.printer.onTemperature(({ extruder, bed }) => {
  if (extruder) {
    tempHotend.textContent = extruder.actual.toFixed(1) + '°';
    tempHotend.className = 'value' + (extruder.actual > 60 ? ' hot' : extruder.actual > 35 ? ' warm' : '');
    tempHotendTgt.textContent = extruder.target > 0 ? `→ ${extruder.target}°` : '';
  }
  if (bed) {
    tempBed.textContent = bed.actual.toFixed(1) + '°';
    tempBed.className = 'value' + (bed.actual > 50 ? ' hot' : bed.actual > 30 ? ' warm' : '');
    tempBedTgt.textContent = bed.target > 0 ? `→ ${bed.target}°` : '';
  }
});

window.printer.onPrintStarted(item => {
  state.printing = true; state.paused = false; state.currentItem = item;
  const q = state.queue.find(i => i.id === item.id);
  if (q) q.status = 'printing';
  renderQueue();
  currentFileEl.classList.remove('idle');
  currentFileEl.textContent = item.name;
  progressFill.className = '';
  pauseBtn.disabled = false; cancelBtn.disabled = false; startQueueBtn.disabled = true;
  updateStatusChip();
  logLine(`Printing: ${item.name}`, 'info');
  toast(`Printing: ${item.name}`, 'info');
});

window.printer.onPrintProgress(({ progress, currentLine, totalLines, gcode }) => {
  progressFill.style.width = progress + '%';
  progressPct.textContent = progress + '%';
  if (gcode) gcodeLineEl.textContent = `Line ${currentLine}/${totalLines} — ${gcode}`;
  else gcodeLineEl.textContent = `${progress}% complete`;
});

window.printer.onPrintComplete(item => {
  const q = state.queue.find(i => i.id === item.id);
  if (q) q.status = 'done';
  logLine(`Done: ${item.name}`, 'info');
  toast(`Print done: ${item.name} ✓`, 'success');
  renderQueue();
  progressFill.style.width = '100%';
  progressPct.textContent = '100%';
});

window.printer.onEjecting(() => {
  state.ejecting = true; progressFill.className = 'ejecting';
  gcodeLineEl.textContent = 'Ejecting — presenting bed…';
  logLine('Auto-eject running…', 'eject'); updateStatusChip();
});

window.printer.onEjectComplete(() => {
  state.ejecting = false; progressFill.className = '';
  logLine('Eject complete', 'eject'); updateStatusChip();
});

window.printer.onPrintPaused(() => {
  state.paused = true;
  pauseBtn.classList.add('hidden'); resumeBtn.classList.remove('hidden'); resumeBtn.disabled = false;
  logLine('Paused', 'info'); toast('Print paused', 'info'); updateStatusChip();
});

window.printer.onPrintResumed(() => {
  state.paused = false;
  resumeBtn.classList.add('hidden'); pauseBtn.classList.remove('hidden');
  logLine('Resumed', 'info'); updateStatusChip();
});

window.printer.onPrintCancelled(item => {
  state.printing = false; state.paused = false; state.currentItem = null;
  const q = state.queue.find(i => i.id === item.id);
  if (q) q.status = 'cancelled';
  renderQueue(); resetProgress();
  logLine('Cancelled', 'error'); toast('Print cancelled', 'error');
});

window.printer.onQueueComplete(() => {
  state.printing = false; state.currentItem = null;
  renderQueue(); resetProgress();
  logLine('All prints complete!', 'info');
  toast('Queue complete — all done!', 'success');
  updateStatusChip();
});

window.printer.onError(msg  => { logLine('ERROR: ' + msg, 'error'); toast(msg, 'error'); });
window.printer.onQueueError(msg => { state.printing = false; resetProgress(); logLine('Queue error: ' + msg, 'error'); toast(msg, 'error'); });

// ── UI helpers ─────────────────────────────────────────────────────────────────
function resetProgress() {
  currentFileEl.textContent = 'No active print'; currentFileEl.classList.add('idle');
  progressFill.style.width = '0%'; progressFill.className = '';
  progressPct.textContent = '—'; gcodeLineEl.textContent = 'Waiting…';
  pauseBtn.disabled = true; resumeBtn.classList.add('hidden'); pauseBtn.classList.remove('hidden');
  cancelBtn.disabled = true; startQueueBtn.disabled = !state.connected;
  updateStatusChip();
}

function updateStatusChip() {
  statusChip.className = 'status-chip';
  if (!state.connected)       { statusText.textContent = 'Disconnected'; return; }
  if (state.ejecting)         { statusChip.classList.add('ejecting');  statusText.textContent = 'Ejecting'; return; }
  if (state.printing && state.paused) { statusChip.classList.add('connected'); statusText.textContent = 'Paused'; return; }
  if (state.printing)         { statusChip.classList.add('printing');  statusText.textContent = 'Printing'; return; }
  const label = state.mode === 'octoprint' ? 'OctoPrint' : state.mode === 'moonraker' ? 'Moonraker' : state.mode === 'bambu' ? 'Bambu Lab' : 'USB';
  statusChip.classList.add('connected');
  statusText.textContent = `Ready · ${label}`;
}

// ── Toasts ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

// ── Webcam ─────────────────────────────────────────────────────────────────────
async function startWebcam() {
  const url = await window.printer.getWebcamUrl();
  if (!url) { webcamPanel.classList.add('hidden'); return; }
  webcamPanel.classList.remove('hidden');
  webcamImg.src = url;
  webcamImg.classList.add('visible');
  webcamPlaceholder.style.display = 'none';
  webcamImg.onerror = () => {
    webcamImg.classList.remove('visible');
    webcamPlaceholder.style.display = 'flex';
    webcamPlaceholder.textContent = 'Camera unavailable';
  };
}

function stopWebcam() {
  webcamImg.src = '';
  webcamImg.classList.remove('visible');
  webcamPlaceholder.style.display = 'flex';
  webcamPlaceholder.textContent = 'No camera connected';
  webcamPanel.classList.add('hidden');
}

webcamToggleBtn.addEventListener('click', () => {
  webcamCollapsed = !webcamCollapsed;
  $('webcam-viewport').style.display = webcamCollapsed ? 'none' : '';
  webcamToggleBtn.textContent = webcamCollapsed ? '▸' : '▾';
});

// ── Auto-updater ───────────────────────────────────────────────────────────────
window.printer.onUpdateAvailable(info => {
  updateMsg.textContent = `Printara ${info.version} is available — downloading…`;
  updateBanner.classList.remove('hidden');
  updateInstallBtn.disabled = true;
});

window.printer.onUpdateDownloaded(info => {
  updateMsg.textContent = `Printara ${info.version} downloaded — restart to install.`;
  updateInstallBtn.disabled = false;
});

window.printer.onUpdateProgress(p => {
  updateMsg.textContent = `Downloading update… ${Math.round(p.percent)}%`;
});

updateInstallBtn.addEventListener('click', () => window.printer.installUpdate());
updateDismissBtn.addEventListener('click', () => updateBanner.classList.add('hidden'));

// ── Auto-reconnect ─────────────────────────────────────────────────────────────
window.printer.onReconnected(info => {
  reconnectBadge.classList.add('hidden');
  logLine(`Reconnected to ${info.ip || 'printer'}`, 'info');
  toast('Reconnected to printer', 'success');
  state.connected = true;
  updateStatusChip();
  startWebcam();
});

window.printer.onDisconnected(() => {
  stopWebcam();
  if (state.printing) {
    reconnectBadge.classList.remove('hidden');
  } else {
    setConnected(false);
  }
  logLine('Printer disconnected', 'error');
  toast('Printer disconnected', 'error');
  resetProgress();
});

// ── Print history ──────────────────────────────────────────────────────────────
historyBtn.addEventListener('click', async () => {
  const history = await window.printer.getHistory();
  renderHistory(history);
  historyModal.classList.remove('hidden');
});

historyCloseBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
historyClearBtn.addEventListener('click', async () => {
  if (!confirm('Clear all print history?')) return;
  await window.printer.clearHistory();
  renderHistory([]);
  toast('History cleared', 'info');
});

function renderHistory(items) {
  if (!items.length) {
    historyList.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:24px">No print history yet.</p>';
    return;
  }
  historyList.innerHTML = items.slice().reverse().map(h => {
    const started  = new Date(h.startedAt).toLocaleString();
    const duration = h.durationMs ? formatDuration(h.durationMs) : '—';
    const icon = h.status === 'done' ? '✓' : h.status === 'cancelled' ? '✕' : '⚠';
    const cls  = h.status === 'done' ? 'done' : h.status === 'cancelled' ? 'cancelled' : 'error';
    return `<div class="queue-item ${cls}" style="margin-bottom:6px">
      <div class="item-icon">${icon}</div>
      <div class="item-info">
        <div class="item-name">${h.name}</div>
        <div class="item-meta">${started} · ${duration} · ${h.mode || '?'}</div>
      </div>
      <div class="item-status status-${h.status}">${h.status}</div>
    </div>`;
  }).join('');
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); addFilesBtn.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { if (!startQueueBtn.disabled) startQueueBtn.click(); }
  if (e.key === 'Escape') { ejectModal.classList.add('hidden'); historyModal.classList.add('hidden'); }
});
