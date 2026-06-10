'use strict';

const { app, BrowserWindow, shell, ipcMain, dialog, Notification } = require('electron');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const http   = require('http');
const https  = require('https');
const { SerialPort }       = require('serialport');
const { ReadlineParser }   = require('@serialport/parser-readline');
const mqtt = require('mqtt');
const ftp  = require('basic-ftp');
const { autoUpdater }      = require('electron-updater');

// ── Globals ─────────────────────────────────────────────────────────────────────
let mainWindow  = null;
let activePort  = null;

// Pending 'ok' resolvers for synchronous USB G-code streaming
const okWaiters = [];

// WiFi session
const wifi = { mode: null, ip: null, apiKey: null, serial: null, accessCode: null };

// Bambu Lab MQTT session (separate from the multi-printer mqttClients map)
let bambuClient    = null;
let bambuDoneResolve = null;
let bambuDoneReject  = null;

// Print queue
let queue          = [];
let queueRunning   = false;
let currentItem    = null;
let cancelFlag     = false;
let pauseFlag      = false;
let resumeResolve  = null;

// Default eject G-code
let ejectLines = ['G91', 'G1 Z10 F300', 'G90', 'G28 X Y', 'M84'];

// Print history (persisted to userData/history.json)
let printHistory = [];

// Auto-reconnect timer
let reconnectTimer = null;
const RECONNECT_INTERVAL = 5000;

// ── Helpers ──────────────────────────────────────────────────────────────────────
function emit(ch, data) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(ch, data);
  // Drive taskbar progress bar automatically
  if (ch === 'printer:printProgress' && data && data.progress > 0) {
    mainWindow.setProgressBar(data.progress / 100);
  }
}

function ejectFilePath()   { return path.join(app.getPath('userData'), 'eject.json'); }
function historyFilePath() { return path.join(app.getPath('userData'), 'history.json'); }

// ── Print history ────────────────────────────────────────────────────────────────
function loadHistory() {
  try {
    const p = historyFilePath();
    if (fs.existsSync(p)) printHistory = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
}

function saveHistoryEntry(item, status, durationMs) {
  const entry = {
    id:       item.id,
    name:     item.name,
    filePath: item.filePath,
    printer:  wifi.mode,
    status,
    durationMs,
    finishedAt: new Date().toISOString(),
    filamentMm: item.filamentMm || null,
  };
  printHistory.unshift(entry);
  if (printHistory.length > 200) printHistory.length = 200;
  try { fs.writeFileSync(historyFilePath(), JSON.stringify(printHistory, null, 2)); } catch (_) {}
  emit('printer:historyUpdated', printHistory);
}

// ── OS notifications ──────────────────────────────────────────────────────────────
function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: path.join(__dirname, 'logo.ico') }).show();
}

// ── Auto-reconnect ────────────────────────────────────────────────────────────────
function startReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    if (!wifi.ip || wifi.mode === 'usb') { stopReconnect(); return; }
    try {
      let ok = false;
      if (wifi.mode === 'octoprint' || (!wifi.mode && wifi.apiKey)) {
        const r = await httpReq({ hostname: wifi.ip, port: 80, path: '/api/version', method: 'GET', headers: { 'X-Api-Key': wifi.apiKey } });
        ok = r.status === 200;
        if (ok) wifi.mode = 'octoprint';
      } else if (wifi.mode === 'moonraker' || !wifi.mode) {
        const r = await httpReq({ hostname: wifi.ip, port: 80, path: '/printer/info', method: 'GET', headers: {} });
        ok = r.status === 200;
        if (ok) wifi.mode = 'moonraker';
      }
      if (ok) {
        stopReconnect();
        emit('printer:reconnected', { mode: wifi.mode });
        notify('Printara', 'Reconnected to printer');
      }
    } catch (_) {}
  }, RECONNECT_INTERVAL);
}

function stopReconnect() {
  if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
}

// ── IPC: History ──────────────────────────────────────────────────────────────────
ipcMain.handle('printer:getHistory',   () => printHistory);
ipcMain.handle('printer:clearHistory', () => {
  printHistory = [];
  try { fs.writeFileSync(historyFilePath(), '[]'); } catch (_) {}
});

