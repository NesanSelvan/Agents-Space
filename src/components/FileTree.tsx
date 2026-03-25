import { useState, useEffect, useCallback, useRef } from 'react'
import { useTileStore } from '../store/tileStore'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FilePlus,
  FolderPlus,
  RotateCcw,
} from 'lucide-react'

interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

// ── Context menu state ────────────────────────────────────────────────────────
interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry
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

// ── Inline rename input ───────────────────────────────────────────────────────
function InlineInput({
  initialValue,
  onSubmit,
  onCancel,
  depth,
}: {
  initialValue: string
  onSubmit: (val: string) => void
  onCancel: () => void
  depth: number
}) {
  const [value, setValue] = useState(initialValue)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Select filename without extension
    const dot = initialValue.lastIndexOf('.')
    ref.current?.setSelectionRange(0, dot > 0 ? dot : initialValue.length)
  }, [initialValue])

  return (
    <div style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: 8 }} className="py-[2px]">
      <input
        ref={ref}
        autoFocus
        className="w-full bg-white/10 text-xs text-white/90 px-1.5 py-[2px] rounded border border-blue-500/50 outline-none placeholder-white/30"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { const v = value.trim(); if (v) onSubmit(v); else onCancel() }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => { const v = value.trim(); if (v && v !== initialValue) onSubmit(v); else onCancel() }}
      />
    </div>
  )
}

// ── Single tree node ──────────────────────────────────────────────────────────
function TreeNode({
  entry,
  depth,
  onCwdChange,
  expandedPaths,
  onToggleExpanded,
  onContextMenu,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  creatingInPath,
  onCreateSubmit,
  onCreateCancel,
}: {
  entry: FileEntry
  depth: number
  onCwdChange: (p: string) => void
  expandedPaths: string[]
  onToggleExpanded: (path: string, expanded: boolean) => void
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void
  renamingPath: string | null
  onRenameSubmit: (oldPath: string, newName: string) => void
  onRenameCancel: () => void
  creatingInPath: string | null
  onCreateSubmit: (name: string) => void
  onCreateCancel: () => void
}) {
  const [children, setChildren] = useState<FileEntry[]>([])
  const expanded = expandedPaths.includes(entry.path)
  const isHidden = entry.name.startsWith('.')
  const iconColor = getIconColor(entry.name, entry.isDirectory)
  const { addFileTile } = useTileStore()
  const isRenaming = renamingPath === entry.path
  const isCreatingHere = creatingInPath === entry.path

  const loadChildren = useCallback(async () => {
    if (!entry.isDirectory) return
    const raw: FileEntry[] = await window.electronAPI.readDir(entry.path)
    setChildren(
      raw.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    )
  }, [entry.path, entry.isDirectory])

  const toggle = useCallback(async () => {
    if (!entry.isDirectory) {
      addFileTile(entry.path, entry.name)
      return
    }
    if (!expanded) {
      await loadChildren()
    }
    onToggleExpanded(entry.path, !expanded)
  }, [addFileTile, entry, expanded, loadChildren, onToggleExpanded])

  useEffect(() => {
    if (!expanded || children.length > 0 || !entry.isDirectory) return
    void loadChildren()
  }, [children.length, entry.isDirectory, expanded, loadChildren])

  // Auto-sync expanded directories
  useEffect(() => {
    if (!expanded || !entry.isDirectory) return
    const interval = setInterval(loadChildren, 2000)
    return () => clearInterval(interval)
  }, [expanded, entry.isDirectory, loadChildren])

  const icon = entry.isDirectory ? (
    expanded
      ? <FolderOpen size={13} style={{ color: iconColor }} className="flex-shrink-0" />
      : <Folder    size={13} style={{ color: iconColor }} className="flex-shrink-0" />
  ) : (
    <File size={13} style={{ color: iconColor }} className="flex-shrink-0" />
  )

  if (isRenaming) {
    return (
      <InlineInput
        initialValue={entry.name}
        depth={depth}
        onSubmit={newName => onRenameSubmit(entry.path, newName)}
        onCancel={onRenameCancel}
      />
    )
  }

  return (
    <>
      <div
        className={`flex items-center gap-1.5 py-[3px] rounded-md hover:bg-white/10 cursor-pointer
          ${isHidden ? 'opacity-50' : 'opacity-100'}`}
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: 8 }}
        onClick={toggle}
        onContextMenu={e => onContextMenu(e, entry)}
        title={entry.name}
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

      {/* New file input inside this folder */}
      {isCreatingHere && expanded && (
        <InlineInput
          initialValue=""
          depth={depth + 1}
          onSubmit={onCreateSubmit}
          onCancel={onCreateCancel}
        />
      )}

      {expanded &&
        children.map(child => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            onCwdChange={onCwdChange}
            expandedPaths={expandedPaths}
            onToggleExpanded={onToggleExpanded}
            onContextMenu={onContextMenu}
            renamingPath={renamingPath}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            creatingInPath={creatingInPath}
            onCreateSubmit={onCreateSubmit}
            onCreateCancel={onCreateCancel}
          />
        ))}
    </>
  )
}

