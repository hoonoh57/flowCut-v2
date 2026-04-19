import { uid } from './uid';
import { createDefaultClip } from '../types/clip';
import { validateClipMedia } from './mediaResolver';
import type { Clip } from '../types/clip';
import type { MediaItem } from '../stores/slices/mediaSlice';
import { applyPresetStyle } from '../presets/textPresets';

export function createMediaClipFromItem(
  mediaItem: MediaItem,
  trackId: string,
  startFrame: number,
  fps: number,
  overrides?: Partial<Clip>
): Clip {
  const clipType = mediaItem.type === 'audio' ? 'audio'
    : mediaItem.type === 'image' ? 'image' : 'video';

  const clip = createDefaultClip({
    id: uid(),
    trackId,
    name: mediaItem.name,
    type: clipType,
    startFrame,
    durationFrames: Math.round(mediaItem.duration * fps) || fps * 5,
    sourceDuration: mediaItem.duration,
    mediaId: mediaItem.id,
    src: mediaItem.objectUrl || mediaItem.url,
    localPath: mediaItem.localPath || '',
    width: mediaItem.width || 1920,
    height: mediaItem.height || 1080,
    ...overrides,
  });

  validateClipMedia(clip, 'createMediaClipFromItem');
  return clip;
}

export function createTextClip(
  trackId: string,
  startFrame: number,
  fps: number,
  text: string,
  style?: { fontSize?: number; fontColor?: string; fontFamily?: string },
  overrides?: Partial<Clip>
): Clip {
  return createDefaultClip({
    id: uid(),
    name: text,
    type: 'text',
    trackId,
    startFrame,
    durationFrames: fps * 5,
    text,
    fontSize: style?.fontSize || 48,
    fontColor: style?.fontColor || '#ffffff',
    fontFamily: style?.fontFamily || 'sans-serif',
    width: 800,
    height: 200,
    ...overrides,
  });
}

export function createTextClipFromPreset(
  presetId: string,
  trackId: string,
  startFrame: number,
  fps: number,
  textOverride?: string,
  extraOverrides?: Partial<Clip>
): Clip {
  const presetStyle = applyPresetStyle(presetId, textOverride);
  const text = textOverride || presetId;

  return createDefaultClip({
    id: uid(),
    name: text,
    type: 'text',
    trackId,
    startFrame,
    durationFrames: fps * 5,
    text,
    width: 800,
    height: 200,
    ...presetStyle,
    ...extraOverrides,
  });
}
