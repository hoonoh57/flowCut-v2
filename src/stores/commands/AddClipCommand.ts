import type { Clip } from '../../types/clip';
import type { IEditorCommand, CommandState } from './types';

export class AddClipCommand implements IEditorCommand {
  readonly type = 'ADD_CLIP';
  readonly description: string;
  readonly timestamp = Date.now();
  private clip: Clip;
  private ripple: boolean;
  private affectedShifts: { clipId: string; oldStart: number; newStart: number }[] = [];

  constructor(clip: Clip, ripple: boolean = false) {
    this.clip = clip;
    this.ripple = ripple;
    this.description = `Add clip: ${clip.name}`;
  }

  execute(state: CommandState): CommandState {
    let newClips = [...state.clips, { ...this.clip }];
    
    if (this.ripple) {
      const insertFrame = this.clip.startFrame;
      const duration = this.clip.durationFrames;
      const trackId = this.clip.trackId;
      
      this.affectedShifts = [];
      newClips = newClips.map(c => {
        if (c.id === this.clip.id) return c;
        if (c.trackId !== trackId) return c;
        if (c.startFrame >= insertFrame) {
          const newStart = c.startFrame + duration;
          this.affectedShifts.push({ clipId: c.id, oldStart: c.startFrame, newStart });
          return { ...c, startFrame: newStart };
        }
        return c;
      });
    }
    
    return {
      ...state,
      clips: newClips,
      selectedClipIds: [this.clip.id],
    };
  }

  undo(state: CommandState): CommandState {
    let newClips = state.clips.filter(c => c.id !== this.clip.id);
    
    if (this.ripple && this.affectedShifts.length > 0) {
      newClips = newClips.map(c => {
        const shift = this.affectedShifts.find(s => s.clipId === c.id);
        if (shift) return { ...c, startFrame: shift.oldStart };
        return c;
      });
    }
    
    return {
      ...state,
      clips: newClips,
      selectedClipIds: state.selectedClipIds.filter(id => id !== this.clip.id),
    };
  }
}