// ── Context Menu Component ────────────────────────────────────────────────────
function ContextMenu({
  x,
  y,
  entry,
  onClose,
  onOpen,
  onCopyPath,
  onRename,
  onDelete,
  onNewFile,
  onShowInFinder,
}: {
  x: number
  y: number
  entry: FileEntry
  onClose: () => void
  onOpen: () => void
  onCopyPath: () => void
  onRename: () => void
  onDelete: () => void
  onNewFile: () => void
  onShowInFinder: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  // Adjust position so menu doesn't overflow
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 99999,
    minWidth: 160,
    background: '#1e1e1e',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '4px 0',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  }

  const itemClass = 'w-full px-3 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white/90 transition-colors flex items-center gap-2'
  const dangerClass = 'w-full px-3 py-1.5 text-left text-xs text-red-400/80 hover:bg-red-500/15 hover:text-red-400 transition-colors flex items-center gap-2'

  return (
    <div ref={menuRef} style={style}>
      <button className={itemClass} onClick={() => { onOpen(); onClose() }}>
        Open
      </button>
      {entry.isDirectory && (
        <button className={itemClass} onClick={() => { onNewFile(); onClose() }}>
          New File
        </button>
      )}
      <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
      <button className={itemClass} onClick={() => { onCopyPath(); onClose() }}>
        Copy Path
      </button>
      <button className={itemClass} onClick={() => { onRename(); onClose() }}>
        Rename
      </button>
      <button className={itemClass} onClick={() => { onShowInFinder(); onClose() }}>
        Reveal in Finder
      </button>
      <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
      <button className={dangerClass} onClick={() => { onDelete(); onClose() }}>
        Delete
      </button>
    </div>
  )
}

