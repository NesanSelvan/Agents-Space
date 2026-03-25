import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { PanelLeftOpen, PanelRightOpen, PanelBottomOpen, LayoutGrid, X, Maximize2 } from 'lucide-react'
import { Tile, useTileStore } from '../store/tileStore'

const SIDEBAR_W = 240

// Fallback order: if the preferred zone is occupied, try the next best option
const ZONE_FALLBACKS: Record<string, string[]> = {
  left:   ['right', 'tl', 'tr', 'bl', 'br', 'top', 'bottom'],
  right:  ['left',  'tr', 'tl', 'br', 'bl', 'top', 'bottom'],
  bottom: ['top',   'bl', 'br', 'left', 'right'],
  top:    ['bottom','tl', 'tr', 'left', 'right'],
  tl:     ['tr',   'bl', 'br', 'left', 'top'],
  tr:     ['tl',   'br', 'bl', 'right','top'],
  bl:     ['br',   'tl', 'tr', 'left', 'bottom'],
  br:     ['bl',   'tr', 'tl', 'right','bottom'],
}

function resolveZone(preferred: string, currentTileId: string): string {
  const occupied = new Set(
    useTileStore.getState().tiles
      .filter(t => t.id !== currentTileId && t.snappedZone)
      .map(t => t.snappedZone as string)
  )
  if (!occupied.has(preferred)) return preferred
  return (ZONE_FALLBACKS[preferred] ?? []).find(z => !occupied.has(z)) ?? preferred
}

