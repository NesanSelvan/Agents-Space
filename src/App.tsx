import { useState, useEffect, useCallback, useRef } from 'react'
import FileTree from './components/FileTree'
import Canvas from './components/Canvas'
import { useTileStore } from './store/tileStore'

export default function App() {
  const [cwd, setCwd] = useState<string>('')
  const [expandedPaths, setExpandedPaths] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const isMac = navigator.userAgent.includes('Mac')
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  const expandedPathsRef = useRef(expandedPaths)
  expandedPathsRef.current = expandedPaths

  // Restore this window's session on startup
  useEffect(() => {
    (async () => {
      const session = await window.electronAPI.sessionLoad()
      if (session) {
        setCwd((session.cwd as string) || await window.electronAPI.homedir())
        setExpandedPaths(Array.isArray(session.fileTreeExpandedPaths) ? session.fileTreeExpandedPaths as string[] : [])
        if (Array.isArray(session.tiles) && session.tiles.length > 0) {
          useTileStore.getState().restoreSession(session as any)
        }
      } else {
        // No session — use the most recent folder, or fall back to homedir
        const recents = await window.electronAPI.recentsLoad()
        setCwd(recents.length > 0 ? recents[0] : await window.electronAPI.homedir())
      }
      setReady(true)
    })()
  }, [])

  // Save this window's session
  const saveSession = useCallback(() => {
    const data = {
      ...useTileStore.getState().getSessionData(cwdRef.current),
      fileTreeExpandedPaths: expandedPathsRef.current.filter(path => path === cwdRef.current || path.startsWith(`${cwdRef.current}/`)),
    }
    window.electronAPI.sessionSave(data as any)
  }, [])

  useEffect(() => {
    window.addEventListener('beforeunload', saveSession)
    return () => window.removeEventListener('beforeunload', saveSession)
  }, [saveSession])

  // Persist session state shortly after tile/canvas changes so terminal ids are
  // up to date even if the window is closed before the periodic autosave fires.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const unsubscribe = useTileStore.subscribe(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        saveSession()
        timer = null
      }, 250)
    })

    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [saveSession])

  // Auto-save session periodically
  useEffect(() => {
    const interval = setInterval(saveSession, 5000)
    return () => clearInterval(interval)
  }, [saveSession])

  // Persist folder changes immediately so reopening restores the same sidebar root.
  useEffect(() => {
    if (!ready || !cwd) return
    saveSession()
  }, [cwd, ready, saveSession])

  // Track folder changes as recents
  const handleCwdChange = useCallback((newCwd: string) => {
    setCwd(newCwd)
    setExpandedPaths([])
    window.electronAPI.recentsAdd(newCwd)
  }, [])

  // Listen for "Open Folder" from the menu bar
  useEffect(() => {
    const cleanup = window.electronAPI.onMenuOpenFolder((folderPath) => {
      handleCwdChange(folderPath)
    })
    return cleanup
  }, [handleCwdChange])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f0f0f]">
      {/* Left sidebar — file tree */}
      <div
        className="flex-shrink-0 flex flex-col border-r border-white/20 bg-[#141414]"
        style={{ width: 240 }}
      >
        {/* macOS traffic-light spacer */}
        {isMac && <div style={{ height: 48 }} />}
        <FileTree
          rootPath={cwd}
          onCwdChange={handleCwdChange}
          expandedPaths={expandedPaths}
          onExpandedPathsChange={setExpandedPaths}
        />
      </div>

      {/* Right — infinite canvas */}
      <div className="flex-1 overflow-hidden relative">
        {ready && <Canvas cwd={cwd} />}
      </div>
    </div>
  )
}
