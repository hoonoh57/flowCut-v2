import type { StateCreator } from 'zustand';
import type { Clip } from '../../types/clip';
import type { EditorStore } from '../editorStore';

export interface ClipSlice {
  clips: Clip[];
  selectedClipIds: string[];
  rippleMode: boolean;
  setClips: (c: Clip[]) => void;
  setSelectedClipIds: (ids: string[]) => void;
  selectClip: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  setRippleMode: (v: boolean) => void;
}

export const createClipSlice: StateCreator<EditorStore, [], [], ClipSlice> = (set, get) => ({
  clips: [],
  selectedClipIds: [],
  rippleMode: true,  // default ON
  setClips: (c) => set({ clips: c }),
  setSelectedClipIds: (ids) => set({ selectedClipIds: ids }),
  selectClip: (id, multi = false) => {
    const cur = get().selectedClipIds;
    const clip = get().clips.find(c => c.id === id);
    
    if (multi) {
      // Multi-select: toggle individual clip + its group members
      if (cur.includes(id)) {
        // Deselect this clip and its group members
        if (clip?.groupId) {
          const groupIds = get().clips.filter(c => c.groupId === clip.groupId).map(c => c.id);
          set({ selectedClipIds: cur.filter(x => !groupIds.includes(x)) });
        } else {
          set({ selectedClipIds: cur.filter(x => x !== id) });
        }
      } else {
        // Add this clip and its group members
        if (clip?.groupId) {
          const groupIds = get().clips.filter(c => c.groupId === clip.groupId).map(c => c.id);
          set({ selectedClipIds: [...new Set([...cur, ...groupIds])] });
        } else {
          set({ selectedClipIds: [...cur, id] });
        }
      }
    } else {
      // Single select: select clip + its group members
      if (clip?.groupId) {
        const groupIds = get().clips.filter(c => c.groupId === clip.groupId).map(c => c.id);
        set({ selectedClipIds: groupIds });
      } else {
        set({ selectedClipIds: [id] });
      }
    }
  },
  clearSelection: () => set({ selectedClipIds: [] }),
  setRippleMode: (v) => set({ rippleMode: v }),
});
