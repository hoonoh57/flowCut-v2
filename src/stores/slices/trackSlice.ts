import type { StateCreator } from 'zustand';
import type { Track } from '../../types/track';
import type { EditorStore } from '../editorStore';

const defaultTracks: Track[] = [
  { id: 'v1', name: '\uBE44\uB514\uC624 1', type: 'video', order: 500, height: 80, color: '#3b82f6', locked: false, visible: true, muted: false, solo: false },
  { id: 'a1', name: '\uC624\uB514\uC624 1', type: 'audio', order: 100, height: 60, color: '#22c55e', locked: false, visible: true, muted: false, solo: false },
];

export interface TrackSlice {
  tracks: Track[];
  setTracks: (t: Track[]) => void;
  addTrack: (t: Track) => void;
  removeTrack: (id: string) => void;
  toggleTrackLock: (id: string) => void;
  toggleTrackVisibility: (id: string) => void;
  toggleTrackMute: (id: string) => void;
  toggleTrackSolo: (id: string) => void;
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
  toggleTrackVisibility: (id) => set({
    tracks: get().tracks.map((t) => t.id === id ? { ...t, visible: !t.visible } : t),
  }),
  toggleTrackMute: (id) => set({
    tracks: get().tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t),
  }),
  toggleTrackSolo: (id) => {
    const tracks = get().tracks;
    const target = tracks.find(t => t.id === id);
    if (!target) return;
    const newSolo = !target.solo;
    // If turning solo ON, turn off solo on all others
    set({
      tracks: tracks.map((t) => t.id === id
        ? { ...t, solo: newSolo }
        : { ...t, solo: newSolo ? false : t.solo }
      ),
    });
  },
  toggleTrackGrouped: (id) => set({
    tracks: get().tracks.map((t) => t.id === id ? { ...t, grouped: t.grouped === false ? true : false } : t),
  }),
});
