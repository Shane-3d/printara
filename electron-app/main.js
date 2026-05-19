const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('fs');

let mainWindow;
let port = null;
let parser = null;
let printQueue = [];
let currentPrint = null;
let isPrinting = false;
let isPaused = false;
let gcodeLines = [];
let lineIndex = 0;
let tempPollInterval = null;
let ejectGcode = [
  'M104 S0',
  'M140 S0',
  'G91',
  'G1 Z15 F3000',
  'G90',
  'G28 X Y',
  'M84',
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0d0d0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  cleanupPort();
  if (process.platform !== 'darwin') app.quit();
});

// ── Port management ────────────────────────────────────────────────────────────

function cleanupPort() {
  if (tempPollInterval) {
    clearInterval(tempPollInterval);
    tempPollInterval = null;
  }
  if (port && port.isOpen) {
    port.close();
  }
  port = null;
  parser = null;
}

ipcMain.handle('list-ports', async () => {
  const ports = await SerialPort.list();
  return ports.map(p => ({
    path: p.path,
    manufacturer: p.manufacturer || '',
    serialNumber: p.serialNumber || '',
  }));
});

ipcMain.handle('connect-printer', async (_event, { portPath, baudRate }) => {
  cleanupPort();
  return new Promise((resolve) => {
    port = new SerialPort({ path: portPath, baudRate: parseInt(baudRate, 10) });
    parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    parser.on('data', (line) => {
      const trimmed = line.trim();
      if (mainWindow) mainWindow.webContents.send('printer-response', trimmed);
      handlePrinterResponse(trimmed);
    });

    port.on('open', () => {
      startTempPolling();
      resolve({ success: true });
    });

    port.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    port.on('close', () => {
      if (mainWindow) mainWindow.webContents.send('printer-disconnected');
      isPrinting = false;
      currentPrint = null;
    });
  });
});

ipcMain.handle('disconnect-printer', async () => {
  isPrinting = false;
  isPaused = false;
  currentPrint = null;
  cleanupPort();
  return { success: true };
});

// ── G-code sending ─────────────────────────────────────────────────────────────

function writeToPort(cmd) {
  return new Promise((resolve) => {
    if (!port || !port.isOpen) return resolve(false);
    port.write(cmd + '\n', (err) => resolve(!err));
  });
}

ipcMain.handle('send-gcode', async (_event, command) => {
  if (!port || !port.isOpen) return { success: false, error: 'Not connected' };
  const ok = await writeToPort(command);
  return { success: ok };
});

// ── Temperature polling ────────────────────────────────────────────────────────

function startTempPolling() {
  if (tempPollInterval) clearInterval(tempPollInterval);
  tempPollInterval = setInterval(async () => {
    if (port && port.isOpen && !isPrinting) {
      writeToPort('M105');
    }
  }, 3000);
}

// ── File / Queue management ────────────────────────────────────────────────────

ipcMain.handle('browse-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add G-code files to queue',
    filters: [{ name: 'G-code', extensions: ['gcode', 'g', 'gc', 'gco', 'ngc'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return result;
});

ipcMain.handle('add-files-to-queue', async (_event, filePaths) => {
  const added = [];
  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => {
      const t = l.split(';')[0].trim();
      return t.length > 0;
    });
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: path.basename(filePath),
      filePath,
      totalLines: lines.length,
      status: 'queued',
      addedAt: new Date().toISOString(),
    };
    printQueue.push(item);
    added.push(item);
  }
  return { success: true, items: added };
});

ipcMain.handle('get-queue', () => printQueue);

ipcMain.handle('remove-from-queue', (_event, id) => {
  if (currentPrint && currentPrint.id === id) {
    return { success: false, error: 'Cannot remove currently printing item' };
  }
  printQueue = printQueue.filter(item => item.id !== id);
  return { success: true };
});

ipcMain.handle('clear-queue', () => {
  printQueue = printQueue.filter(item => item.status === 'printing');
  return { success: true };
});

ipcMain.handle('move-queue-item', (_event, { id, direction }) => {
  const idx = printQueue.findIndex(item => item.id === id);
  if (idx === -1) return { success: false };
  if (direction === 'up' && idx > 0) {
    [printQueue[idx - 1], printQueue[idx]] = [printQueue[idx], printQueue[idx - 1]];
  } else if (direction === 'down' && idx < printQueue.length - 1) {
    [printQueue[idx + 1], printQueue[idx]] = [printQueue[idx], printQueue[idx + 1]];
  }
  return { success: true };
});

ipcMain.handle('set-eject-gcode', (_event, lines) => {
  ejectGcode = lines;
  return { success: true };
});

ipcMain.handle('get-eject-gcode', () => ejectGcode);

// ── Print queue execution ──────────────────────────────────────────────────────