// ── IPC: Updater ──────────────────────────────────────────────────────────────────
ipcMain.handle('updater:check',   () => autoUpdater.checkForUpdates());
ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall());

// ── HTTP request helper ──────────────────────────────────────────────────────────
function httpReq(options, body) {
  return new Promise((resolve, reject) => {
    const mod = options.port === 443 ? https : http;
    const req = mod.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({
          status: res.statusCode,
          text,
          json() { try { return JSON.parse(text); } catch (_) { return {}; } },
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Build a minimal multipart/form-data body for file upload
function buildMultipart(filePath) {
  const filename = path.basename(filePath);
  const data     = fs.readFileSync(filePath);
  const boundary = 'PrintaraBoundary' + Date.now().toString(16);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, data, tail]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}`, filename };
}

// ── OctoPrint API wrappers ───────────────────────────────────────────────────────
function octoGet(endpoint) {
  return httpReq({ hostname: wifi.ip, port: 80, path: `/api/${endpoint}`, method: 'GET', headers: { 'X-Api-Key': wifi.apiKey } });
}

function octoPost(endpoint, json) {
  const body = JSON.stringify(json);
  return httpReq({
    hostname: wifi.ip, port: 80, path: `/api/${endpoint}`, method: 'POST',
    headers: { 'X-Api-Key': wifi.apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body);
}

function octoUpload(filePath) {
  const { body, contentType } = buildMultipart(filePath);
  return httpReq({
    hostname: wifi.ip, port: 80, path: '/api/files/local', method: 'POST',
    headers: { 'X-Api-Key': wifi.apiKey, 'Content-Type': contentType, 'Content-Length': body.length },
  }, body);
}

// ── Moonraker API wrappers ───────────────────────────────────────────────────────
function moonGet(endpoint) {
  return httpReq({ hostname: wifi.ip, port: 80, path: `/${endpoint}`, method: 'GET', headers: {} });
}

function moonPost(endpoint, json) {
  const body = json ? JSON.stringify(json) : '';
  return httpReq({
    hostname: wifi.ip, port: 80, path: `/${endpoint}`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body || undefined);
}

function moonUpload(filePath) {
  const { body, contentType } = buildMultipart(filePath);
  return httpReq({
    hostname: wifi.ip, port: 80, path: '/server/files/upload', method: 'POST',
    headers: { 'Content-Type': contentType, 'Content-Length': body.length },
  }, body);
}

// ── Temperature line parser ──────────────────────────────────────────────────────
function parseTemp(line) {
  const e = line.match(/T(?:0)?:([\d.]+)\s*\/([\d.]+)/);
  const b = line.match(/B:([\d.]+)\s*\/([\d.]+)/);
  if (!e && !b) return null;
  return {
    extruder: e ? { actual: parseFloat(e[1]), target: parseFloat(e[2]) } : null,
    bed:      b ? { actual: parseFloat(b[1]), target: parseFloat(b[2]) } : null,
  };
}

// ── IPC: Serial ports ────────────────────────────────────────────────────────────
ipcMain.handle('printer:listPorts', async () => {
  const ports = await SerialPort.list();
  return ports.sort((a, b) => a.path.localeCompare(b.path));
});

// ── IPC: USB connect / disconnect ────────────────────────────────────────────────
ipcMain.handle('printer:connectUsb', async (_ev, { portPath, baudRate }) => {
  try {
    if (activePort && activePort.isOpen) {
      await new Promise(r => activePort.close(r));
      activePort = null;
    }
    activePort = new SerialPort({ path: portPath, baudRate: parseInt(baudRate) || 115200, autoOpen: false });
    const parser = activePort.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', line => {
      const t = line.trim();
      // Unblock the next serialSend() waiting for 'ok'
      if (t.startsWith('ok') || t === 'wait') {
        const resolve = okWaiters.shift();
        if (resolve) resolve();
      }
      const temp = parseTemp(t);
      if (temp) emit('printer:temperature', temp);
      emit('printer:response', t);
    });

    activePort.on('error', err => emit('printer:error', err.message));
    activePort.on('close', () => {
      wifi.mode = null;
      emit('printer:disconnected');
      if (queueRunning) notify('Printer disconnected', 'USB connection lost during print');
    });

    await new Promise((res, rej) => activePort.open(err => err ? rej(err) : res()));
    wifi.mode = 'usb';
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('printer:disconnectUsb', async () => {
  if (activePort && activePort.isOpen) await new Promise(r => activePort.close(r));
  activePort = null;
  wifi.mode = null;
});

// ── IPC: WiFi connect / disconnect ───────────────────────────────────────────────
ipcMain.handle('printer:connectOctoPrint', async (_ev, { ip, apiKey }) => {
  wifi.ip = ip; wifi.apiKey = apiKey;
  try {
    const res = await httpReq({
      hostname: ip, port: 80, path: '/api/version', method: 'GET',
      headers: { 'X-Api-Key': apiKey },
    });
    if (res.status !== 200) { wifi.ip = null; wifi.apiKey = null; return { success: false, error: `HTTP ${res.status}` }; }
    wifi.mode = 'octoprint';
    return { success: true, version: res.json().server };
  } catch (err) {
    wifi.ip = null; wifi.apiKey = null;
    return { success: false, error: err.message };
  }
});

ipcMain.handle('printer:connectMoonraker', async (_ev, { ip }) => {
  wifi.ip = ip;
  try {
    const res = await httpReq({ hostname: ip, port: 80, path: '/printer/info', method: 'GET', headers: {} });
    if (res.status !== 200) { wifi.ip = null; return { success: false, error: `HTTP ${res.status}` }; }
    wifi.mode = 'moonraker';
    const ver = (res.json().result || {}).software_version;
    return { success: true, version: ver };
  } catch (err) {
    wifi.ip = null;
    return { success: false, error: err.message };
  }
});

ipcMain.handle('printer:connectBambu', async (_ev, { ip, serial, accessCode }) => {
  wifi.ip = ip; wifi.serial = serial; wifi.accessCode = accessCode;
  try {
    await new Promise((resolve, reject) => {
      if (bambuClient) { try { bambuClient.end(true); } catch (_) {} bambuClient = null; }
      bambuClient = mqtt.connect(`mqtts://${ip}:8883`, {
        clientId: 'printara_' + Math.random().toString(36).slice(2, 10),
        username: 'bblp', password: accessCode,
        rejectUnauthorized: false,
        connectTimeout: 8000, reconnectPeriod: 0, clean: true,
      });
      let settled = false;
      bambuClient.on('connect', () => {
        bambuClient.subscribe(`device/${serial}/report`, err => {
          if (!settled) { settled = true; err ? reject(err) : resolve(); }
        });
      });
      bambuClient.on('message', (_topic, payload) => handleBambuMessage(payload.toString()));
      bambuClient.on('error', err => {
        if (!settled) { settled = true; reject(err); }
        else emit('printer:error', err.message);
      });
      bambuClient.on('close', () => {
        if (!settled) { settled = true; reject(new Error('Connection closed')); }
        else { emit('printer:disconnected'); startReconnect(); }
      });
      setTimeout(() => {
        if (!settled) { settled = true; bambuClient.end(true); reject(new Error('Timed out')); }
      }, 9000);
    });
    wifi.mode = 'bambu';
    return { success: true };
  } catch (err) {
    wifi.ip = null; wifi.serial = null; wifi.accessCode = null;
    return { success: false, error: err.message };
  }
});

