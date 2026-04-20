import type { StateCreator } from 'zustand';
import type { Track } from '../../types/track';
import type { EditorStore } from '../editorStore';

const defaultTracks: Track[] = [
  { id: 'v1', name: 'Video 1', type: 'video', order: 500, height: 80, color: '#3b82f6', locked: false, visible: true },
  { id: 'a1', name: 'Audio 1', type: 'audio', order: 100, height: 60, color: '#22c55e', locked: false, visible: true },
];

export interface TrackSlice {
  tracks: Track[];
  setTracks: (t: Track[]) => void;
  addTrack: (t: Track) => void;
  removeTrack: (id: string) => void;
  toggleTrackLock: (id: string) => void;
  toggleTrackVisibility: (id: string) => void;
  toggleTrackGrouped: (id: string) => void;
}

export const createTrackSlice: StateCreator<EditorStore, [], [], TrackSlice> = (set, get) => ({
  tracks: defaultTracks,
  setTracks: (t) => set({ tracks: t }),
  addTrack: (t) => set({ tracks: [...get().tracks, t] }),
  removeTrack: (id) => set({
    tracks: get().tracks.filter((t) => t.id !== id),
    clips: get().clips.filter((c) => c.trackId !== id),
  }),
  toggleTrackLock: (id) => set({
    tracks: get().tracks.map((t) => t.id === id ? { ...t, locked: !t.locked } : t),
  }),
  toggleTrackGrouped: (id) => set({
    tracks: get().tracks.map((t) => t.id === id ? { ...t, grouped: t.grouped === false ? true : false } : t),
  }),
  toggleTrackVisibility: (id) => set({
    tracks: get().tracks.map((t) => t.id === id ? { ...t, visible: !t.visible } : t),
  }),
});