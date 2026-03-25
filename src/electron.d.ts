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
    }
  }
}