ipcMain.handle('printer:disconnectWifi', () => {
  stopReconnect();
  if (bambuClient) { try { bambuClient.end(true); } catch (_) {} bambuClient = null; }
  wifi.mode = null; wifi.ip = null; wifi.apiKey = null; wifi.serial = null; wifi.accessCode = null;
});

// ── IPC: File picker & queue management ─────────────────────────────────────────
ipcMain.handle('printer:browseFiles', async () => {
  return dialog.showOpenDialog(mainWindow, {
    title: 'Add G-code Files',
    filters: [{ name: 'G-code', extensions: ['gcode', 'g', 'gc', 'gco', 'ngc'] }],
    properties: ['openFile', 'multiSelections'],
  });
});

ipcMain.handle('printer:addFilesToQueue', (_ev, filePaths) => {
  const items = filePaths.map(fp => {
    let totalLines = 0;
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      totalLines = raw.split('\n').filter(l => l.split(';')[0].trim()).length;
    } catch (_) {}
    const item = {
      id:         Date.now().toString(36) + Math.random().toString(36).slice(2),
      name:       path.basename(fp),
      filePath:   fp,
      status:     'queued',
      totalLines,
      addedAt:    new Date().toISOString(),
    };
    queue.push(item);
    return item;
  });
  return { success: true, items };
});

