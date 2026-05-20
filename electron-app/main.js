const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function getQueuePath() {
  // Packaged: queue.html is in extraResource → process.resourcesPath
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'queue.html');
  }
  // Dev: one directory up from electron-app/
  return path.join(__dirname, '..', 'queue.html');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Printara — Print Queue',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      webSecurity: false,      // allows fetch() to local printer IPs (http://192.168.x.x)
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(getQueuePath());
  win.setMenuBarVisibility(false);

  // Open external links in real browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
