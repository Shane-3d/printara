const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serialBridge', {
  list:       ()           => ipcRenderer.invoke('serial:list'),
  connect:    (path, baud) => ipcRenderer.invoke('serial:connect', path, baud),
  send:       (data)       => ipcRenderer.invoke('serial:send', data),
  disconnect: ()           => ipcRenderer.invoke('serial:disconnect'),
  onData:     (cb) => ipcRenderer.on('serial:data',   (_e, d) => cb(d)),
  onError:    (cb) => ipcRenderer.on('serial:error',  (_e, e) => cb(e)),
  onClosed:   (cb) => ipcRenderer.on('serial:closed', ()      => cb()),
});

// Native MQTT bridge — uses mqtts://ip:8883 with TLS (Bambu Lab local protocol)
contextBridge.exposeInMainWorld('mqttBridge', {
  connect:    (id, ip, pin) => ipcRenderer.invoke('mqtt:connect',    id, ip, pin),
  publish:    (id, topic, payload) => ipcRenderer.invoke('mqtt:publish', id, topic, payload),
  disconnect: (id)          => ipcRenderer.invoke('mqtt:disconnect', id),
  onMessage:  (cb) => ipcRenderer.on('mqtt:message', (_e, d) => cb(d)),
  onError:    (cb) => ipcRenderer.on('mqtt:error',   (_e, d) => cb(d)),
  onClosed:   (cb) => ipcRenderer.on('mqtt:closed',  (_e, d) => cb(d)),
});

// FTP bridge — uploads files to the Bambu printer (implicit TLS, port 990)
contextBridge.exposeInMainWorld('ftpBridge', {
  upload: (ip, pin, filename, buffer) => ipcRenderer.invoke('ftp:upload', ip, pin, filename, buffer),
});
