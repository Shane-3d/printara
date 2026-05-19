'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  connected: false,
  printing: false,
  paused: false,
  ejecting: false,
  queue: [],
  currentItem: null,
};

// ── DOM refs ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const portSelect      = $('port-select');
const baudSelect      = $('baud-select');
const connectBtn      = $('connect-btn');
const disconnectBtn   = $('disconnect-btn');
const statusChip      = $('status-chip');
const statusText      = $('status-text');
const refreshPortsBtn = $('refresh-ports');
const addFilesBtn     = $('add-files-btn');
const clearQueueBtn   = $('clear-queue-btn');
const startQueueBtn   = $('start-queue-btn');
const dropZone        = $('drop-zone');
const emptyState      = $('empty-state');
const queueCount      = $('queue-count');
const consoleOutput   = $('console-output');
const consoleInput    = $('console-input');
const consoleSend     = $('console-send');
const clearConsoleBtn = $('clear-console-btn');
const currentFileEl   = $('current-file');
const progressFill    = $('progress-fill');
const progressPct     = $('progress-pct');
const gcodeLineEl     = $('gcode-line');
const pauseBtn        = $('pause-btn');
const resumeBtn       = $('resume-btn');
const cancelBtn       = $('cancel-btn');
const tempHotend      = $('temp-hotend');
const tempHotendTgt   = $('temp-hotend-target');
const tempBed         = $('temp-bed');
const tempBedTgt      = $('temp-bed-target');
const editEjectBtn    = $('edit-eject-btn');
const ejectModal      = $('eject-modal');
const ejectInput      = $('eject-gcode-input');
const ejectSaveBtn    = $('eject-save-btn');
const ejectCancelBtn  = $('eject-cancel-btn');

// ── Init ───────────────────────────────────────────────────────────────────────
(async () => {
  await refreshPorts();
  await loadQueue();
  const lines = await window.printer.getEjectGcode();
  ejectInput.value = lines.join('\n');
})();

// ── Port management ────────────────────────────────────────────────────────────
async function refreshPorts() {
  const ports = await window.printer.listPorts();
  portSelect.innerHTML = '<option value="">Select port…</option>';
  if (ports.length === 0) {
    portSelect.innerHTML += '<option disabled>No ports found</option>';
  }
  for (const p of ports) {
    const opt = document.createElement('option');
    opt.value = p.path;
    opt.textContent = p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path;
    portSelect.appendChild(opt);
  }
}

refreshPortsBtn.addEventListener('click', refreshPorts);

connectBtn.addEventListener('click', async () => {
  const portPath = portSelect.value;
  if (!portPath) { toast('Select a port first', 'error'); return; }
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting…';
  logLine('Connecting to ' + portPath + ' @ ' + baudSelect.value + ' baud…', 'info');
  const res = await window.printer.connect({ portPath, baudRate: baudSelect.value });
  if (res.success) {
    setConnected(true);
    logLine('Connected!', 'info');
    toast('Connected to ' + portPath, 'success');
  } else {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
    logLine('Connection failed: ' + res.error, 'error');
    toast('Connection failed: ' + res.error, 'error');
  }
});

disconnectBtn.addEventListener('click', async () => {
  await window.printer.disconnect();
  setConnected(false);
  logLine('Disconnected', 'info');
  toast('Disconnected', 'info');
});