function snapToZone(zone: string, viewport: { panX: number; panY: number; zoom: number }) {
  if (!zone) return null
  const cw = window.innerWidth - SIDEBAR_W
  const ch = window.innerHeight
  const p = 8
  const hw = cw / 2, hh = ch / 2
  const toWorld = (sx: number, sy: number, sw: number, sh: number) => ({
    x: (sx - viewport.panX) / viewport.zoom,
    y: (sy - viewport.panY) / viewport.zoom,
    width:  sw / viewport.zoom,
    height: sh / viewport.zoom,
  })
  const zones: Record<string, ReturnType<typeof toWorld>> = {
    tl:     toWorld(p,      p,      hw-p*1.5, hh-p*1.5),
    tr:     toWorld(hw+p/2, p,      hw-p*1.5, hh-p*1.5),
    bl:     toWorld(p,      hh+p/2, hw-p*1.5, hh-p*1.5),
    br:     toWorld(hw+p/2, hh+p/2, hw-p*1.5, hh-p*1.5),
    left:   toWorld(p,      p,      hw-p*1.5, ch-p*2),
    right:  toWorld(hw+p/2, p,      hw-p*1.5, ch-p*2),
    top:    toWorld(p,      p,      cw-p*2,   hh-p*1.5),
    bottom: toWorld(p,      hh+p/2, cw-p*2,   hh-p*1.5),
  }
  return zones[zone] ?? null
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Pane { id: string; cwd: string }
type SplitDir = 'h' | 'v'

interface Props { tile: Tile; onFocus: () => void }
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_W = 320
const MIN_H = 200
const TITLEBAR_H = 34
const PANEBAR_H = 26

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

// ─── Single terminal pane ─────────────────────────────────────────────────────
function TerminalPane({
  pane,
  width,
  height,
  isActive,
  canClose,
  onActivate,
  onClose,
  onSplitH,
  onSplitV,
}: {
  pane: Pane
  width: number
  height: number
  isActive: boolean
  canClose: boolean
  onActivate: () => void
  onClose: () => void
  onSplitH: () => void
  onSplitV: () => void
}) {
  const termRef = useRef<HTMLDivElement>(null)
  const termInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)

  // Boot terminal
  useEffect(() => {
    if (!termRef.current || termInstance.current) return
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: true,
      theme: {
        background: '#0d0d0d', foreground: '#e0e0e0', cursor: '#e0e0e0',
        selectionBackground: 'rgba(255,255,255,0.15)',
        black: '#1a1a1a', brightBlack: '#555',
        red: '#ff5f5f',   brightRed: '#ff8c8c',
        green: '#5fff87', brightGreen: '#87ffaf',
        yellow: '#ffd75f',brightYellow: '#ffff87',
        blue: '#5f87ff',  brightBlue: '#87afff',
        magenta: '#d75faf',brightMagenta: '#ff87d7',
        cyan: '#5fd7d7',  brightCyan: '#87ffff',
        white: '#e0e0e0', brightWhite: '#ffffff',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(termRef.current)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch { /* fallback */ }
    fitAddon.current = fit
    termInstance.current = term
    // Delay initial fit so flexbox layout is complete before measuring
    setTimeout(() => {
      try { fit.fit() } catch { /* ignore */ }
      window.electronAPI.ptyCreate({ id: pane.id, cwd: pane.cwd, cols: term.cols, rows: term.rows })
    }, 50)
    term.onData(data => window.electronAPI.ptyWrite(pane.id, data))
    const cleanup = window.electronAPI.onPtyData(pane.id, data => term.write(data))
    return () => {
      cleanup()
      window.electronAPI.ptyKill(pane.id)
      term.dispose()
      termInstance.current = null
      fitAddon.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id])

  // Refit on resize
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        fitAddon.current?.fit()
        const term = termInstance.current
        if (term) window.electronAPI.ptyResize(pane.id, term.cols, term.rows)
      } catch { /* ignore */ }
    }, 50)
    return () => clearTimeout(t)
  }, [width, height, pane.id])

  return (
    <div
      className="flex flex-col flex-1 min-w-0 min-h-0"
      style={{ background: '#0d0d0d' }}
      onMouseDown={onActivate}
    >
      {/* Pane toolbar */}
      <div
        className="group flex items-center justify-between px-2 flex-shrink-0 border-b select-none"
        style={{
          height: PANEBAR_H,
          background: isActive ? '#1a1a1a' : '#111',
          borderColor: isActive ? 'rgba(99,179,237,0.3)' : 'rgba(255,255,255,0.06)',
        }}
      >
        <span className="text-[10px] text-white/30 truncate">
          {pane.cwd.split('/').pop() || pane.cwd}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={e => e.stopPropagation()}>
          <button
            className="p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
            title="Split Right"
            onClick={onSplitH}
          >
            <PanelRightOpen size={11} />
          </button>
          <button
            className="p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
            title="Split Down"
            onClick={onSplitV}
          >
            <PanelBottomOpen size={11} />
          </button>
          {canClose && (
            <button
              className="p-0.5 rounded hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-colors"
              title="Close pane"
              onClick={onClose}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* xterm — position:relative required by xterm.js to contain the WebGL canvas */}
      <div
        ref={termRef}
        className="flex-1 min-h-0"
        style={{ position: 'relative', overflow: 'hidden', background: '#0d0d0d' }}
        onWheel={e => e.stopPropagation()}
      />
    </div>
  )
}

