export {}

declare global {
  interface Window {
    electronAPI: {
      // PTY
      ptyCreate: (opts: { id: string; cwd: string; cols: number; rows: number }) => Promise<void>
      ptyWrite: (id: string, data: string) => Promise<void>
      ptyResize: (id: string, cols: number, rows: number) => Promise<void>
      ptyKill: (id: string) => Promise<void>
      onPtyData: (id: string, cb: (data: string) => void) => () => void
      // File system
      homedir: () => Promise<string>
      readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>
      openFolder: () => Promise<string | null>
      openExternal: (url: string) => Promise<void>
      readFile: (filePath: string) => Promise<string | null>
      writeFile: (filePath: string, content: string) => Promise<void>
      deleteFile: (targetPath: string) => Promise<void>
      renameFile: (oldPath: string, newPath: string) => Promise<void>
      copyFile: (srcPath: string, destPath: string) => Promise<void>
      showInFolder: (targetPath: string) => Promise<void>
      watchFile: (filePath: string) => Promise<void>
      unwatchFile: (filePath: string) => Promise<void>
      onFileChanged: (cb: (filePath: string) => void) => () => void
      // Session persistence
      sessionGetId: () => Promise<string | null>
      sessionLoad: () => Promise<Record<string, unknown> | null>
      sessionSave: (data: Record<string, unknown>) => Promise<void>
      sessionLoadAll: () => Promise<Array<{ id: string; cwd: string; tiles: unknown[]; maxZIndex: number; viewport: { panX: number; panY: number; zoom: number }; fileTreeExpandedPaths?: string[] }>>
      // Recent folders
      recentsLoad: () => Promise<string[]>
      recentsAdd: (folderPath: string) => Promise<void>
      // Menu events
      onMenuOpenFolder: (cb: (folderPath: string) => void) => () => void
    }
  }
}