// ── FileTree root ─────────────────────────────────────────────────────────────
export default function FileTree({
  rootPath,
  onCwdChange,
  expandedPaths,
  onExpandedPathsChange,
}: {
  rootPath: string
  onCwdChange: (p: string) => void
  expandedPaths: string[]
  onExpandedPathsChange: (paths: string[]) => void
}) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [creatingInPath, setCreatingInPath] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<FileEntry | null>(null)
  const { addFileTile } = useTileStore()
  const rootName = rootPath.split('/').pop() || rootPath

  const handleToggleExpanded = useCallback((path: string, expanded: boolean) => {
    onExpandedPathsChange(
      expanded
        ? [...new Set([...expandedPaths, path])]
        : expandedPaths.filter(existingPath => existingPath !== path && !existingPath.startsWith(`${path}/`))
    )
  }, [expandedPaths, onExpandedPathsChange])

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

  // Find the deepest expanded folder for "New File" from header button
  const getTargetFolder = useCallback(() => {
    if (expandedPaths.length === 0) return rootPath
    // Sort by depth (deepest first), return the deepest expanded folder
    const sorted = [...expandedPaths].sort((a, b) => b.split('/').length - a.split('/').length)
    return sorted[0]
  }, [expandedPaths, rootPath])

  const handleNewFile = useCallback((targetDir?: string) => {
    const dir = targetDir ?? getTargetFolder()
    // If the dir isn't expanded yet, expand it
    if (dir !== rootPath && !expandedPaths.includes(dir)) {
      onExpandedPathsChange([...new Set([...expandedPaths, dir])])
    }
    setCreatingInPath(dir)
  }, [getTargetFolder, rootPath, expandedPaths, onExpandedPathsChange])

  const handleCreateSubmit = useCallback(async (name: string) => {
    if (!creatingInPath) return
    const filePath = `${creatingInPath}/${name}`
    await window.electronAPI.writeFile(filePath, '')
    setCreatingInPath(null)
    setRefreshKey(k => k + 1)
  }, [creatingInPath])

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }, [])

  const handleRenameSubmit = useCallback(async (oldPath: string, newName: string) => {
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'))
    const newPath = `${parentDir}/${newName}`
    if (newPath !== oldPath) {
      await window.electronAPI.renameFile(oldPath, newPath)
      setRefreshKey(k => k + 1)
    }
    setRenamingPath(null)
  }, [])

  const handleDelete = useCallback(async (entry: FileEntry) => {
    await window.electronAPI.deleteFile(entry.path)
    setShowDeleteConfirm(null)
    setRefreshKey(k => k + 1)
  }, [])

  // Creating at root level when no folders are expanded
  const isCreatingAtRoot = creatingInPath === rootPath

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
            title="New file"
            onClick={() => handleNewFile()}
          >
            <FilePlus size={12} />
          </button>
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
        {/* New file input at root level */}
        {isCreatingAtRoot && (
          <InlineInput
            initialValue=""
            depth={0}
            onSubmit={handleCreateSubmit}
            onCancel={() => setCreatingInPath(null)}
          />
        )}

        {entries.length === 0 && !isCreatingAtRoot ? (
          <p className="text-xs text-white/20 text-center mt-4">Empty folder</p>
        ) : (
          entries.map(entry => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              onCwdChange={onCwdChange}
              expandedPaths={expandedPaths}
              onToggleExpanded={handleToggleExpanded}
              onContextMenu={handleContextMenu}
              renamingPath={renamingPath}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={() => setRenamingPath(null)}
              creatingInPath={creatingInPath}
              onCreateSubmit={handleCreateSubmit}
              onCreateCancel={() => setCreatingInPath(null)}
            />
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onClose={() => setContextMenu(null)}
          onOpen={() => {
            if (contextMenu.entry.isDirectory) {
              handleToggleExpanded(contextMenu.entry.path, !expandedPaths.includes(contextMenu.entry.path))
            } else {
              addFileTile(contextMenu.entry.path, contextMenu.entry.name)
            }
          }}
          onCopyPath={() => navigator.clipboard.writeText(contextMenu.entry.path)}
          onRename={() => setRenamingPath(contextMenu.entry.path)}
          onDelete={() => setShowDeleteConfirm(contextMenu.entry)}
          onNewFile={() => handleNewFile(contextMenu.entry.path)}
          onShowInFinder={() => window.electronAPI.showInFolder(contextMenu.entry.path)}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[99999]"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onMouseDown={() => setShowDeleteConfirm(null)}
        >
          <div
            className="rounded-lg p-4 flex flex-col gap-3 shadow-2xl"
            style={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)', minWidth: 260, maxWidth: 340 }}
            onMouseDown={e => e.stopPropagation()}
          >
            <p className="text-sm text-white/80 text-center">
              Delete "{showDeleteConfirm.name}"?
            </p>
            <p className="text-xs text-white/40 text-center">
              {showDeleteConfirm.isDirectory
                ? 'This folder and all its contents will be permanently deleted.'
                : 'This file will be permanently deleted.'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                className="flex-1 px-3 py-1.5 rounded-md text-xs text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
                onClick={() => setShowDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-3 py-1.5 rounded-md text-xs text-red-400 bg-red-500/15 hover:bg-red-500/30 transition-colors"
                onClick={() => handleDelete(showDeleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
