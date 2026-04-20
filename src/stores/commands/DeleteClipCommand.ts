import type { Clip } from '../../types/clip';
import type { IEditorCommand, CommandState } from './types';
import { ripplePull } from '../../engines/RippleEngine';

export class DeleteClipCommand implements IEditorCommand {
  readonly type = 'DELETE_CLIP';
  description: string;
  readonly timestamp = Date.now();
  private clipId: string;
  private snapshot: Clip | null = null;
  private ripple: boolean;
  private affectedShifts: { clipId: string; oldStart: number; newStart: number }[] = [];

  constructor(clipId: string, ripple: boolean = false) {
    this.clipId = clipId;
    this.ripple = ripple;
    this.description = 'Delete clip';
  }

  execute(state: CommandState): CommandState {
    this.snapshot = state.clips.find(c => c.id === this.clipId) || null;
    if (!this.snapshot) return state;
    this.description = `Delete clip: ${this.snapshot.name}`;
    
    let newClips = state.clips.filter(c => c.id !== this.clipId);
    
    if (this.ripple) {
      const gapStart = this.snapshot.startFrame;
      const gapDuration = this.snapshot.durationFrames;
      const trackId = this.snapshot.trackId;
      
      // Record shifts for undo
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
      selectedClipIds: state.selectedClipIds.filter(id => id !== this.clipId),
    };
  }

  undo(state: CommandState): CommandState {
    if (!this.snapshot) return state;
    
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
      clips: [...newClips, { ...this.snapshot }],
      selectedClipIds: [this.snapshot.id],
    };
  }
}
