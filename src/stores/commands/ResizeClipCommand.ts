import type { Clip } from '../../types/clip';
import type { IEditorCommand, CommandState } from './types';

export class ResizeClipCommand implements IEditorCommand {
  readonly type = 'RESIZE_CLIP';
  readonly description: string;
  readonly timestamp = Date.now();
  private prevStart: number = 0;
  private prevDuration: number = 0;
  private prevSourceStart: number = 0;
  private prevSourceDuration: number = 0;
  private ripple: boolean;
  private affectedShifts: { clipId: string; oldStart: number; newStart: number }[] = [];

  constructor(
    private clipId: string,
    private newStartFrame: number,
    private newDurationFrames: number,
    private newSourceStart?: number,
    private newSourceDuration?: number,
    ripple: boolean = false
  ) {
    this.ripple = ripple;
    this.description = `Resize clip ${clipId}`;
  }

  execute(state: CommandState): CommandState {
    const clip = state.clips.find(c => c.id === this.clipId);
    if (!clip) return state;
    this.prevStart = clip.startFrame;
    this.prevDuration = clip.durationFrames;
    this.prevSourceStart = clip.sourceStart;
    this.prevSourceDuration = clip.sourceDuration;

    const durationDelta = this.newDurationFrames - this.prevDuration;
    const origEnd = this.prevStart + this.prevDuration;
    const newEnd = this.newStartFrame + this.newDurationFrames;

    let newClips = state.clips.map(c => {
      if (c.id !== this.clipId) return c;
      const updates: Partial<Clip> = {
        startFrame: this.newStartFrame,
        durationFrames: this.newDurationFrames,
      };
      if (this.newSourceStart !== undefined) updates.sourceStart = this.newSourceStart;
      if (this.newSourceDuration !== undefined) updates.sourceDuration = this.newSourceDuration;
      return { ...c, ...updates };
    });

    if (this.ripple && durationDelta !== 0) {
      this.affectedShifts = [];
      newClips = newClips.map(c => {
        if (c.id === this.clipId) return c;
        if (c.trackId !== clip.trackId) return c;
        // Shift all clips that were at or after the original end
        if (c.startFrame >= origEnd) {
          const newStart = Math.max(0, c.startFrame + durationDelta);
          this.affectedShifts.push({ clipId: c.id, oldStart: c.startFrame, newStart });
          return { ...c, startFrame: newStart };
        }
        return c;
      });
    }

    return { ...state, clips: newClips };
  }

  undo(state: CommandState): CommandState {
    let newClips = state.clips.map(c => {
      if (c.id !== this.clipId) return c;
      return {
        ...c,
        startFrame: this.prevStart,
        durationFrames: this.prevDuration,
        sourceStart: this.prevSourceStart,
        sourceDuration: this.prevSourceDuration,
      };
    });

    if (this.ripple && this.affectedShifts.length > 0) {
      newClips = newClips.map(c => {
        const shift = this.affectedShifts.find(s => s.clipId === c.id);
        if (shift) return { ...c, startFrame: shift.oldStart };
        return c;
      });
    }

    return { ...state, clips: newClips };
  }
}
