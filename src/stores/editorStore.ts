import { create } from 'zustand';
import { createTrackSlice, type TrackSlice } from './slices/trackSlice';
import { createClipSlice, type ClipSlice } from './slices/clipSlice';
import { createPlaybackSlice, type PlaybackSlice } from './slices/playbackSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createMediaSlice, type MediaSlice } from './slices/mediaSlice';
import { createExportSlice, type ExportSlice } from './slices/exportSlice';
import { createUISlice, type UISlice } from './slices/uiSlice';

export type EditorStore =
  TrackSlice & ClipSlice & PlaybackSlice & HistorySlice &
  MediaSlice & ExportSlice & UISlice;

export const useEditorStore = create<EditorStore>()((...a) => ({
  ...createTrackSlice(...a),
  ...createClipSlice(...a),
  ...createPlaybackSlice(...a),
  ...createHistorySlice(...a),
  ...createMediaSlice(...a),
  ...createExportSlice(...a),
  ...createUISlice(...a),
}));

// Debug: expose store globally
if (typeof window !== 'undefined') (window as any).__editorStore = useEditorStore;
