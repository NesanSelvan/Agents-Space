import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── PTY ──────────────────────────────────────────────────────────────────
  ptyCreate: (opts: { id: string; cwd: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('pty:create', opts),

  ptyWrite: (id: string, data: string) =>
    ipcRenderer.invoke('pty:write', { id, data }),

  ptyResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty:resize', { id, cols, rows }),

  ptyKill: (id: string) =>
    ipcRenderer.invoke('pty:kill', { id }),

  onPtyData: (id: string, cb: (data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: string) => cb(data)
    ipcRenderer.on(`pty:data:${id}`, handler)
    // Returns cleanup function
    return () => ipcRenderer.removeListener(`pty:data:${id}`, handler)
  },

  // ─── File system ──────────────────────────────────────────────────────────
  homedir: () => ipcRenderer.invoke('fs:homedir'),

  readDir: (dirPath: string) => ipcRenderer.invoke('fs:readdir', dirPath),

  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  readFile: (filePath: string) => ipcRenderer.invoke('fs:readfile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writefile', filePath, content),
  deleteFile: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  copyFile: (srcPath: string, destPath: string) => ipcRenderer.invoke('fs:copy', srcPath, destPath),
  showInFolder: (targetPath: string) => ipcRenderer.invoke('fs:showInFolder', targetPath),

  // ─── Session persistence ─────────────────────────────────────────────────
  sessionGetId: () => ipcRenderer.invoke('session:getId'),
  sessionLoad: () => ipcRenderer.invoke('session:load'),
  sessionSave: (data: Record<string, unknown>) => ipcRenderer.invoke('session:save', data),
  sessionLoadAll: () => ipcRenderer.invoke('session:loadAll'),

  // ─── Recent folders ──────────────────────────────────────────────────────
  recentsLoad: () => ipcRenderer.invoke('recents:load'),
  recentsAdd: (folderPath: string) => ipcRenderer.invoke('recents:add', folderPath),

  // ─── Menu events ──────────────────────────────────────────────────────────
  onMenuOpenFolder: (cb: (folderPath: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, folderPath: string) => cb(folderPath)
    ipcRenderer.on('menu:open-folder', handler)
    return () => ipcRenderer.removeListener('menu:open-folder', handler)
  },
})
