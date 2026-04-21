import type { StateCreator } from 'zustand';
import type { EditorStore } from '../editorStore';

export type AspectPreset = '16:9' | '9:16' | '1:1' | '4:3' | '4:5' | '21:9';
export type FitMode = 'fit' | 'fill' | 'stretch';

const PRESET_SIZES: Record<AspectPreset, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:3': [1440, 1080],
  '4:5': [1080, 1350],
  '21:9': [2560, 1080],
};

export interface PlaybackSlice {
  currentFrame: number;
  isPlaying: boolean;
  zoomLevel: number;
  snapEnabled: boolean;
  fps: number;
  projectWidth: number;
  projectHeight: number;
  aspectPreset: AspectPreset;
  fitMode: FitMode;
  totalFrames: number;
  setCurrentFrame: (f: number) => void;
  setIsPlaying: (v: boolean) => void;
  setZoomLevel: (z: number) => void;
  setSnapEnabled: (v: boolean) => void;
  setFps: (f: number) => void;
  setProjectSize: (w: number, h: number) => void;
  setAspectPreset: (p: AspectPreset) => void;
  setFitMode: (m: FitMode) => void;
  setTotalFrames: (f: number) => void;
  togglePlayback: () => void;
  inPoint: number | null;
  outPoint: number | null;
  loopPlayback: boolean;
  setInPoint: (f: number | null) => void;
  setOutPoint: (f: number | null) => void;
  setLoopPlayback: (v: boolean) => void;
  clearInOut: () => void;
}

export const createPlaybackSlice: StateCreator<EditorStore, [], [], PlaybackSlice> = (set) => ({
  currentFrame: 0,
  isPlaying: false,
  zoomLevel: 1,
  snapEnabled: true,
  fps: 30,
  projectWidth: 1920,
  projectHeight: 1080,
  aspectPreset: '16:9',
  fitMode: 'fit',
  totalFrames: 9000,
  setCurrentFrame: (f) => set({ currentFrame: Math.max(0, f) }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setZoomLevel: (z) => set({ zoomLevel: Math.max(0.1, Math.min(10, z)) }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setFps: (f) => set({ fps: f }),
  setProjectSize: (w, h) => set({ projectWidth: w, projectHeight: h }),
  setAspectPreset: (p) => {
    const [w, h] = PRESET_SIZES[p];
    set({ aspectPreset: p, projectWidth: w, projectHeight: h });
  },
  setFitMode: (m) => set({ fitMode: m }),
  setTotalFrames: (f) => set({ totalFrames: Math.max(1, f) }),
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),
  inPoint: null,
  outPoint: null,
  loopPlayback: false,
  setInPoint: (f) => set({ inPoint: f }),
  setOutPoint: (f) => set({ outPoint: f }),
  setLoopPlayback: (v) => set({ loopPlayback: v }),
  clearInOut: () => set({ inPoint: null, outPoint: null }),
});