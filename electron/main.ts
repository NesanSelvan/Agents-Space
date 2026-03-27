import { app, BrowserWindow, ipcMain, dialog, shell, Menu, webContents as electronWebContents } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { PtyManager } from './pty-manager'

app.setName('Agents Space')

// Set dock icon on macOS (needed for dev mode)
if (process.platform === 'darwin' && app.dock) {
  const dockIconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')
  app.dock.setIcon(dockIconPath)
}

const ptyManager = new PtyManager()

// ─── Multi-window session persistence ─────────────────────────────────────────
const sessionsPath = path.join(app.getPath('userData'), 'sessions.json')

interface WindowSession {
  id: string
  tiles: unknown[]
  maxZIndex: number
  viewport: { panX: number; panY: number; zoom: number }
  cwd: string
  fileTreeExpandedPaths?: string[]
}

function loadAllSessions(): WindowSession[] {
  try {
    const data = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveAllSessions(sessions: WindowSession[]) {
  try {
    fs.writeFileSync(sessionsPath, JSON.stringify(sessions), 'utf-8')
  } catch { /* ignore */ }
}

// ─── Recent folders tracking ──────────────────────────────────────────────────
const recentsPath = path.join(app.getPath('userData'), 'recents.json')
const MAX_RECENTS = 10

function loadRecents(): string[] {
  try {
    const data = JSON.parse(fs.readFileSync(recentsPath, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function addRecent(folderPath: string) {
  const recents = loadRecents().filter(r => r !== folderPath)
  recents.unshift(folderPath)
  if (recents.length > MAX_RECENTS) recents.length = MAX_RECENTS
  try {
    fs.writeFileSync(recentsPath, JSON.stringify(recents), 'utf-8')
  } catch { /* ignore */ }
}

// Track which BrowserWindow owns which session ID
const windowSessionMap = new Map<number, string>() // webContents.id → sessionId

// Track all managed windows for hide/show
const managedWindows: BrowserWindow[] = []

// Track which PTY IDs belong to which window (webContents.id → Set of pty ids)
const windowPtyMap = new Map<number, Set<string>>()
const fileWatchers = new Map<string, fs.FSWatcher>()
const fileWatchSubscribers = new Map<number, Set<string>>()

function watcherKey(senderId: number, filePath: string) {
  return `${senderId}:${filePath}`
}

function stopWatchingFile(senderId: number, filePath: string) {
  const key = watcherKey(senderId, filePath)
  const watcher = fileWatchers.get(key)
  if (watcher) {
    watcher.close()
    fileWatchers.delete(key)
  }
  const subscriptions = fileWatchSubscribers.get(senderId)
  if (subscriptions) {
    subscriptions.delete(filePath)
    if (subscriptions.size === 0) fileWatchSubscribers.delete(senderId)
  }
}

function stopWatchingAllFiles(senderId: number) {
  const subscriptions = fileWatchSubscribers.get(senderId)
  if (!subscriptions) return
  for (const filePath of subscriptions) {
    const key = watcherKey(senderId, filePath)
    const watcher = fileWatchers.get(key)
    if (watcher) {
      watcher.close()
      fileWatchers.delete(key)
    }
  }
  fileWatchSubscribers.delete(senderId)
}

// ─── Window creation ──────────────────────────────────────────────────────────

let nextSessionId = 0

function createWindow(sessionId?: string): BrowserWindow {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
    : join(__dirname, '../../resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    backgroundColor: '#0f0f0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Assign a session ID to this window
  const sid = sessionId ?? `session-${Date.now()}-${nextSessionId++}`
  const webContentsId = win.webContents.id
  windowSessionMap.set(webContentsId, sid)
  managedWindows.push(win)

  // Warn before closing if terminals are running
  win.on('close', (e) => {
    const ptyIds = windowPtyMap.get(webContentsId)
    if (ptyIds && ptyIds.size > 0) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Close', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Close Window',
        message: 'Terminal sessions are still running',
        detail: `${ptyIds.size} active terminal session${ptyIds.size > 1 ? 's' : ''} will be terminated.`,
      })
      if (choice === 1) {
        e.preventDefault()
        return
      }
    }
  })

  win.on('closed', () => {
    const ptyIds = windowPtyMap.get(webContentsId)
    if (ptyIds) {
      for (const id of ptyIds) {
        ptyManager.kill(id)
      }
    }
    stopWatchingAllFiles(webContentsId)
    windowSessionMap.delete(webContentsId)
    windowPtyMap.delete(webContentsId)
    const idx = managedWindows.indexOf(win)
    if (idx >= 0) managedWindows.splice(idx, 1)
  })

  // Load dev server or built file
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open DevTools in dev to catch errors
  if (process.env.NODE_ENV === 'development' || process.env['ELECTRON_RENDERER_URL']) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  return win
}

function showAllWindows() {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show()
  }
  for (const win of managedWindows) {
    if (!win.isDestroyed()) {
      win.show()
    }
  }
}

// Helper: get the BrowserWindow from an IPC event
function getCallerWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

app.whenReady().then(() => {
  // Restore only the most recent session (last saved)
  const savedSessions = loadAllSessions()
  if (savedSessions.length > 0) {
    const lastSession = savedSessions[savedSessions.length - 1]
    createWindow(lastSession.id)
  } else {
    createWindow()
  }

  // ─── Application menu ─────────────────────────────────────────────────────
  const isMac = process.platform === 'darwin'

  function buildRecentSubmenu(): Electron.MenuItemConstructorOptions[] {
    const recents = loadRecents()
    if (recents.length === 0) {
      return [{ label: 'No Recent Folders', enabled: false }]
    }
    return [
      ...recents.map(folderPath => ({
        label: folderPath.split('/').pop() || folderPath,
        sublabel: folderPath,
        click: () => {
          const focusedWin = BrowserWindow.getFocusedWindow()
          if (focusedWin) {
            focusedWin.webContents.send('menu:open-folder', folderPath)
          } else {
            const newWin = createWindow()
            newWin.webContents.once('did-finish-load', () => {
              newWin.webContents.send('menu:open-folder', folderPath)
            })
          }
        },
      })),
      { type: 'separator' as const },
      {
        label: 'Clear Recent',
        click: () => {
          try { fs.writeFileSync(recentsPath, '[]', 'utf-8') } catch { /* ignore */ }
          rebuildMenu()
        },
      },
    ]
  }

  function buildMenuTemplate(): Electron.MenuItemConstructorOptions[] {
    return [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        {
          label: `About ${app.name}`,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: `About ${app.name}`,
              message: app.name,
              detail: `Version ${app.getVersion()}\n\nInfinite canvas workspace for AI agents — run terminals, edit code, and orchestrate coding agents side by side.\n\nBuilt by Nesan Selvan\nhttps://nesanselvan.netlify.app\nhttps://github.com/NesanSelvan\n\nMIT License`,
              icon: app.isPackaged
                ? path.join(process.resourcesPath, 'icon.png')
                : path.join(__dirname, '../../resources/icon.png'),
            })
          },
        } as Electron.MenuItemConstructorOptions,
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const focusedWin = BrowserWindow.getFocusedWindow()
            if (!focusedWin) return
            const result = await dialog.showOpenDialog(focusedWin, {
              properties: ['openDirectory'],
            })
            if (!result.canceled && result.filePaths[0]) {
              addRecent(result.filePaths[0])
              focusedWin.webContents.send('menu:open-folder', result.filePaths[0])
              rebuildMenu()
            }
          },
        },
        {
          label: 'Open Recent',
          submenu: buildRecentSubmenu(),
        },
        { type: 'separator' },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => { createWindow() },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
  ]}

  function rebuildMenu() {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()))
  }

  rebuildMenu()

  // ─── Session persistence IPC ────────────────────────────────────────────────

  // Each window gets its own session ID
  ipcMain.handle('session:getId', (event) => {
    return windowSessionMap.get(event.sender.id) ?? null
  })

  // Load this window's session from the saved sessions array
  ipcMain.handle('session:load', (event) => {
    const sessionId = windowSessionMap.get(event.sender.id)
    if (!sessionId) return null
    const all = loadAllSessions()
    return all.find(s => s.id === sessionId) ?? null
  })

  // Save this window's session (upsert, deduplicate by cwd)
  ipcMain.handle('session:save', (event, data: WindowSession) => {
    const sessionId = windowSessionMap.get(event.sender.id)
    if (!sessionId) return
    data.id = sessionId
    // Remove any other sessions with the same cwd to prevent duplicates
    const all = loadAllSessions().filter(s => s.id === sessionId || s.cwd !== data.cwd)
    const idx = all.findIndex(s => s.id === sessionId)
    if (idx >= 0) {
      all[idx] = data
    } else {
      all.push(data)
    }
    saveAllSessions(all)
  })

  // Load all sessions (for listing recent windows)
  ipcMain.handle('session:loadAll', () => loadAllSessions())

  // Recent folders
  ipcMain.handle('recents:load', () => loadRecents())
  ipcMain.handle('recents:add', (_, folderPath: string) => {
    addRecent(folderPath)
    rebuildMenu()
  })

  // ─── PTY handlers ─────────────────────────────────────────────────────────

  ipcMain.handle('pty:create', (event, { id, cwd, cols, rows }) => {
    const senderId = event.sender.id
    // Track this PTY belongs to this window
    if (!windowPtyMap.has(senderId)) windowPtyMap.set(senderId, new Set())
    windowPtyMap.get(senderId)!.add(id)

    ptyManager.create(id, { cwd, cols, rows }, (data) => {
      const ptyIds = windowPtyMap.get(senderId)
      const targetWebContents = electronWebContents.fromId(senderId)

      if (!ptyIds?.has(id) || !targetWebContents || targetWebContents.isDestroyed()) {
        return
      }

      try {
        targetWebContents.send(`pty:data:${id}`, data)
      } catch {
        // Renderer is already tearing down. Ignore late PTY output.
      }
    })
  })

  ipcMain.handle('pty:write', (_, { id, data }) => {
    ptyManager.write(id, data)
  })

  ipcMain.handle('pty:resize', (_, { id, cols, rows }) => {
    ptyManager.resize(id, cols, rows)
  })

  ipcMain.handle('pty:kill', (event, { id }) => {
    ptyManager.kill(id)
    // Remove from tracking
    const ptyIds = windowPtyMap.get(event.sender.id)
    if (ptyIds) ptyIds.delete(id)
  })

  // ─── File system handlers ─────────────────────────────────────────────────

  ipcMain.handle('fs:homedir', () => os.homedir())

  ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      return entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:readfile', async (_, filePath: string) => {
    try {
      return await fs.promises.readFile(filePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:writefile', async (_, filePath: string, content: string) => {
    await fs.promises.writeFile(filePath, content, 'utf-8')
  })

  ipcMain.handle('fs:delete', async (_, targetPath: string) => {
    await fs.promises.rm(targetPath, { recursive: true, force: true })
  })

  ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
    await fs.promises.rename(oldPath, newPath)
  })

  ipcMain.handle('fs:copy', async (_, srcPath: string, destPath: string) => {
    const stat = await fs.promises.stat(srcPath)
    if (stat.isDirectory()) {
      await fs.promises.cp(srcPath, destPath, { recursive: true })
    } else {
      await fs.promises.copyFile(srcPath, destPath)
    }
  })

  ipcMain.handle('fs:showInFolder', (_, targetPath: string) => {
    shell.showItemInFolder(targetPath)
  })

  ipcMain.handle('fs:watch:start', (event, filePath: string) => {
    const senderId = event.sender.id
    const key = watcherKey(senderId, filePath)
    if (fileWatchers.has(key)) return

    try {
      const watcher = fs.watch(filePath, { persistent: false }, () => {
        const targetWebContents = electronWebContents.fromId(senderId)
        if (!targetWebContents || targetWebContents.isDestroyed()) {
          stopWatchingFile(senderId, filePath)
          return
        }
        targetWebContents.send('fs:file-changed', filePath)
      })

      watcher.on('error', () => {
        stopWatchingFile(senderId, filePath)
      })

      fileWatchers.set(key, watcher)
      if (!fileWatchSubscribers.has(senderId)) fileWatchSubscribers.set(senderId, new Set())
      fileWatchSubscribers.get(senderId)!.add(filePath)
    } catch {
      stopWatchingFile(senderId, filePath)
    }
  })

  ipcMain.handle('fs:watch:stop', (event, filePath: string) => {
    stopWatchingFile(event.sender.id, filePath)
  })

  ipcMain.handle('dialog:openFolder', async (event) => {
    const callerWin = getCallerWindow(event)
    if (!callerWin) return null
    const result = await dialog.showOpenDialog(callerWin, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('shell:openExternal', (_, url: string) => {
    shell.openExternal(url)
  })

  app.on('activate', () => {
    const allWindows = managedWindows.filter(w => !w.isDestroyed())
    if (allWindows.length > 0) {
      showAllWindows()
    } else {
      const savedSessions = loadAllSessions()
      const lastSession = savedSessions[savedSessions.length - 1]
      createWindow(lastSession?.id)
    }
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  if (process.platform !== 'darwin') app.quit()
})
