import type { Clip } from '../types/clip';
import type { MediaItem } from '../stores/slices/mediaSlice';

/**
 * Central media lookup utility.
 * All files that need clip source URL or local path MUST use these functions.
 * Never access clip.src, clip.previewUrl, or clip.localPath directly.
 */


/** Refresh object URL from File reference if blob URL is stale */
function refreshObjectUrl(media: MediaItem): string {
  if (media.objectUrl) {
    // Quick check: if it's a server URL (http), always valid
    if (media.objectUrl.startsWith('http')) return media.objectUrl;
    // Blob URLs become invalid after page reload
    // Re-create from File if available
  }
  if (media.file) {
    const newUrl = URL.createObjectURL(media.file);
    media.objectUrl = newUrl; // Update in-place (reactive stores will pick up)
    return newUrl;
  }
  // Fallback to server URL
  if (media.url && media.url.startsWith('http')) return media.url;
  if (media.localPath) {
    // Try to construct server URL from localPath
    const fileName = media.localPath.split(/[\/]/).pop() || '';
    return 'http://localhost:3456/media/' + fileName;
  }
  return '';
}

/** Get the preview/playback URL for a clip */
export function getClipPreviewUrl(clip: Clip, mediaItems?: MediaItem[]): string {
  // 1. Direct src on clip
  if (clip.src) return clip.src;
  // 2. Legacy previewUrl
  if (clip.previewUrl) return clip.previewUrl;
  // 3. Lookup from mediaItems via mediaId
  if (clip.mediaId && mediaItems) {
    const media = mediaItems.find(m => m.id === clip.mediaId);
    if (media) return refreshObjectUrl(media);
  }
  return '';
}

/** Get the local filesystem path for FFmpeg export */
export function getClipLocalPath(clip: Clip, mediaItems: MediaItem[]): string {
  // 1. Direct localPath on clip
  if (clip.localPath) return clip.localPath;
  // 2. Lookup from mediaItems via mediaId
  if (clip.mediaId) {
    const media = mediaItems.find(m => m.id === clip.mediaId);
    if (media?.localPath) return media.localPath;
  }
  // 3. Fallback: try to match by src URL pattern
  if (clip.src) {
    const srcKey = clip.src.split('/media/')[1]?.substring(0, 20);
    if (srcKey) {
      const media = mediaItems.find(m => m.url?.includes(srcKey));
      if (media?.localPath) return media.localPath;
    }
  }
  return '';
}

/** Get the MediaItem associated with a clip */
export function getClipMediaItem(clip: Clip, mediaItems: MediaItem[]): MediaItem | null {
  if (clip.mediaId) {
    const media = mediaItems.find(m => m.id === clip.mediaId);
    if (media) return media;
  }
  // Fallback: match by src URL
  if (clip.src) {
    const srcKey = clip.src.split('/media/')[1]?.substring(0, 20);
    if (srcKey) {
      const found = mediaItems.find(m => m.url?.includes(srcKey));
      if (found) return found;
    }
  }
  return null;
}

/** Validate that a media clip has proper references (dev mode warning) */
export function validateClipMedia(clip: Clip, context: string): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    if (clip.type !== 'text' && !clip.mediaId) {
      console.warn(`[FlowCut] ${context}: Clip "${clip.name}" (${clip.id}) has no mediaId!`);
    }
  }
}