ipcMain.handle('printer:getQueue',        ()                     => queue);
ipcMain.handle('printer:clearQueue',      ()                     => { queue = queue.filter(i => i.status === 'printing'); });
ipcMain.handle('printer:removeFromQueue', (_ev, id)              => { queue = queue.filter(i => i.id !== id); return { success: true }; });
ipcMain.handle('printer:moveQueueItem',   (_ev, { id, direction }) => {
  const idx = queue.findIndex(i => i.id === id);
  if (idx < 0) return;
  if (direction === 'up'   && idx > 0)                [queue[idx-1], queue[idx]] = [queue[idx], queue[idx-1]];
  if (direction === 'down' && idx < queue.length - 1) [queue[idx+1], queue[idx]] = [queue[idx], queue[idx+1]];
});

// ── IPC: Start queue ─────────────────────────────────────────────────────────────
ipcMain.handle('printer:startQueue', () => { runQueue(); });

// ── IPC: Print controls ──────────────────────────────────────────────────────────
ipcMain.handle('printer:pausePrint', () => {
  pauseFlag = true;
  emit('printer:printPaused');
});

ipcMain.handle('printer:resumePrint', () => {
  pauseFlag = false;
  if (resumeResolve) { resumeResolve(); resumeResolve = null; }
  emit('printer:printResumed');
});

ipcMain.handle('printer:cancelPrint', () => {
  cancelFlag = true;
  pauseFlag  = false;
  if (resumeResolve) { resumeResolve(); resumeResolve = null; }
  // Unblock any waiting serialSend
  const w = okWaiters.shift();
  if (w) w();
});

ipcMain.handle('printer:wifiPause', async () => {
  try {
    if (wifi.mode === 'octoprint')    await octoPost('job', { command: 'pause', action: 'pause' });
    else if (wifi.mode === 'bambu')   await bambuPublish({ command: 'pause' });
    else                              await moonPost('printer/print/pause');
    emit('printer:printPaused');
  } catch (err) { emit('printer:error', err.message); }
});

ipcMain.handle('printer:wifiResume', async () => {
  try {
    if (wifi.mode === 'octoprint')    await octoPost('job', { command: 'pause', action: 'resume' });
    else if (wifi.mode === 'bambu')   await bambuPublish({ command: 'resume' });
    else                              await moonPost('printer/print/resume');
    emit('printer:printResumed');
  } catch (err) { emit('printer:error', err.message); }
});

ipcMain.handle('printer:wifiCancel', async () => {
  cancelFlag = true;
  try {
    if (wifi.mode === 'octoprint')    await octoPost('job', { command: 'cancel' });
    else if (wifi.mode === 'bambu')   await bambuPublish({ command: 'stop' });
    else                              await moonPost('printer/print/cancel');
  } catch (err) { emit('printer:error', err.message); }
});

// ── Bambu Lab print helpers ──────────────────────────────────────────────────────
function bambuPublish(printPayload) {
  return new Promise((res, rej) => {
    if (!bambuClient) { rej(new Error('Bambu not connected')); return; }
    const msg = JSON.stringify({ print: { sequence_id: Date.now().toString(), ...printPayload } });
    bambuClient.publish(`device/${wifi.serial}/request`, msg, err => err ? rej(err) : res());
  });
}

