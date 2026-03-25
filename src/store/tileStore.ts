import { create } from 'zustand'

export type TileType = 'terminal' | 'file'

export interface Tile {
  id: string
  type: TileType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  cwd: string
  title: string
  filePath?: string
  snappedZone?: SnapZone
}

export interface Viewport { panX: number; panY: number; zoom: number }
export type SnapZone = 'left' | 'right' | 'top' | 'bottom' | 'tl' | 'tr' | 'bl' | 'br' | null

interface TileStore {
  tiles: Tile[]
  maxZIndex: number
  focusedId: string | null
  viewport: Viewport
  snapZone: SnapZone
  snapLabel: string | null
  setViewport: (v: Viewport) => void
  setSnapZone: (z: SnapZone, label?: string | null) => void
  addTile: (x: number, y: number, cwd: string) => string
  addFileTile: (filePath: string, title: string) => string
  removeTile: (id: string) => void
  updateTile: (id: string, updates: Partial<Tile>) => void
  bringToFront: (id: string) => void
  clearFocus: () => void
}

export const useTileStore = create<TileStore>((set, get) => ({
  tiles: [],
  maxZIndex: 0,
  focusedId: null,
  viewport: { panX: 40, panY: 40, zoom: 1 },
  snapZone: null,
  snapLabel: null,
  setViewport: (v) => set({ viewport: v }),
  setSnapZone: (z, label = null) => set({ snapZone: z, snapLabel: label }),

  addTile: (x, y, cwd) => {
    const id = `tile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const { maxZIndex } = get()
    const newZ = maxZIndex + 1
    set(state => ({
      tiles: [...state.tiles, { id, type: 'terminal' as TileType, x, y, width: 620, height: 400, zIndex: newZ, cwd, title: cwd.split('/').pop() || cwd }],
      maxZIndex: newZ,
    }))
    return id
  },

  addFileTile: (filePath, title) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const { maxZIndex, tiles } = get()
    // Bring existing tile to front if already open
    const existing = tiles.find(t => t.filePath === filePath)
    if (existing) {
      const newZ = maxZIndex + 1
      set(state => ({ tiles: state.tiles.map(t => t.id === existing.id ? { ...t, zIndex: newZ } : t), maxZIndex: newZ, focusedId: existing.id }))
      return existing.id
    }
    const newZ = maxZIndex + 1
    // Offset each new file tile slightly
    const offset = (tiles.filter(t => t.type === 'file').length % 5) * 24
    set(state => ({
      tiles: [...state.tiles, { id, type: 'file' as TileType, x: 80 + offset, y: 80 + offset, width: 700, height: 500, zIndex: newZ, cwd: '', title, filePath }],
      maxZIndex: newZ,
      focusedId: id,
    }))
    return id
  },

  removeTile: (id) => {
    set(state => ({ tiles: state.tiles.filter(t => t.id !== id), focusedId: state.focusedId === id ? null : state.focusedId }))
  },

  clearFocus: () => set({ focusedId: null }),

  updateTile: (id, updates) => {
    set(state => ({
      tiles: state.tiles.map(t => (t.id === id ? { ...t, ...updates } : t)),
    }))
  },

  bringToFront: (id) => {
    const { maxZIndex, tiles } = get()
    const tile = tiles.find(t => t.id === id)
    const newZ = tile?.zIndex === maxZIndex ? maxZIndex : maxZIndex + 1
    set(state => ({
      tiles: state.tiles.map(t => (t.id === id ? { ...t, zIndex: newZ } : t)),
      maxZIndex: newZ,
      focusedId: id,
    }))
  },
}))