function setConnected(connected) {
  state.connected = connected;
  connectBtn.classList.toggle('hidden', connected);
  disconnectBtn.classList.toggle('hidden', !connected);
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect';
  portSelect.disabled = connected;
  baudSelect.disabled = connected;
  refreshPortsBtn.disabled = connected;
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
      toast(`Added ${res.items.length} file(s) to queue`, 'success');
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
  const queued = state.queue.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const total = state.queue.length;

  queueCount.textContent = `${queued.length} item${queued.length !== 1 ? 's' : ''}`;
  emptyState.style.display = total === 0 ? 'flex' : 'none';

  // Remove old cards
  document.querySelectorAll('.queue-item').forEach(el => el.remove());

  for (const item of state.queue) {
    const div = document.createElement('div');
    div.className = `queue-item ${item.status === 'printing' ? 'active' : ''} ${item.status === 'done' ? 'done' : ''} ${item.status === 'cancelled' ? 'cancelled' : ''}`;
    div.dataset.id = item.id;

    const statusLabel = item.status === 'queued' ? 'Queued'
      : item.status === 'printing' ? 'Printing…'
      : item.status === 'done'     ? 'Done'
      : item.status === 'cancelled'? 'Cancelled'
      : item.status === 'error'    ? 'Error'
      : item.status;

    div.innerHTML = `
      <div class="item-icon">${item.status === 'done' ? '✓' : item.status === 'printing' ? '⚙' : '📄'}</div>
      <div class="item-info">
        <div class="item-name" title="${item.filePath}">${item.name}</div>
        <div class="item-meta">${item.totalLines?.toLocaleString() || '?'} lines · ${formatTime(item.addedAt)}</div>
      </div>
      <div class="item-status status-${item.status}">${statusLabel}</div>
      <div class="item-actions">
        ${item.status === 'queued' ? `
          <button class="btn-icon" onclick="moveItem('${item.id}','up')" title="Move up">↑</button>
          <button class="btn-icon" onclick="moveItem('${item.id}','down')" title="Move down">↓</button>
          <button class="btn-icon" onclick="removeItem('${item.id}')" title="Remove">✕</button>
        ` : ''}
      </div>
    `;
    dropZone.appendChild(div);
  }

  startQueueBtn.disabled = !state.connected || state.printing || state.queue.filter(i => i.status === 'queued').length === 0;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Drag-and-drop onto queue
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', async e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const paths = Array.from(e.dataTransfer.files)
    .filter(f => /\.(gcode|g|gc|gco|ngc)$/i.test(f.name))
    .map(f => f.path);
  if (paths.length === 0) { toast('Drop .gcode files only', 'error'); return; }
  const res = await window.printer.addFilesToQueue(paths);
  if (res.success) {
    state.queue.push(...res.items);
    renderQueue();
    toast(`Added ${res.items.length} file(s)`, 'success');
  }
});

window.moveItem = async (id, direction) => {
  await window.printer.moveQueueItem({ id, direction });
  const idx = state.queue.findIndex(i => i.id === id);
  if (direction === 'up' && idx > 0) {
    [state.queue[idx - 1], state.queue[idx]] = [state.queue[idx], state.queue[idx - 1]];
  } else if (direction === 'down' && idx < state.queue.length - 1) {
    [state.queue[idx + 1], state.queue[idx]] = [state.queue[idx], state.queue[idx + 1]];
  }
  renderQueue();
};

window.removeItem = async (id) => {
  const res = await window.printer.removeFromQueue(id);
  if (res.success) {
    state.queue = state.queue.filter(i => i.id !== id);
    renderQueue();
  }
};

// ── Print controls ─────────────────────────────────────────────────────────────
pauseBtn.addEventListener('click', async () => {
  await window.printer.pausePrint();
});

resumeBtn.addEventListener('click', async () => {
  await window.printer.resumePrint();
});

cancelBtn.addEventListener('click', async () => {
  if (!confirm('Cancel the current print?')) return;
  await window.printer.cancelPrint();
});

// ── Eject config modal ─────────────────────────────────────────────────────────
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
  const prefix = type === 'sent' ? '→ ' : type === 'info' ? '◉ ' : type === 'error' ? '✗ ' : type === 'eject' ? '⇥ ' : '← ';
  div.textContent = prefix + text;
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;

  // Cap console at 500 lines
  while (consoleOutput.children.length > 500) {
    consoleOutput.removeChild(consoleOutput.firstChild);
  }
}

clearConsoleBtn.addEventListener('click', () => { consoleOutput.innerHTML = ''; });

consoleSend.addEventListener('click', sendConsoleCmd);
consoleInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendConsoleCmd(); });

async function sendConsoleCmd() {
  const cmd = consoleInput.value.trim();
  if (!cmd) return;
  if (!state.connected) { toast('Not connected', 'error'); return; }
  logLine(cmd, 'sent');
  await window.printer.sendGcode(cmd);
  consoleInput.value = '';
}

window.sendCmd = async (cmd) => {
  if (!state.connected) { toast('Not connected', 'error'); return; }
  for (const line of cmd.split('\n')) {
    logLine(line, 'sent');
    await window.printer.sendGcode(line);
  }
};

// ── Printer event handlers ─────────────────────────────────────────────────────
window.printer.onResponse(line => {
  if (!line.startsWith('ok') && !line.startsWith('wait')) {
    logLine(line, 'recv');
  }
});