function handleBambuMessage(raw) {
  try {
    const msg   = JSON.parse(raw);
    const print = msg.print;
    if (!print) return;

    // Progress + time remaining
    if (print.mc_percent !== undefined) {
      const pct  = print.mc_percent;
      const left = print.mc_remaining_time ? `${print.mc_remaining_time} min left` : '';
      emit('printer:printProgress', { progress: pct, currentLine: 0, totalLines: 0, gcode: left ? `${pct}% — ${left}` : `${pct}%` });
    }

    // Temperatures
    if (print.nozzle_temper !== undefined || print.bed_temper !== undefined) {
      emit('printer:temperature', {
        extruder: { actual: print.nozzle_temper        || 0, target: print.nozzle_target_temper || 0 },
        bed:      { actual: print.bed_temper           || 0, target: print.bed_target_temper    || 0 },
      });
    }

    // Print state
    const state = print.gcode_state;
    if (state === 'FINISH' && bambuDoneResolve) {
      const r = bambuDoneResolve; bambuDoneResolve = null; bambuDoneReject = null;
      r();
    } else if ((state === 'FAILED' || state === 'CANCEL') && bambuDoneReject) {
      const r = bambuDoneReject; bambuDoneResolve = null; bambuDoneReject = null;
      if (state === 'CANCEL') { cancelFlag = true; bambuDoneResolve = r; bambuDoneResolve(); bambuDoneResolve = null; }
      else r(new Error('Bambu print failed (error ' + (print.print_error || 'unknown') + ')'));
    }
  } catch (_) {}
}

// ── IPC: Direct G-code ───────────────────────────────────────────────────────────
ipcMain.handle('printer:sendGcode', async (_ev, cmd) => {
  if (!activePort || !activePort.isOpen) throw new Error('USB not connected');
  await new Promise((res, rej) => activePort.write(cmd + '\n', err => err ? rej(err) : res()));
});

ipcMain.handle('printer:sendGcodeWifi', async (_ev, cmd) => {
  if (wifi.mode === 'octoprint') await octoPost('printer/command', { commands: [cmd] });
  else                           await moonPost('printer/gcode/script', { script: cmd });
});

// ── IPC: Eject G-code ────────────────────────────────────────────────────────────
ipcMain.handle('printer:getEjectGcode', () => ejectLines);

ipcMain.handle('printer:setEjectGcode', (_ev, lines) => {
  ejectLines = lines;
  try { fs.writeFileSync(ejectFilePath(), JSON.stringify(lines)); } catch (_) {}
});

// ── Queue runner ─────────────────────────────────────────────────────────────────
async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  cancelFlag   = false;

  try {
    while (true) {
      const item = queue.find(i => i.status === 'queued');
      if (!item) break;

      currentItem = item;
      item.status = 'printing';
      item._startedAt = Date.now();
      emit('printer:printStarted', item);

      // Taskbar progress
      if (mainWindow) mainWindow.setProgressBar(0);

      try {
        if (wifi.mode === 'usb') await runUsbPrint(item);
        else                     await runWifiPrint(item);
      } catch (err) {
        item.status = 'error';
        saveHistoryEntry(item, 'error', Date.now() - item._startedAt);
        notify('Print failed', `${item.name} — ${err.message}`);
        if (mainWindow) mainWindow.setProgressBar(-1);
        currentItem = null;
        emit('printer:queueError', err.message);
        return;
      }

      if (cancelFlag) {
        item.status = 'cancelled';
        saveHistoryEntry(item, 'cancelled', Date.now() - item._startedAt);
        emit('printer:printCancelled', item);
        if (mainWindow) mainWindow.setProgressBar(-1);
        cancelFlag = false;
        break;
      }

      item.status = 'done';
      saveHistoryEntry(item, 'done', Date.now() - item._startedAt);
      notify('Print complete ✓', item.name);
      emit('printer:printComplete', item);
      emit('printer:printProgress', { progress: 100, currentLine: item.totalLines, totalLines: item.totalLines });
      if (mainWindow) mainWindow.setProgressBar(-1);
      currentItem = null;
    }
  } finally {
    queueRunning = false;
    currentItem  = null;
    if (mainWindow) mainWindow.setProgressBar(-1);
    emit('printer:queueComplete');
  }
}

