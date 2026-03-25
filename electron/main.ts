import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
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

function createWindow() {
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

app.whenReady().then(() => {
  const win = createWindow()

  // ─── Application menu ─────────────────────────────────────────────────────
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
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
            const result = await dialog.showOpenDialog(win, {
              properties: ['openDirectory'],
            })
            if (!result.canceled && result.filePaths[0]) {
              win.webContents.send('menu:open-folder', result.filePaths[0])
            }
          },
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
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  // ─── PTY handlers ─────────────────────────────────────────────────────────

  ipcMain.handle('pty:create', (_, { id, cwd, cols, rows }) => {
    ptyManager.create(id, { cwd, cols, rows }, (data) => {
      if (!win.isDestroyed()) {
        win.webContents.send(`pty:data:${id}`, data)
      }
    })
  })

  ipcMain.handle('pty:write', (_, { id, data }) => {
    ptyManager.write(id, data)
  })

  ipcMain.handle('pty:resize', (_, { id, cols, rows }) => {
    ptyManager.resize(id, cols, rows)
  })

  ipcMain.handle('pty:kill', (_, { id }) => {
    ptyManager.kill(id)
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

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('shell:openExternal', (_, url: string) => {
    shell.openExternal(url)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  if (process.platform !== 'darwin') app.quit()
})
