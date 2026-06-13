const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const mqtt = require('mqtt');
const ftp  = require('basic-ftp');

let mainWindow = null;
let activePort = null;

// ── Bambu Lab MQTT (native TLS, mqtts://ip:8883) ───────────────────────────────
// Map of printerId → mqtt.Client so multiple printers work independently.
const mqttClients = new Map();

ipcMain.handle('mqtt:connect', (_ev, printerId, ip, pin) => {
  return new Promise((resolve, reject) => {
    // Clean up any existing client for this printer
    if (mqttClients.has(printerId)) {
      try { mqttClients.get(printerId).end(true); } catch (_) {}
      mqttClients.delete(printerId);
    }

    const client = mqtt.connect(`mqtts://${ip}:8883`, {
      clientId: 'printara_' + Math.random().toString(36).slice(2, 10),
      username: 'bblp',
      password: pin,
      rejectUnauthorized: false, // Bambu uses a self-signed cert
      connectTimeout: 8000,
      reconnectPeriod: 0,
      clean: true,
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

// ── Bambu Lab FTP upload (implicit TLS, port 990) ──────────────────────────────
// Writes the file to a temp path, FTPs to /model/ on the printer, then cleans up.
ipcMain.handle('ftp:upload', async (_ev, ip, pin, filename, bufferData) => {
  const tmpPath = path.join(os.tmpdir(), 'printara_' + filename);
  fs.writeFileSync(tmpPath, Buffer.from(bufferData));

  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: ip, port: 990,
      user: 'bblp', password: pin,
      secure: 'implicit',
      secureOptions: { rejectUnauthorized: false },
    });
    await client.cd('/model');
    await client.uploadFrom(tmpPath, filename);
    return { ok: true };
  } finally {
    client.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

function getQueuePath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'queue.html');
  return path.join(__dirname, '..', 'queue.html');
}

function getLoginPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'login.html');
  return path.join(__dirname, '..', 'login.html');
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

// ── Serial IPC ─────────────────────────────────────────────────────────────────
ipcMain.handle('serial:list', async () => {
  const ports = await SerialPort.list();
  // Filter to likely printer ports and sort by path
  return ports.sort((a, b) => a.path.localeCompare(b.path));
});

ipcMain.handle('serial:connect', async (_ev, portPath, baudRate) => {
  if (activePort && activePort.isOpen) {
    await new Promise(r => activePort.close(r));
    activePort = null;
  }
  activePort = new SerialPort({ path: portPath, baudRate: parseInt(baudRate) || 115200, autoOpen: false });
  const parser = activePort.pipe(new ReadlineParser({ delimiter: '\n' }));

  parser.on('data', line => {
    if (mainWindow) mainWindow.webContents.send('serial:data', line.trim());
  });
  activePort.on('error', err => {
    if (mainWindow) mainWindow.webContents.send('serial:error', err.message);
  });
  activePort.on('close', () => {
    if (mainWindow) mainWindow.webContents.send('serial:closed');
  });

  await new Promise((res, rej) => activePort.open(err => err ? rej(err) : res()));
  return { ok: true };
});

ipcMain.handle('serial:send', async (_ev, data) => {
  if (!activePort || !activePort.isOpen) throw new Error('Not connected');
  await new Promise((res, rej) => activePort.write(data, err => err ? rej(err) : res()));
});

ipcMain.handle('serial:disconnect', async () => {
  if (activePort && activePort.isOpen) {
    await new Promise(r => activePort.close(r));
  }
  activePort = null;
});

// ── Window ─────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300, height: 860, minWidth: 960, minHeight: 640,
    title: 'Printara — Print Queue',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  });

  // Still support Web Serial API as fallback
  mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) => permission === 'serial' ? true : null);
  mainWindow.webContents.session.setDevicePermissionHandler(d => d.deviceType === 'serial');

  mainWindow.loadFile(getLoginPath());
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
