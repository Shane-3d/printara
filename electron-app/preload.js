const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printer', {
  // Port
  listPorts: () => ipcRenderer.invoke('list-ports'),
  connect: (config) => ipcRenderer.invoke('connect-printer', config),
  disconnect: () => ipcRenderer.invoke('disconnect-printer'),
  sendGcode: (cmd) => ipcRenderer.invoke('send-gcode', cmd),

  // Files & Queue
  browseFiles: () => ipcRenderer.invoke('browse-files'),
  addFilesToQueue: (paths) => ipcRenderer.invoke('add-files-to-queue', paths),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  removeFromQueue: (id) => ipcRenderer.invoke('remove-from-queue', id),
  clearQueue: () => ipcRenderer.invoke('clear-queue'),
  moveQueueItem: (data) => ipcRenderer.invoke('move-queue-item', data),

  // Print control
  startQueue: () => ipcRenderer.invoke('start-queue'),
  pausePrint: () => ipcRenderer.invoke('pause-print'),
  resumePrint: () => ipcRenderer.invoke('resume-print'),
  cancelPrint: () => ipcRenderer.invoke('cancel-print'),

  // Eject config
  getEjectGcode: () => ipcRenderer.invoke('get-eject-gcode'),
  setEjectGcode: (lines) => ipcRenderer.invoke('set-eject-gcode', lines),

  // Events — all return an unsubscribe function
  onResponse: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('printer-response', fn);
    return () => ipcRenderer.removeListener('printer-response', fn);
  },
  onDisconnected: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('printer-disconnected', fn);
    return () => ipcRenderer.removeListener('printer-disconnected', fn);
  },
  onTemperature: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('temperature-update', fn);
    return () => ipcRenderer.removeListener('temperature-update', fn);
  },
  onPrintStarted: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('print-started', fn);
    return () => ipcRenderer.removeListener('print-started', fn);
  },
  onPrintProgress: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('print-progress', fn);
    return () => ipcRenderer.removeListener('print-progress', fn);
  },
  onPrintComplete: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('print-complete', fn);
    return () => ipcRenderer.removeListener('print-complete', fn);
  },
  onPrintPaused: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('print-paused', fn);
    return () => ipcRenderer.removeListener('print-paused', fn);
  },
  onPrintResumed: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('print-resumed', fn);
    return () => ipcRenderer.removeListener('print-resumed', fn);
  },
  onPrintCancelled: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('print-cancelled', fn);
    return () => ipcRenderer.removeListener('print-cancelled', fn);
  },
  onQueueComplete: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('queue-complete', fn);
    return () => ipcRenderer.removeListener('queue-complete', fn);
  },
  onEjecting: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('ejecting', fn);
    return () => ipcRenderer.removeListener('ejecting', fn);
  },
  onEjectComplete: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('eject-complete', fn);
    return () => ipcRenderer.removeListener('eject-complete', fn);
  },
  onError: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('printer-error', fn);
    return () => ipcRenderer.removeListener('printer-error', fn);
  },
  onQueueError: (cb) => {
    const fn = (_, d) => cb(d);
    ipcRenderer.on('queue-error', fn);
    return () => ipcRenderer.removeListener('queue-error', fn);
  },
});
