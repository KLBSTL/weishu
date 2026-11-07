const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arkDesktop', {
  command: value => ipcRenderer.invoke('ark:command', value),
  status: () => ipcRenderer.invoke('ark:status'),
  close: () => ipcRenderer.invoke('ark:command', { name: 'close' }),
  openPanel: (page, pet) => ipcRenderer.invoke('ark:command', { name: 'open', page, pet }),
  moveDock: (x, y) => ipcRenderer.invoke('ark:command', { name: 'dock-position', x, y }),
  report: value => ipcRenderer.send('ark:report', value),
  onCommand: callback => { ipcRenderer.on('ark:pet-command', (_event, value) => { callback(value); }); },
  onNavigate: callback => { ipcRenderer.on('ark:navigate', (_event, value) => { callback(value); }); },
  onSettings: callback => { ipcRenderer.on('ark:settings', (_event, value) => { callback(value); }); },
  onShell: callback => { ipcRenderer.on('ark:shell', (_event, value) => { callback(value); }); },
  shellReport: value => ipcRenderer.send('ark:shell-report', value),
});
