import { useRef, useEffect, useCallback, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Tile, useTileStore } from '../store/tileStore'

interface Props {
  tile: Tile
  onFocus: () => void
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_W = 320
const MIN_H = 200
const TITLEBAR_H = 36

const RESIZE_HANDLES: { dir: ResizeDir; style: React.CSSProperties }[] = [
  { dir: 'n',  style: { top: 0, left: 8, right: 8, height: 5, cursor: 'ns-resize' } },
  { dir: 's',  style: { bottom: 0, left: 8, right: 8, height: 5, cursor: 'ns-resize' } },
  { dir: 'e',  style: { right: 0, top: 8, bottom: 8, width: 5, cursor: 'ew-resize' } },
  { dir: 'w',  style: { left: 0, top: 8, bottom: 8, width: 5, cursor: 'ew-resize' } },
  { dir: 'ne', style: { top: 0, right: 0, width: 10, height: 10, cursor: 'ne-resize' } },
  { dir: 'nw', style: { top: 0, left: 0, width: 10, height: 10, cursor: 'nw-resize' } },
  { dir: 'se', style: { bottom: 0, right: 0, width: 10, height: 10, cursor: 'se-resize' } },
  { dir: 'sw', style: { bottom: 0, left: 0, width: 10, height: 10, cursor: 'sw-resize' } },
]

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', kt: 'kotlin', swift: 'swift',
    dart: 'dart', html: 'html', css: 'css', scss: 'scss', json: 'json',
    jsonc: 'json', md: 'markdown', mdx: 'markdown', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql',
    xml: 'xml', txt: 'plaintext',
  }
  return map[ext] ?? 'plaintext'
}

export default function FileTile({ tile, onFocus }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const [isInteracting, setIsInteracting] = useState(false)
  const valueRef = useRef<string>('')
  const { updateTile, removeTile, focusedId } = useTileStore()
  const isFocused = focusedId === tile.id

  // Load file
  useEffect(() => {
    if (!tile.filePath) return
    window.electronAPI.readFile(tile.filePath).then(data => {
      setContent(data ?? '')
      valueRef.current = data ?? ''
    })
  }, [tile.filePath])

  // Save with Cmd/Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && isFocused) {
        e.preventDefault()
        if (tile.filePath) {
          window.electronAPI.writeFile(tile.filePath, valueRef.current).then(() => setSaved(true))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFocused, tile.filePath])

  // Drag title bar
  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    onFocus()
    setIsInteracting(true)
    const sx = e.clientX, sy = e.clientY, tx = tile.x, ty = tile.y
    const onMove = (ev: MouseEvent) => updateTile(tile.id, { x: tx + ev.clientX - sx, y: ty + ev.clientY - sy })
    const onUp = () => { setIsInteracting(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [tile.x, tile.y, tile.id, onFocus, updateTile])

  // Resize
  const onResizeMouseDown = useCallback((dir: ResizeDir) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setIsInteracting(true)
    const s = { mx: e.clientX, my: e.clientY, tx: tile.x, ty: tile.y, tw: tile.width, th: tile.height }
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - s.mx, dy = ev.clientY - s.my
      let { tx: x, ty: y, tw: w, th: h } = s
      if (dir.includes('e')) w = Math.max(MIN_W, s.tw + dx)
      if (dir.includes('s')) h = Math.max(MIN_H, s.th + dy)
      if (dir.includes('w')) { w = Math.max(MIN_W, s.tw - dx); x = s.tx + (s.tw - w) }
      if (dir.includes('n')) { h = Math.max(MIN_H, s.th - dy); y = s.ty + (s.th - h) }
      updateTile(tile.id, { x, y, width: w, height: h })
    }
    const onUp = () => { setIsInteracting(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [tile, updateTile])

  const language = getLanguage(tile.filePath ?? '')

  return (
    <div
      className="absolute rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: tile.x, top: tile.y, width: tile.width, height: tile.height,
        zIndex: tile.zIndex, willChange: 'transform', background: '#0d0d0d',
        border: isFocused ? '1.5px solid rgba(99,179,237,0.7)' : '1.5px solid rgba(255,255,255,0.08)',
        boxShadow: isFocused ? '0 0 0 3px rgba(99,179,237,0.12), 0 20px 60px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.4)',
      }}
      onMouseDown={onFocus}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 border-b border-white/[0.08] select-none flex-shrink-0"
        style={{ height: TITLEBAR_H, background: isFocused ? '#1e2a35' : '#161616', cursor: 'grab' }}
        onMouseDown={onTitleMouseDown}
      >
        <button
          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-125 flex-shrink-0"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => removeTile(tile.id)}
        />
        <div className="w-3 h-3 rounded-full bg-[#febc2e] flex-shrink-0" />
        <div className="w-3 h-3 rounded-full bg-[#28c840] flex-shrink-0" />
        <span className="flex-1 text-center text-xs text-white/40 truncate px-2">
          {tile.title}{!saved ? ' •' : ''}
        </span>
        <span className="text-[10px] text-white/20 flex-shrink-0">{language}</span>
      </div>

      {/* Monaco Editor */}
      <div style={{ height: tile.height - TITLEBAR_H }} onWheel={e => e.stopPropagation()}>
        {content !== null ? (
          <Editor
            height="100%"
            language={language}
            value={content}
            theme="vs-dark"
            onChange={val => { valueRef.current = val ?? ''; setSaved(false) }}
            options={{
              fontSize: 13,
              fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, monospace',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              padding: { top: 8, bottom: 8 },
              overviewRulerLanes: 0,
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            Loading…
          </div>
        )}
      </div>

      {isInteracting && <div className="absolute inset-0" style={{ zIndex: 9999 }} />}

      {RESIZE_HANDLES.map(({ dir, style }) => (
        <div key={dir} className="absolute z-50" style={style} onMouseDown={onResizeMouseDown(dir)} />
      ))}
    </div>
  )
}
