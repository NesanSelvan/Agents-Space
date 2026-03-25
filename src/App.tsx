import { useState, useEffect } from 'react'
import FileTree from './components/FileTree'
import Canvas from './components/Canvas'

export default function App() {
  const [cwd, setCwd] = useState<string>('')
  const isMac = navigator.userAgent.includes('Mac')

  useEffect(() => {
    window.electronAPI.homedir().then(setCwd)
  }, [])

  // Listen for "Open Folder" from the menu bar
  useEffect(() => {
    const cleanup = window.electronAPI.onMenuOpenFolder((folderPath) => {
      setCwd(folderPath)
    })
    return cleanup
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f0f0f]">
      {/* Left sidebar — file tree */}
      <div
        className="flex-shrink-0 flex flex-col border-r border-white/20 bg-[#141414]"
        style={{ width: 240 }}
      >
        {/* macOS traffic-light spacer */}
        {isMac && <div style={{ height: 48 }} />}
        <FileTree rootPath={cwd} onCwdChange={setCwd} />
      </div>

      {/* Right — infinite canvas */}
      <div className="flex-1 overflow-hidden relative">
        <Canvas cwd={cwd} />
      </div>
    </div>
  )
}
