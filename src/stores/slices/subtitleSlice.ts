import type { StateCreator } from 'zustand';
import type { EditorStore } from '../editorStore';

export type SubtitlePresetId = 'clean' | 'karaoke' | 'pill' | 'pop' | 'webtoon' | 'typewriter' | 'cinematic' | 'impact' | 'none';

export interface SubtitleSegment {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface SubtitleSlice {
  subtitlePreset: SubtitlePresetId;
  subtitleSegments: SubtitleSegment[];
  subtitleVisible: boolean;
  setSubtitlePreset: (p: SubtitlePresetId) => void;
  setSubtitleSegments: (s: SubtitleSegment[]) => void;
  setSubtitleVisible: (v: boolean) => void;
  clearSubtitles: () => void;
}

export const createSubtitleSlice: StateCreator<EditorStore, [], [], SubtitleSlice> = (set) => ({
  subtitlePreset: 'clean',
  subtitleSegments: [],
  subtitleVisible: true,
  setSubtitlePreset: (p) => set({ subtitlePreset: p }),
  setSubtitleSegments: (s) => set({ subtitleSegments: s }),
  setSubtitleVisible: (v) => set({ subtitleVisible: v }),
  clearSubtitles: () => set({ subtitleSegments: [], subtitleVisible: false }),
});