// ── USB print: stream G-code line-by-line ────────────────────────────────────────
async function runUsbPrint(item) {
  const raw   = fs.readFileSync(item.filePath, 'utf8');
  const lines = raw.split('\n').map(l => l.split(';')[0].trim()).filter(l => l);
  item.totalLines = lines.length;

  await serialSend('M110 N0');  // reset line counter

  for (let i = 0; i < lines.length; i++) {
    if (cancelFlag) return;

    // Pause support
    if (pauseFlag) {
      await new Promise(r => { resumeResolve = r; });
      if (cancelFlag) return;
    }

    await serialSend(lines[i]);
    const progress = Math.round(((i + 1) / lines.length) * 100);
    emit('printer:printProgress', { progress, currentLine: i + 1, totalLines: lines.length, gcode: lines[i] });

    if ((i + 1) % 50 === 0 && activePort && activePort.isOpen) {
      activePort.write('M105\n');  // async temp request
    }
  }

  // Auto-eject sequence
  if (ejectLines.length > 0 && !cancelFlag) {
    emit('printer:ejecting');
    for (const line of ejectLines) {
      if (line.trim() && !cancelFlag) await serialSend(line);
    }
    emit('printer:ejectComplete');
  }
}

// Send one G-code line over USB and wait for 'ok' from printer
function serialSend(cmd) {
  return new Promise((resolve, reject) => {
    if (!activePort || !activePort.isOpen) { reject(new Error('USB disconnected')); return; }
    if (cancelFlag) { resolve(); return; }
    okWaiters.push(resolve);
    activePort.write(cmd + '\n', err => {
      if (err) {
        const idx = okWaiters.indexOf(resolve);
        if (idx >= 0) okWaiters.splice(idx, 1);
        reject(err);
      }
    });
  });
}

// ── WiFi print: upload → start → poll ────────────────────────────────────────────
async function runWifiPrint(item) {
  const filename = path.basename(item.filePath);
  emit('printer:printProgress', { progress: 0, currentLine: 0, totalLines: 0, gcode: 'Uploading file…' });

  if (wifi.mode === 'octoprint') {
    const up = await octoUpload(item.filePath);
    if (up.status >= 400) throw new Error('Upload failed: ' + up.text);

    const sel = await octoPost(`files/local/${encodeURIComponent(filename)}`, { command: 'select', print: true });
    if (sel.status >= 400) throw new Error('Print start failed: ' + sel.text);

  } else if (wifi.mode === 'bambu') {
    await runBambuPrint(item);
    return;  // Bambu manages its own poll loop via MQTT

  } else {  // moonraker
    const up = await moonUpload(item.filePath);
    if (up.status >= 400) throw new Error('Upload failed: ' + up.text);

    const start = await moonPost('printer/print/start', { filename });
    if (start.status >= 400) throw new Error('Print start failed: ' + start.text);
  }

  await pollUntilDone();
}

async function runBambuPrint(item) {
  const filename = path.basename(item.filePath);

  // FTP upload to /model/ on the printer
  emit('printer:printProgress', { progress: 0, currentLine: 0, totalLines: 0, gcode: 'Uploading via FTP…' });
  const tmpPath = path.join(os.tmpdir(), 'printara_bambu_' + filename);
  fs.copyFileSync(item.filePath, tmpPath);

  const ftpClient = new ftp.Client();
  ftpClient.ftp.verbose = false;
  try {
    await ftpClient.access({
      host: wifi.ip, port: 990,
      user: 'bblp', password: wifi.accessCode,
      secure: 'implicit', secureOptions: { rejectUnauthorized: false },
    });
    await ftpClient.cd('/model');
    await ftpClient.uploadFrom(tmpPath, filename);
  } finally {
    ftpClient.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }

  // Send MQTT print command
  emit('printer:printProgress', { progress: 0, currentLine: 0, totalLines: 0, gcode: 'Starting print…' });
  await bambuPublish({
    command:      'project_file',
    url:          `ftp:///model/${filename}`,
    param:        filename,
    subtask_name: path.basename(filename, path.extname(filename)),
    task_id:      '0',
    profile_id:   '0',
    project_id:   '0',
  });

  // Wait for MQTT status to report FINISH/FAILED/CANCEL
  await new Promise((resolve, reject) => {
    bambuDoneResolve = resolve;
    bambuDoneReject  = reject;
    // Poll cancel flag
    const t = setInterval(() => {
      if (cancelFlag) {
        clearInterval(t);
        bambuDoneResolve = null; bambuDoneReject = null;
        resolve();
      }
    }, 500);
    const origResolve = resolve;
    const origReject  = reject;
    bambuDoneResolve = () => { clearInterval(t); origResolve(); };
    bambuDoneReject  = (e) => { clearInterval(t); origReject(e); };
  });
}

