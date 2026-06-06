'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── window.printer — full queue + WiFi + USB bridge ──────────────────────────────
contextBridge.exposeInMainWorld('printer', {
  // Ports
  listPorts:          ()              => ipcRenderer.invoke('printer:listPorts'),

  // USB
  connectUsb:         (opts)          => ipcRenderer.invoke('printer:connectUsb',       opts),
  disconnectUsb:      ()              => ipcRenderer.invoke('printer:disconnectUsb'),

  // WiFi
  connectOctoPrint:   (opts)          => ipcRenderer.invoke('printer:connectOctoPrint', opts),
  connectMoonraker:   (opts)          => ipcRenderer.invoke('printer:connectMoonraker', opts),
  connectBambu:       (opts)          => ipcRenderer.invoke('printer:connectBambu',     opts),
  disconnectWifi:     ()              => ipcRenderer.invoke('printer:disconnectWifi'),

  // File picker & queue
  browseFiles:        ()              => ipcRenderer.invoke('printer:browseFiles'),
  addFilesToQueue:    (paths)         => ipcRenderer.invoke('printer:addFilesToQueue',   paths),
  getQueue:           ()              => ipcRenderer.invoke('printer:getQueue'),
  clearQueue:         ()              => ipcRenderer.invoke('printer:clearQueue'),
  moveQueueItem:      (opts)          => ipcRenderer.invoke('printer:moveQueueItem',     opts),
  removeFromQueue:    (id)            => ipcRenderer.invoke('printer:removeFromQueue',   id),

  // Queue runner
  startQueue:         ()              => ipcRenderer.invoke('printer:startQueue'),

  // USB print controls
  pausePrint:         ()              => ipcRenderer.invoke('printer:pausePrint'),
  resumePrint:        ()              => ipcRenderer.invoke('printer:resumePrint'),
  cancelPrint:        ()              => ipcRenderer.invoke('printer:cancelPrint'),

  // WiFi print controls
  wifiPause:          ()              => ipcRenderer.invoke('printer:wifiPause'),
  wifiResume:         ()              => ipcRenderer.invoke('printer:wifiResume'),
  wifiCancel:         ()              => ipcRenderer.invoke('printer:wifiCancel'),

  // Direct G-code
  sendGcode:          (cmd)           => ipcRenderer.invoke('printer:sendGcode',         cmd),
  sendGcodeWifi:      (cmd)           => ipcRenderer.invoke('printer:sendGcodeWifi',     cmd),

  // Eject sequence
  getEjectGcode:      ()              => ipcRenderer.invoke('printer:getEjectGcode'),
  setEjectGcode:      (lines)         => ipcRenderer.invoke('printer:setEjectGcode',     lines),

  // Events from main → renderer
  onResponse:         (cb) => ipcRenderer.on('printer:response',      (_e, d) => cb(d)),
  onDisconnected:     (cb) => ipcRenderer.on('printer:disconnected',   ()      => cb()),
  onTemperature:      (cb) => ipcRenderer.on('printer:temperature',    (_e, d) => cb(d)),
  onPrintStarted:     (cb) => ipcRenderer.on('printer:printStarted',   (_e, d) => cb(d)),
  onPrintProgress:    (cb) => ipcRenderer.on('printer:printProgress',  (_e, d) => cb(d)),
  onPrintComplete:    (cb) => ipcRenderer.on('printer:printComplete',  (_e, d) => cb(d)),
  onEjecting:         (cb) => ipcRenderer.on('printer:ejecting',       ()      => cb()),
  onEjectComplete:    (cb) => ipcRenderer.on('printer:ejectComplete',  ()      => cb()),
  onPrintPaused:      (cb) => ipcRenderer.on('printer:printPaused',    ()      => cb()),
  onPrintResumed:     (cb) => ipcRenderer.on('printer:printResumed',   ()      => cb()),
  onPrintCancelled:   (cb) => ipcRenderer.on('printer:printCancelled', (_e, d) => cb(d)),
  onQueueComplete:    (cb) => ipcRenderer.on('printer:queueComplete',  ()      => cb()),
  onError:            (cb) => ipcRenderer.on('printer:error',          (_e, d) => cb(d)),
  onQueueError:       (cb) => ipcRenderer.on('printer:queueError',     (_e, d) => cb(d)),
});

// ── window.serialBridge — legacy (used by web queue.html) ────────────────────────
contextBridge.exposeInMainWorld('serialBridge', {
  list:       ()            => ipcRenderer.invoke('serial:list'),
  connect:    (path, baud)  => ipcRenderer.invoke('serial:connect',     path, baud),
  send:       (data)        => ipcRenderer.invoke('serial:send',         data),
  disconnect: ()            => ipcRenderer.invoke('serial:disconnect'),
  onData:     (cb) => ipcRenderer.on('serial:data',   (_e, d) => cb(d)),
  onError:    (cb) => ipcRenderer.on('serial:error',  (_e, e) => cb(e)),
  onClosed:   (cb) => ipcRenderer.on('serial:closed', ()      => cb()),
});

// ── window.mqttBridge — Bambu Lab native MQTT ─────────────────────────────────────
contextBridge.exposeInMainWorld('mqttBridge', {
  connect:    (id, ip, pin)        => ipcRenderer.invoke('mqtt:connect',    id, ip, pin),
  publish:    (id, topic, payload) => ipcRenderer.invoke('mqtt:publish',    id, topic, payload),
  disconnect: (id)                 => ipcRenderer.invoke('mqtt:disconnect', id),
  onMessage:  (cb) => ipcRenderer.on('mqtt:message', (_e, d) => cb(d)),
  onError:    (cb) => ipcRenderer.on('mqtt:error',   (_e, d) => cb(d)),
  onClosed:   (cb) => ipcRenderer.on('mqtt:closed',  (_e, d) => cb(d)),
});

// ── window.ftpBridge — Bambu Lab FTP upload ───────────────────────────────────────
contextBridge.exposeInMainWorld('ftpBridge', {
  upload: (ip, pin, filename, buffer) => ipcRenderer.invoke('ftp:upload', ip, pin, filename, buffer),
});
