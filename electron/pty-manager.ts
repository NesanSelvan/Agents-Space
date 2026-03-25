import * as pty from 'node-pty'
import * as os from 'os'

interface PtyInstance {
  process: pty.IPty
}

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()

  create(
    id: string,
    options: { cwd: string; cols: number; rows: number },
    onData: (data: string) => void
  ) {
    const shell =
      process.platform === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/zsh'

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || os.homedir(),
      env: process.env as Record<string, string>,
    })

    ptyProcess.onData(onData)
    this.ptys.set(id, { process: ptyProcess })
  }

  write(id: string, data: string) {
    this.ptys.get(id)?.process.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    try {
      this.ptys.get(id)?.process.resize(cols, rows)
    } catch {
      // ignore resize errors
    }
  }

  kill(id: string) {
    const inst = this.ptys.get(id)
    if (inst) {
      try { inst.process.kill() } catch { /* ignore */ }
      this.ptys.delete(id)
    }
  }

  killAll() {
    this.ptys.forEach(inst => {
      try { inst.process.kill() } catch { /* ignore */ }
    })
    this.ptys.clear()
  }
}