// Poll printer every 3 s until print is done / cancelled / errors
async function pollUntilDone() {
  while (true) {
    if (cancelFlag) return;
    await new Promise(r => setTimeout(r, 3000));
    if (cancelFlag) return;

    try {
      if (wifi.mode === 'octoprint') {
        const [jobRes, printerRes] = await Promise.all([octoGet('job'), octoGet('printer')]);
        const job     = jobRes.json();
        const printer = printerRes.json();

        if (printer.temperature) {
          const t = printer.temperature;
          emit('printer:temperature', {
            extruder: t.tool0 ? { actual: t.tool0.actual || 0, target: t.tool0.target || 0 } : null,
            bed:      t.bed   ? { actual: t.bed.actual   || 0, target: t.bed.target   || 0 } : null,
          });
        }

        const prog = job.progress || {};
        const pct  = Math.round(prog.completion || 0);
        const left = prog.printTimeLeft ? Math.round(prog.printTimeLeft / 60) + ' min left' : '';
        emit('printer:printProgress', { progress: pct, currentLine: 0, totalLines: 0, gcode: left ? `${pct}% — ${left}` : `${pct}%` });

        const st = job.state;
        if (st === 'Operational') return;           // print finished
        if (st === 'Error')       throw new Error('OctoPrint error: ' + (job.error || st));

      } else {  // moonraker
        const res  = await moonGet('printer/objects/query?print_stats&display_status&extruder&heater_bed');
        const objs = ((res.json().result || {}).status) || {};

        emit('printer:temperature', {
          extruder: objs.extruder   ? { actual: objs.extruder.temperature   || 0, target: objs.extruder.target   || 0 } : null,
          bed:      objs.heater_bed ? { actual: objs.heater_bed.temperature || 0, target: objs.heater_bed.target || 0 } : null,
        });

        const disp = objs.display_status || {};
        const pct  = Math.round((disp.progress || 0) * 100);
        emit('printer:printProgress', { progress: pct, currentLine: 0, totalLines: 0, gcode: `${pct}%` });

        const ps = objs.print_stats || {};
        if (ps.state === 'complete')  return;
        if (ps.state === 'error')     throw new Error('Klipper error: ' + (ps.message || 'unknown'));
        if (ps.state === 'cancelled') { cancelFlag = true; return; }
      }
    } catch (err) {
      // Transient network errors during poll — log and keep trying
      emit('printer:response', 'Poll retry: ' + err.message);
    }
  }
}

// ── Bambu Lab MQTT (native TLS, mqtts://ip:8883) ─────────────────────────────────
const mqttClients = new Map();

ipcMain.handle('mqtt:connect', (_ev, printerId, ip, pin) => {
  return new Promise((resolve, reject) => {
    if (mqttClients.has(printerId)) {
      try { mqttClients.get(printerId).end(true); } catch (_) {}
      mqttClients.delete(printerId);
    }
    const client = mqtt.connect(`mqtts://${ip}:8883`, {
      clientId: 'printara_' + Math.random().toString(36).slice(2, 10),
      username: 'bblp', password: pin,
      rejectUnauthorized: false,
      connectTimeout: 8000, reconnectPeriod: 0, clean: true,
    });
    let settled = false;
    client.on('connect', () => {
      client.subscribe('device/+/report', () => {
        if (!settled) { settled = true; mqttClients.set(printerId, client); resolve({ ok: true }); }
      });
    });
    client.on('message', (topic, payload) => {
      if (mainWindow) mainWindow.webContents.send('mqtt:message', { printerId, topic, payload: payload.toString() });
    });
    client.on('error', err => {
      if (!settled) { settled = true; reject(err); }
      else if (mainWindow) mainWindow.webContents.send('mqtt:error', { printerId, message: err.message });
    });
    client.on('close', () => {
      if (!settled) { settled = true; reject(new Error('Connection closed')); }
      else if (mainWindow) mainWindow.webContents.send('mqtt:closed', { printerId });
    });
    setTimeout(() => {
      if (!settled) { settled = true; client.end(true); reject(new Error('Connection timed out')); }
    }, 9000);
  });
});

