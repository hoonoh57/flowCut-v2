import type { Clip } from '../types/clip';
import type { Track } from '../types/track';

/**
 * Ripple push: shift all clips on the same track that start at or after insertFrame
 * by deltaFrames forward.
 */
export function ripplePush(
  clips: Clip[],
  trackId: string,
  insertFrame: number,
  deltaFrames: number,
  excludeClipId?: string
): Clip[] {
  return clips.map(c => {
    if (c.trackId !== trackId) return c;
    if (excludeClipId && c.id === excludeClipId) return c;
    if (c.startFrame >= insertFrame) {
      return { ...c, startFrame: Math.max(0, c.startFrame + deltaFrames) };
    }
    return c;
  });
}

/**
 * Ripple pull: after removing a clip, shift all clips on the same track
 * that start after gapStart backward by deltaFrames.
 */
export function ripplePull(
  clips: Clip[],
  trackId: string,
  gapStart: number,
  deltaFrames: number,
  excludeClipId?: string
): Clip[] {
  return clips.map(c => {
    if (c.trackId !== trackId) return c;
    if (excludeClipId && c.id === excludeClipId) return c;
    if (c.startFrame >= gapStart) {
      return { ...c, startFrame: Math.max(0, c.startFrame - deltaFrames) };
    }
    return c;
  });
}

/**
 * Group ripple push: shift clips on ALL grouped (non-locked) tracks
 */
export function groupRipplePush(
  clips: Clip[],
  tracks: Track[],
  insertFrame: number,
  deltaFrames: number,
  excludeClipId?: string
): Clip[] {
  const affectedTrackIds = new Set(
    tracks.filter(t => !t.locked && t.grouped !== false).map(t => t.id)
  );
  return clips.map(c => {
    if (!affectedTrackIds.has(c.trackId)) return c;
    if (excludeClipId && c.id === excludeClipId) return c;
    if (c.startFrame >= insertFrame) {
      return { ...c, startFrame: Math.max(0, c.startFrame + deltaFrames) };
    }
    return c;
  });
}

/**
 * Group ripple pull: shift clips on ALL grouped (non-locked) tracks backward
 */
export function groupRipplePull(
  clips: Clip[],
  tracks: Track[],
  gapStart: number,
  deltaFrames: number,
  excludeClipId?: string
): Clip[] {
  const affectedTrackIds = new Set(
    tracks.filter(t => !t.locked && t.grouped !== false).map(t => t.id)
  );
  return clips.map(c => {
    if (!affectedTrackIds.has(c.trackId)) return c;
    if (excludeClipId && c.id === excludeClipId) return c;
    if (c.startFrame >= gapStart) {
      return { ...c, startFrame: Math.max(0, c.startFrame - deltaFrames) };
    }
    return c;
  });
}

/**
 * Close gaps on a single track: sort clips by startFrame, pack them tightly
 */
export function closeGaps(clips: Clip[], trackId: string): Clip[] {
  const trackClips = clips.filter(c => c.trackId === trackId).sort((a, b) => a.startFrame - b.startFrame);
  const otherClips = clips.filter(c => c.trackId !== trackId);
  const result: Clip[] = [];
  let nextStart = 0;
  for (const c of trackClips) {
    if (c.startFrame > nextStart) {
      result.push({ ...c, startFrame: nextStart });
    } else {
      result.push(c);
      nextStart = c.startFrame;
    }
    nextStart = (result[result.length - 1].startFrame) + result[result.length - 1].durationFrames;
  }
  return [...otherClips, ...result];
}