window.printer.onDisconnected(() => {
  setConnected(false);
  logLine('Printer disconnected', 'error');
  toast('Printer disconnected', 'error');
  resetProgress();
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
  state.printing = true;
  state.paused = false;
  state.currentItem = item;

  const queueItem = state.queue.find(i => i.id === item.id);
  if (queueItem) queueItem.status = 'printing';
  renderQueue();

  currentFileEl.classList.remove('idle');
  currentFileEl.textContent = item.name;
  progressFill.className = '';
  pauseBtn.disabled = false;
  cancelBtn.disabled = false;
  startQueueBtn.disabled = true;
  updateStatusChip();
  logLine(`Started: ${item.name}`, 'info');
  toast(`Printing: ${item.name}`, 'info');
});

window.printer.onPrintProgress(({ progress, currentLine, totalLines, gcode, item }) => {
  progressFill.style.width = progress + '%';
  progressPct.textContent = progress + '%';
  gcodeLineEl.textContent = `Line ${currentLine}/${totalLines} — ${gcode}`;
});

window.printer.onPrintComplete(item => {
  const queueItem = state.queue.find(i => i.id === item.id);
  if (queueItem) queueItem.status = 'done';
  logLine(`Completed: ${item.name}`, 'info');
  toast(`Print done: ${item.name} ✓`, 'success');
  renderQueue();
  progressFill.style.width = '100%';
  progressPct.textContent = '100%';
});

window.printer.onEjecting(() => {
  state.ejecting = true;
  progressFill.className = 'ejecting';
  gcodeLineEl.textContent = 'Ejecting — removing print from bed…';
  logLine('Running auto-eject sequence…', 'eject');
  updateStatusChip();
});

window.printer.onEjectComplete(() => {
  state.ejecting = false;
  progressFill.className = '';
  logLine('Eject complete', 'eject');
  updateStatusChip();
});

window.printer.onPrintPaused(() => {
  state.paused = true;
  pauseBtn.classList.add('hidden');
  resumeBtn.classList.remove('hidden');
  resumeBtn.disabled = false;
  logLine('Print paused', 'info');
  toast('Print paused', 'info');
  updateStatusChip();
});

window.printer.onPrintResumed(() => {
  state.paused = false;
  resumeBtn.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
  logLine('Print resumed', 'info');
  updateStatusChip();
});

window.printer.onPrintCancelled(item => {
  state.printing = false;
  state.paused = false;
  state.currentItem = null;
  const queueItem = state.queue.find(i => i.id === item.id);
  if (queueItem) queueItem.status = 'cancelled';
  renderQueue();
  resetProgress();
  logLine('Print cancelled', 'error');
  toast('Print cancelled', 'error');
});

window.printer.onQueueComplete(() => {
  state.printing = false;
  state.currentItem = null;
  renderQueue();
  resetProgress();
  logLine('All prints complete!', 'info');
  toast('Queue complete — all prints done!', 'success');
  updateStatusChip();
});

window.printer.onError(msg => {
  logLine('ERROR: ' + msg, 'error');
  toast('Printer error: ' + msg, 'error');
});

window.printer.onQueueError(msg => {
  state.printing = false;
  resetProgress();
  logLine('Queue error: ' + msg, 'error');
  toast(msg, 'error');
});

// ── UI helpers ─────────────────────────────────────────────────────────────────
function resetProgress() {
  currentFileEl.textContent = 'No active print';
  currentFileEl.classList.add('idle');
  progressFill.style.width = '0%';
  progressFill.className = '';
  progressPct.textContent = '—';
  gcodeLineEl.textContent = 'Waiting…';
  pauseBtn.disabled = true;
  resumeBtn.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
  cancelBtn.disabled = true;
  startQueueBtn.disabled = !state.connected;
  updateStatusChip();
}

function updateStatusChip() {
  statusChip.className = 'status-chip';
  if (!state.connected) {
    statusText.textContent = 'Disconnected';
  } else if (state.ejecting) {
    statusChip.classList.add('ejecting');
    statusText.textContent = 'Ejecting';
  } else if (state.printing && state.paused) {
    statusChip.classList.add('connected');
    statusText.textContent = 'Paused';
  } else if (state.printing) {
    statusChip.classList.add('printing');
    statusText.textContent = 'Printing';
  } else {
    statusChip.classList.add('connected');
    statusText.textContent = 'Ready';
  }
}

// ── Toast notifications ────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); addFilesBtn.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { if (!startQueueBtn.disabled) startQueueBtn.click(); }
  if (e.key === 'Escape') { ejectModal.classList.add('hidden'); }
});