ipcMain.handle('mqtt:publish', (_ev, printerId, topic, payload) => {
  const client = mqttClients.get(printerId);
  if (!client) throw new Error('No MQTT client for printer ' + printerId);
  return new Promise((res, rej) => client.publish(topic, payload, err => err ? rej(err) : res()));
});

ipcMain.handle('mqtt:disconnect', (_ev, printerId) => {
  const client = mqttClients.get(printerId);
  if (client) { try { client.end(true); } catch (_) {} mqttClients.delete(printerId); }
});

// ── Bambu Lab FTP upload (implicit TLS, port 990) ────────────────────────────────
ipcMain.handle('ftp:upload', async (_ev, ip, pin, filename, bufferData) => {
  const tmpPath = path.join(os.tmpdir(), 'printara_' + filename);
  fs.writeFileSync(tmpPath, Buffer.from(bufferData));
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: ip, port: 990, user: 'bblp', password: pin,
      secure: 'implicit', secureOptions: { rejectUnauthorized: false },
    });
    await client.cd('/model');
    await client.uploadFrom(tmpPath, filename);
    return { ok: true };
  } finally {
    client.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

// ── Legacy serial IPC (used by web queue.html) ────────────────────────────────────
ipcMain.handle('serial:list',       async ()          => (await SerialPort.list()).sort((a, b) => a.path.localeCompare(b.path)));
ipcMain.handle('serial:send',       async (_ev, data) => {
  if (!activePort || !activePort.isOpen) throw new Error('Not connected');
  await new Promise((res, rej) => activePort.write(data, err => err ? rej(err) : res()));
});
ipcMain.handle('serial:disconnect', async ()          => {
  if (activePort && activePort.isOpen) await new Promise(r => activePort.close(r));
  activePort = null;
});
ipcMain.handle('serial:connect', async (_ev, portPath, baudRate) => {
  // Reuses printer:connectUsb logic
  return ipcMain.emit('printer:connectUsb', null, { portPath, baudRate });
});

// ── Window ────────────────────────────────────────────────────────────────────────
function getPreloadPath() { return path.join(__dirname, 'preload.js'); }
function getIconPath()    { return path.join(__dirname, 'logo.ico'); }
function getQueueUI()     { return path.join(__dirname, 'src', 'index.html'); }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300, height: 860, minWidth: 960, minHeight: 640,
    title: 'Printara — Print Queue',
    backgroundColor: '#0a0a0a',
    icon: getIconPath(),
    webPreferences: {
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  mainWindow.webContents.session.setPermissionCheckHandler((_wc, perm) => perm === 'serial' ? true : null);
  mainWindow.webContents.session.setDevicePermissionHandler(d => d.deviceType === 'serial');
  mainWindow.loadFile(getQueueUI());
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  // Load persisted data
  try { const p = ejectFilePath();   if (fs.existsSync(p)) ejectLines = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  loadHistory();

  createWindow();

  // Auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available',  info => { emit('updater:available',   info); notify('Update available', `Printara ${info.version} is downloading…`); });
  autoUpdater.on('update-downloaded', info => { emit('updater:downloaded',  info); notify('Update ready',     `Printara ${info.version} — restart to install`); });
  autoUpdater.on('error',             err  => { emit('updater:error',       err.message); });
  autoUpdater.on('download-progress', p    => { emit('updater:progress',    p); });

  // Check for updates 5s after launch (only in packaged builds)
  if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates(), 5000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
