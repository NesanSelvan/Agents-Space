import { useState, useEffect, useCallback } from 'react'
import { useTileStore } from '../store/tileStore'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FolderPlus,
  RotateCcw,
} from 'lucide-react'

interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

// ── File icon color only (filenames stay white) ───────────────────────────────
function getIconColor(name: string, isDirectory: boolean): string {
  const lower = name.toLowerCase()
  const ext = lower.split('.').pop() ?? ''

  if (lower === '.claude' || lower === 'claude' || lower === 'claude.md') return '#fb923c'
  if (lower === 'codex'   || lower === '.codex')  return '#34d399'
  if (lower === 'gemini'  || lower === '.gemini') return '#60a5fa'
  if (lower === '.git'    || lower === '.gitignore') return '#6b7280'
  if (lower === '.env'    || lower.startsWith('.env.')) return '#fbbf24'
  if (lower === 'readme.md') return '#c084fc'
  if (lower === 'dockerfile') return '#38bdf8'

  if (ext === 'md'   || ext === 'mdx')  return '#c084fc'
  if (ext === 'ts'   || ext === 'tsx')  return '#60a5fa'
  if (ext === 'js'   || ext === 'jsx' || ext === 'mjs') return '#fbbf24'
  if (ext === 'py')   return '#4ade80'
  if (ext === 'json' || ext === 'jsonc') return '#fb923c'
  if (ext === 'css'  || ext === 'scss') return '#f472b6'
  if (ext === 'html' || ext === 'htm')  return '#fb923c'
  if (ext === 'sh'   || ext === 'zsh' || ext === 'bash') return '#86efac'
  if (ext === 'yaml' || ext === 'yml' || ext === 'toml') return '#fbbf24'
  if (ext === 'dart') return '#60a5fa'
  if (ext === 'swift') return '#fb923c'
  if (ext === 'kt')   return '#c084fc'
  if (ext === 'rs')   return '#fb923c'
  if (ext === 'go')   return '#67e8f9'
  if (ext === 'png'  || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'svg' || ext === 'webp')
    return '#34d399'

  return isDirectory ? '#93c5fd' : 'rgba(255,255,255,0.3)'
}

// ── Single tree node ──────────────────────────────────────────────────────────
function TreeNode({
  entry,
  depth,
  onCwdChange,
}: {
  entry: FileEntry
  depth: number
  onCwdChange: (p: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const isHidden = entry.name.startsWith('.')
  const iconColor = getIconColor(entry.name, entry.isDirectory)
  const { addFileTile } = useTileStore()

  const toggle = useCallback(async () => {
    if (!entry.isDirectory) {
      addFileTile(entry.path, entry.name)
      return
    }
    if (!expanded) {
      const raw: FileEntry[] = await window.electronAPI.readDir(entry.path)
      setChildren(
        raw.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      )
    }
    setExpanded(e => !e)
  }, [entry, expanded])

  const icon = entry.isDirectory ? (
    expanded
      ? <FolderOpen size={13} style={{ color: iconColor }} className="flex-shrink-0" />
      : <Folder    size={13} style={{ color: iconColor }} className="flex-shrink-0" />
  ) : (
    <File size={13} style={{ color: iconColor }} className="flex-shrink-0" />
  )

  return (
    <>
      <div
        className={`flex items-center gap-1.5 py-[3px] rounded-md hover:bg-white/10 cursor-pointer
          ${isHidden ? 'opacity-50' : 'opacity-100'}`}
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: 8 }}
        onClick={toggle}
        onDoubleClick={() => entry.isDirectory && onCwdChange(entry.path)}
        title={entry.isDirectory ? 'Double-click to set as cwd' : entry.name}
      >
        {entry.isDirectory ? (
          <span className="text-white/25 w-3 flex-shrink-0">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        {icon}
        <span className="text-xs text-white/80 truncate leading-none">
          {entry.name}
        </span>
      </div>

      {expanded &&
        children.map(child => (
          <TreeNode key={child.path} entry={child} depth={depth + 1} onCwdChange={onCwdChange} />
        ))}
    </>
  )
}

// ── FileTree root ─────────────────────────────────────────────────────────────
export default function FileTree({
  rootPath,
  onCwdChange,
}: {
  rootPath: string
  onCwdChange: (p: string) => void
}) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const rootName = rootPath.split('/').pop() || rootPath

  const load = useCallback(async () => {
    if (!rootPath) return
    const raw: FileEntry[] = await window.electronAPI.readDir(rootPath)
    setEntries(
      raw.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    )
  }, [rootPath])

  useEffect(() => { load() }, [load, refreshKey])

  // Auto-sync: poll for new files every 2 seconds
  useEffect(() => {
    if (!rootPath) return
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [load, rootPath])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/20 flex-shrink-0">
        <span className="text-xs font-semibold text-white/70 truncate max-w-[120px]" title={rootPath}>
          {rootName || 'FILES'}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            title="Refresh"
            onClick={() => setRefreshKey(k => k + 1)}
          >
            <RotateCcw size={12} />
          </button>
          <button
            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            title="Open folder"
            onClick={async () => {
              const folder = await window.electronAPI.openFolder()
              if (folder) onCwdChange(folder)
            }}
          >
            <FolderPlus size={13} />
          </button>
        </div>
      </div>

      {/* Tree scroll area */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {entries.length === 0 ? (
          <p className="text-xs text-white/20 text-center mt-4">Empty folder</p>
        ) : (
          entries.map(entry => (
            <TreeNode key={entry.path} entry={entry} depth={0} onCwdChange={onCwdChange} />
          ))
        )}
      </div>

      {/* Footer — current cwd */}
      <div
        className="px-3 py-2 border-t border-white/[0.06] text-[10px] text-white/20 truncate flex-shrink-0"
        title={rootPath}
      >
        {rootPath}
      </div>
    </div>
  )
}