// ─── Pane split container (recursive) ────────────────────────────────────────
function PaneContainer({
  panes,
  splitDir,
  tileWidth,
  tileHeight,
  activePaneId,
  onActivate,
  onClose,
  onSplit,
}: {
  panes: Pane[]
  splitDir: SplitDir
  tileWidth: number
  tileHeight: number
  activePaneId: string
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onSplit: (id: string, dir: SplitDir) => void
}) {
  const isHorizontal = splitDir === 'h'
  const paneW = isHorizontal ? Math.floor(tileWidth / panes.length) : tileWidth
  const paneH = isHorizontal ? tileHeight : Math.floor(tileHeight / panes.length)

  return (
    <div
      className={`flex flex-1 min-h-0 ${isHorizontal ? 'flex-row' : 'flex-col'}`}
    >
      {panes.map((pane, i) => (
        <div key={pane.id} className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} flex-1 min-w-0 min-h-0`}>
          {i > 0 && (
            <div
              className={isHorizontal ? 'w-px flex-shrink-0' : 'h-px flex-shrink-0'}
              style={{ background: 'rgba(255,255,255,0.08)' }}
            />
          )}
          <TerminalPane
            pane={pane}
            width={paneW}
            height={paneH - PANEBAR_H}
            isActive={activePaneId === pane.id}
            canClose={panes.length > 1}
            onActivate={() => onActivate(pane.id)}
            onClose={() => onClose(pane.id)}
            onSplitH={() => onSplit(pane.id, 'h')}
            onSplitV={() => onSplit(pane.id, 'v')}
          />
        </div>
      ))}
    </div>
  )
}

// ─── TerminalTile ─────────────────────────────────────────────────────────────
export default function TerminalTile({ tile, onFocus }: Props) {
  const [panes, setPanes] = useState<Pane[]>([{ id: tile.id, cwd: tile.cwd }])
  const [splitDir, setSplitDir] = useState<SplitDir>('h')
  const [activePaneId, setActivePaneId] = useState(tile.id)
  const [isInteracting, setIsInteracting] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [showGreenMenu, setShowGreenMenu] = useState(false)
  const prevHeightRef = useRef(tile.height)
  const { updateTile, removeTile, focusedId, viewport } = useTileStore()
  const isFocused = focusedId === tile.id

  // Close green menu on outside click
  useEffect(() => {
    if (!showGreenMenu) return
    const close = () => setShowGreenMenu(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [showGreenMenu])

  const handleMinimize = useCallback(() => {
    if (isMinimized) {
      updateTile(tile.id, { height: prevHeightRef.current })
      setIsMinimized(false)
    } else {
      prevHeightRef.current = tile.height
      updateTile(tile.id, { height: TITLEBAR_H })
      setIsMinimized(true)
    }
  }, [isMinimized, tile.height, tile.id, updateTile])

  const handleFullScreen = useCallback(() => {
    const cw = window.innerWidth - SIDEBAR_W
    const ch = window.innerHeight
    const p = 8
    updateTile(tile.id, {
      x: (-viewport.panX + p) / viewport.zoom,
      y: (-viewport.panY + p) / viewport.zoom,
      width: (cw - p * 2) / viewport.zoom,
      height: (ch - p * 2) / viewport.zoom,
      snappedZone: null,
    })
    if (isMinimized) setIsMinimized(false)
  }, [viewport, tile.id, updateTile, isMinimized])

  const handleSplit = useCallback((fromId: string, dir: SplitDir) => {
    const newId = `pane-${Date.now()}`
    const fromPane = panes.find(p => p.id === fromId)
    const newPaneCount = panes.length + 1
    // Auto-expand tile if panes would be too small
    if (dir === 'v') {
      const minH = TITLEBAR_H + newPaneCount * (MIN_H + PANEBAR_H)
      if (tile.height < minH) updateTile(tile.id, { height: minH })
      if (isMinimized) { setIsMinimized(false); prevHeightRef.current = minH }
    } else {
      const minW = newPaneCount * MIN_W
      if (tile.width < minW) updateTile(tile.id, { width: minW })
    }
    setPanes(prev => {
      const idx = prev.findIndex(p => p.id === fromId)
      const next = [...prev]
      next.splice(idx + 1, 0, { id: newId, cwd: fromPane?.cwd ?? tile.cwd })
      return next
    })
    setSplitDir(dir)
    setActivePaneId(newId)
  }, [panes, tile.cwd, tile.height, tile.width, tile.id, updateTile, isMinimized])

  const handleClose = useCallback((id: string) => {
    setPanes(prev => {
      const next = prev.filter(p => p.id !== id)
      if (next.length === 0) { removeTile(tile.id); return prev }
      setActivePaneId(p => p === id ? next[next.length - 1].id : p)
      return next
    })
  }, [tile.id, removeTile])

  // Drag title bar — free position only, no auto-snap
  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault(); onFocus(); setIsInteracting(true)
    const sx = e.clientX, sy = e.clientY, tx = tile.x, ty = tile.y
    const onMove = (ev: MouseEvent) => {
      updateTile(tile.id, { x: tx + ev.clientX - sx, y: ty + ev.clientY - sy })
    }
    const onUp = () => {
      setIsInteracting(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [tile.x, tile.y, tile.id, onFocus, updateTile])

  // Resize handles
  const onResizeMouseDown = useCallback((dir: ResizeDir) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsInteracting(true)
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

  const bodyH = tile.height - TITLEBAR_H

  return (
    <div
      className="absolute rounded-xl overflow-hidden flex flex-col"
      style={{
        left: tile.x, top: tile.y, width: tile.width, height: tile.height,
        zIndex: tile.zIndex, willChange: 'transform', background: '#0d0d0d',
        border: isFocused ? '1.5px solid rgba(99,179,237,0.7)' : '1.5px solid rgba(255,255,255,0.08)',
        boxShadow: isFocused ? '0 0 0 3px rgba(99,179,237,0.12), 0 20px 60px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.4)',
      }}
      onMouseDown={() => onFocus()}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 border-b border-white/[0.08] select-none flex-shrink-0"
        style={{ height: TITLEBAR_H, background: isFocused ? '#1e2a35' : '#161616', cursor: 'grab' }}
        onMouseDown={onTitleMouseDown}
      >
        {/* Traffic lights */}
        <div className="relative flex items-center gap-1.5 flex-shrink-0" onMouseDown={e => e.stopPropagation()}>
          <button className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-125"
            onClick={() => removeTile(tile.id)} />
          <button className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-125"
            onClick={handleMinimize}
            title={isMinimized ? 'Restore' : 'Minimize'} />
          <button className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-125"
            onClick={e => { e.stopPropagation(); setShowGreenMenu(v => !v) }}
            title="Options" />
          {showGreenMenu && (
            <div
              className="absolute top-5 left-0 z-[9999] rounded-lg py-1 shadow-2xl"
              style={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)', minWidth: 148 }}
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-white/60 hover:bg-white/10 hover:text-white/90 flex items-center gap-2 transition-colors"
                onClick={() => {
                  const zone = resolveZone('left', tile.id)
                  const s = snapToZone(zone, useTileStore.getState().viewport)
                  if (s) updateTile(tile.id, { ...s, snappedZone: zone })
                  setShowGreenMenu(false)
                }}
              >
                <PanelLeftOpen size={11} /> Left Full
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-white/60 hover:bg-white/10 hover:text-white/90 flex items-center gap-2 transition-colors"
                onClick={() => {
                  const zone = resolveZone('bottom', tile.id)
                  const s = snapToZone(zone, useTileStore.getState().viewport)
                  if (s) updateTile(tile.id, { ...s, snappedZone: zone })
                  setShowGreenMenu(false)
                }}
              >
                <PanelBottomOpen size={11} /> Bottom Full
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-white/60 hover:bg-white/10 hover:text-white/90 flex items-center gap-2 transition-colors"
                onClick={() => {
                  const zone = resolveZone('tl', tile.id)
                  const s = snapToZone(zone, useTileStore.getState().viewport)
                  if (s) updateTile(tile.id, { ...s, snappedZone: zone })
                  setShowGreenMenu(false)
                }}
              >
                <LayoutGrid size={11} /> Left Top
              </button>
              <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-white/60 hover:bg-white/10 hover:text-white/90 flex items-center gap-2 transition-colors"
                onClick={() => { handleFullScreen(); setShowGreenMenu(false) }}
              >
                <Maximize2 size={11} /> Full Screen
              </button>
            </div>
          )}
        </div>
        <span className="flex-1 text-center text-xs text-white/30 truncate px-2">{tile.title}</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Panes */}
      {!isMinimized && (
        <PaneContainer
          panes={panes}
          splitDir={splitDir}
          tileWidth={tile.width}
          tileHeight={bodyH}
          activePaneId={activePaneId}
          onActivate={setActivePaneId}
          onClose={handleClose}
          onSplit={handleSplit}
        />
      )}

      {!isMinimized && isInteracting && <div className="absolute inset-0" style={{ zIndex: 9999 }} />}

      {!isMinimized && RESIZE_HANDLES.map(({ dir, style }) => (
        <div key={dir} className="absolute z-50" style={style} onMouseDown={onResizeMouseDown(dir)} />
      ))}
    </div>
  )
}
