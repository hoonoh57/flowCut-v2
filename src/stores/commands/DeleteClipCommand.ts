import type { Clip } from '../../types/clip';
import type { IEditorCommand, CommandState } from './types';

export class DeleteClipCommand implements IEditorCommand {
  readonly type = 'DELETE_CLIP';
  description: string;
  readonly timestamp = Date.now();
  private clipId: string;
  private snapshots: Clip[] = [];
  private ripple: boolean;
  private affectedShifts: { clipId: string; oldStart: number; newStart: number }[] = [];

  constructor(clipId: string, ripple: boolean = false) {
    this.clipId = clipId;
    this.ripple = ripple;
    this.description = 'Delete clip';
  }

  execute(state: CommandState): CommandState {
    const clip = state.clips.find(c => c.id === this.clipId);
    if (!clip) return state;
    
    // Find all clips to delete (group members)
    let idsToDelete: string[];
    if (clip.groupId) {
      idsToDelete = state.clips.filter(c => c.groupId === clip.groupId).map(c => c.id);
    } else {
      idsToDelete = [this.clipId];
    }
    
    // Snapshot all deleted clips for undo
    this.snapshots = state.clips.filter(c => idsToDelete.includes(c.id)).map(c => ({ ...c }));
    this.description = this.snapshots.length > 1
      ? `Delete group (${this.snapshots.length} clips)`
      : `Delete clip: ${clip.name}`;
    
    let newClips = state.clips.filter(c => !idsToDelete.includes(c.id));
    
    if (this.ripple) {
      // Ripple based on the primary clip
      const gapStart = clip.startFrame;
      const gapDuration = clip.durationFrames;
      const trackId = clip.trackId;
      
      this.affectedShifts = [];
      newClips = newClips.map(c => {
        if (c.trackId !== trackId) return c;
        if (c.startFrame >= gapStart + gapDuration) {
          const newStart = c.startFrame - gapDuration;
          this.affectedShifts.push({ clipId: c.id, oldStart: c.startFrame, newStart });
          return { ...c, startFrame: newStart };
        }
        return c;
      });
    }
    
    return {
      ...state,
      clips: newClips,
      selectedClipIds: state.selectedClipIds.filter(id => !idsToDelete.includes(id)),
    };
  }

  undo(state: CommandState): CommandState {
    if (this.snapshots.length === 0) return state;
    
    let newClips = [...state.clips];
    
    // Reverse ripple shifts
    if (this.ripple && this.affectedShifts.length > 0) {
      newClips = newClips.map(c => {
        const shift = this.affectedShifts.find(s => s.clipId === c.id);
        if (shift) return { ...c, startFrame: shift.oldStart };
        return c;
      });
    }
    
    return {
      ...state,
      clips: [...newClips, ...this.snapshots.map(s => ({ ...s }))],
      selectedClipIds: [this.snapshots[0].id],
    };
  }
}