ipcMain.handle('start-queue', async () => {
  if (!isPrinting && printQueue.some(i => i.status === 'queued')) {
    await startNextPrint();
  }
  return { success: true };
});

ipcMain.handle('pause-print', () => {
  isPaused = true;
  writeToPort('M25');
  if (mainWindow) mainWindow.webContents.send('print-paused');
  return { success: true };
});

ipcMain.handle('resume-print', () => {
  isPaused = false;
  writeToPort('M24');
  if (mainWindow) mainWindow.webContents.send('print-resumed');
  sendNextLine();
  return { success: true };
});

ipcMain.handle('cancel-print', async () => {
  isPrinting = false;
  isPaused = false;
  if (currentPrint) {
    currentPrint.status = 'cancelled';
    if (mainWindow) mainWindow.webContents.send('print-cancelled', currentPrint);
    currentPrint = null;
  }
  writeToPort('M112'); // emergency stop
  return { success: true };
});

async function startNextPrint() {
  const next = printQueue.find(item => item.status === 'queued');
  if (!next) {
    isPrinting = false;
    if (mainWindow) mainWindow.webContents.send('queue-complete');
    return;
  }
  if (!port || !port.isOpen) {
    if (mainWindow) mainWindow.webContents.send('queue-error', 'Printer disconnected');
    return;
  }

  currentPrint = next;
  currentPrint.status = 'printing';
  currentPrint.startedAt = new Date().toISOString();
  isPrinting = true;
  isPaused = false;

  try {
    const content = fs.readFileSync(currentPrint.filePath, 'utf8');
    gcodeLines = content.split('\n')
      .map(l => l.split(';')[0].trim())
      .filter(l => l.length > 0);
    lineIndex = 0;
    currentPrint.totalLines = gcodeLines.length;

    if (mainWindow) mainWindow.webContents.send('print-started', currentPrint);
    sendNextLine();
  } catch (err) {
    currentPrint.status = 'error';
    if (mainWindow) mainWindow.webContents.send('queue-error', err.message);
    currentPrint = null;
    isPrinting = false;
  }
}

function sendNextLine() {
  if (!isPrinting || isPaused) return;
  if (!port || !port.isOpen) {
    if (mainWindow) mainWindow.webContents.send('queue-error', 'Printer disconnected mid-print');
    return;
  }

  if (lineIndex >= gcodeLines.length) {
    onPrintComplete();
    return;
  }

  const line = gcodeLines[lineIndex];
  lineIndex++;

  const progress = Math.round((lineIndex / gcodeLines.length) * 100);
  if (mainWindow) {
    mainWindow.webContents.send('print-progress', {
      progress,
      currentLine: lineIndex,
      totalLines: gcodeLines.length,
      gcode: line,
      item: currentPrint,
    });
  }

  writeToPort(line);
}

function onPrintComplete() {
  if (!currentPrint) return;
  currentPrint.status = 'done';
  currentPrint.completedAt = new Date().toISOString();
  const done = currentPrint;
  currentPrint = null;
  isPrinting = false;

  if (mainWindow) mainWindow.webContents.send('print-complete', done);

  // Run auto-eject sequence then move to next
  runEjectSequence(() => {
    setTimeout(() => startNextPrint(), 2000);
  });
}

function runEjectSequence(onDone) {
  if (!port || !port.isOpen || ejectGcode.length === 0) {
    if (onDone) onDone();
    return;
  }
  if (mainWindow) mainWindow.webContents.send('ejecting');

  let i = 0;
  const step = () => {
    if (i >= ejectGcode.length) {
      if (mainWindow) mainWindow.webContents.send('eject-complete');
      if (onDone) onDone();
      return;
    }
    writeToPort(ejectGcode[i]);
    i++;
    setTimeout(step, 400);
  };
  step();
}

function handlePrinterResponse(line) {
  if (line.startsWith('ok')) {
    if (isPrinting && !isPaused) sendNextLine();
  } else if (line.startsWith('T:') || line.includes('T0:') || line.startsWith('ok T')) {
    const temps = parseTemperature(line);
    if (temps && mainWindow) mainWindow.webContents.send('temperature-update', temps);
  } else if (/error/i.test(line)) {
    if (mainWindow) mainWindow.webContents.send('printer-error', line);
  }
}

function parseTemperature(line) {
  const extruder = line.match(/T(?:0)?:([0-9.]+)\s*\/([0-9.]+)/);
  const bed = line.match(/B:([0-9.]+)\s*\/([0-9.]+)/);
  return {
    extruder: extruder ? { actual: parseFloat(extruder[1]), target: parseFloat(extruder[2]) } : null,
    bed: bed ? { actual: parseFloat(bed[1]), target: parseFloat(bed[2]) } : null,
  };
}
