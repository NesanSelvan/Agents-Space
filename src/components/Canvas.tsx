import { useRef, useState, useCallback, useEffect } from 'react'
import { useTileStore } from '../store/tileStore'
import TerminalTile from './TerminalTile'
import FileTile from './FileTile'

interface Viewport {
  panX: number
  panY: number
  zoom: number
}

const ZOOM_MIN = 0.33
const ZOOM_MAX = 1.0

export default function Canvas({ cwd }: { cwd: string }) {
  const storeViewport = useTileStore.getState().viewport
  const [viewport, setViewport] = useState<Viewport>(storeViewport)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [showZoom, setShowZoom] = useState(false)
  const panStart = useRef<{ mx: number; my: number; panX: number; panY: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { tiles, addTile, bringToFront, clearFocus, setViewport: syncViewport, snapZone, snapLabel } = useTileStore()

  // Space key → pan cursor
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement === document.body) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const startPan = useCallback(
    (e: React.MouseEvent) => {
      // Click on bare canvas → deselect
      if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
        clearFocus()
      }
      if (e.button === 1 || (spaceDown && e.button === 0)) {
        e.preventDefault()
        setIsPanning(true)
        panStart.current = { mx: e.clientX, my: e.clientY, panX: viewport.panX, panY: viewport.panY }
      }
    },
    [spaceDown, viewport.panX, viewport.panY, clearFocus]
  )

  const movePan = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStart.current) return
      setViewport(v => ({
        ...v,
        panX: panStart.current!.panX + e.clientX - panStart.current!.mx,
        panY: panStart.current!.panY + e.clientY - panStart.current!.my,
      }))
    },
    [isPanning]
  )

  const stopPan = useCallback(() => {
    setIsPanning(false)
    panStart.current = null
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-terminal-tile="true"]') || target?.closest('.xterm')) {
      return
    }

    // Ctrl/Cmd + scroll → zoom
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setViewport(v => {
        const factor = e.deltaY < 0 ? 1.08 : 0.92
        const newZoom = Math.min(Math.max(v.zoom * factor, ZOOM_MIN), ZOOM_MAX)
        // Zoom toward cursor position
        const rect = canvasRef.current!.getBoundingClientRect()
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        const panX = cx - (cx - v.panX) * (newZoom / v.zoom)
        const panY = cy - (cy - v.panY) * (newZoom / v.zoom)
        return { panX, panY, zoom: newZoom }
      })
      // Show zoom indicator briefly
      setShowZoom(true)
      if (zoomTimer.current) clearTimeout(zoomTimer.current)
      zoomTimer.current = setTimeout(() => setShowZoom(false), 1000)
    } else {
      // Scroll → pan
      setViewport(v => ({ ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY }))
    }
  }, [])

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only trigger on bare canvas, not on tiles
      if (e.target !== canvasRef.current && !(e.target as HTMLElement).classList.contains('canvas-bg')) return
      const rect = canvasRef.current!.getBoundingClientRect()
      const x = (e.clientX - rect.left - viewport.panX) / viewport.zoom
      const y = (e.clientY - rect.top - viewport.panY) / viewport.zoom
      addTile(x, y, cwd)
    },
    [viewport, cwd, addTile]
  )

  // Sync viewport to store so tiles can use it for snap
  useEffect(() => { syncViewport(viewport) }, [viewport, syncViewport])

  const cursor = spaceDown ? (isPanning ? 'grabbing' : 'grab') : 'default'

  // Snap preview overlay geometry
  const snapStyle = (): React.CSSProperties => {
    if (!snapZone) return { display: 'none' }
    const h = '50%', w = '50%', full = '100%'
    const map: Record<string, React.CSSProperties> = {
      left:   { left: 0, top: 0, width: w, height: full },
      right:  { right: 0, top: 0, width: w, height: full },
      top:    { left: 0, top: 0, width: full, height: h },
      bottom: { left: 0, bottom: 0, width: full, height: h },
      tl:     { left: 0, top: 0, width: w, height: h },
      tr:     { right: 0, top: 0, width: w, height: h },
      bl:     { left: 0, bottom: 0, width: w, height: h },
      br:     { right: 0, bottom: 0, width: w, height: h },
    }
    return map[snapZone] ?? { display: 'none' }
  }

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-hidden canvas-bg"
      style={{ cursor, background: '#0f0f0f' }}
      onMouseDown={startPan}
      onMouseMove={movePan}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      {/* Dot grid — GPU layer */}
      <div
        className="absolute inset-0 pointer-events-none canvas-bg"
        style={{
          backgroundImage: 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)',
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
          backgroundPosition: `${viewport.panX % (24 * viewport.zoom)}px ${viewport.panY % (24 * viewport.zoom)}px`,
        }}
      />

      {/* Tiles container — single GPU-accelerated transform */}
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {tiles.map(tile =>
          tile.type === 'file' ? (
            <FileTile key={tile.id} tile={tile} onFocus={() => bringToFront(tile.id)} />
          ) : (
            <TerminalTile key={tile.id} tile={tile} onFocus={() => bringToFront(tile.id)} />
          )
        )}
      </div>

      {/* Empty state hint */}
      {tiles.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
          <div className="text-4xl">⌨️</div>
          <p className="text-white/70 text-sm font-medium">Double-click anywhere to open a terminal</p>
          <p className="text-white/40 text-xs">Space + drag to pan &nbsp;·&nbsp; Ctrl+scroll to zoom</p>
        </div>
      )}

      {/* Snap preview */}
      {snapZone && (
        <div
          className="absolute pointer-events-none rounded-xl transition-all duration-100 flex items-center justify-center"
          style={{
            ...snapStyle(),
            background: 'rgba(99,179,237,0.07)',
            border: '2px solid rgba(99,179,237,0.45)',
            zIndex: 9998,
          }}
        >
          {snapLabel && (
            <span className="text-xs font-medium px-3 py-1 rounded-full"
              style={{ background: 'rgba(99,179,237,0.2)', color: 'rgba(99,179,237,0.9)' }}>
              {snapLabel}
            </span>
          )}
        </div>
      )}

      {/* Zoom indicator */}
      {showZoom && (
        <div className="absolute bottom-4 right-4 bg-black/60 text-white/60 text-xs px-2 py-1 rounded pointer-events-none">
          {Math.round(viewport.zoom * 100)}%
        </div>
      )}
    </div>
  )
}
