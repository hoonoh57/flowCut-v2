import { useEditorStore } from '../stores/editorStore';
import type { MediaItem } from '../stores/slices/mediaSlice';
import type { AspectPreset, FitMode } from '../stores/slices/playbackSlice';

export interface SavedMedia {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  localPath: string;
  url: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  thumbnail?: string;
}

export interface ProjectData {
  version: number;
  name: string;
  savedAt: string;
  fps: number;
  projectWidth: number;
  projectHeight: number;
  aspectPreset: string;
  fitMode: string;
  tracks: any[];
  clips: any[];
  media: SavedMedia[];
  zoomLevel: number;
  currentFrame: number;
  snapEnabled: boolean;
}

const SERVER_URL = 'http://localhost:3456';

export function serializeProject(name: string): ProjectData {
  const s = useEditorStore.getState();
  return {
    version: 2,
    name,
    savedAt: new Date().toISOString(),
    fps: s.fps,
    projectWidth: s.projectWidth,
    projectHeight: s.projectHeight,
    aspectPreset: s.aspectPreset,
    fitMode: s.fitMode,
    tracks: s.tracks,
    clips: s.clips.map(c => {
      const clone = { ...c };
      if (clone.src?.startsWith('blob:')) delete clone.src;
      if (clone.previewUrl?.startsWith('blob:')) delete clone.previewUrl;
      return clone;
    }),
    media: s.mediaItems.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      localPath: m.localPath || '',
      url: m.url || '',
      duration: m.duration,
      width: m.width || 0,
      height: m.height || 0,
      size: m.size,
      thumbnail: m.thumbnail || '',
    })),
    zoomLevel: s.zoomLevel,
    currentFrame: s.currentFrame,
    snapEnabled: s.snapEnabled,
  };
}

export function deserializeProject(data: ProjectData) {
  const s = useEditorStore.getState();

  // Restore media items first
  if (data.media && data.media.length > 0) {
    const restoredMedia: MediaItem[] = data.media.map(m => {
      // Rebuild server URL from localPath
      const serverUrl = m.localPath
        ? `${SERVER_URL}/media/${encodeURIComponent(m.localPath.split(/[/\\]/).pop() || m.name)}`
        : m.url;
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        url: serverUrl,
        objectUrl: serverUrl,
        localPath: m.localPath,
        duration: m.duration,
        width: m.width,
        height: m.height,
        thumbnail: m.thumbnail || '',
        size: m.size,
      };
    });
    // Replace media items in store
    s.clearMedia();
    for (const item of restoredMedia) {
      s.addMediaItem(item);
    }
  } else {
    s.clearMedia();
  }

  // Restore clips - rebuild src from media
  const mediaMap = new Map<string, MediaItem>();
  useEditorStore.getState().mediaItems.forEach(m => mediaMap.set(m.id, m));

  const restoredClips = (data.clips || []).map((c: any) => {
    const clone = { ...c };
    // If clip has no src, rebuild from mediaId
    if (!clone.src && clone.mediaId && mediaMap.has(clone.mediaId)) {
      const media = mediaMap.get(clone.mediaId)!;
      clone.src = media.url || media.objectUrl || '';
    }
    // Auto-detect video clips: mediaId ending with _video or src ending with .mp4/.webm/.mov
    if (clone.type === "image") {
      const src = (clone.src || "").toLowerCase();
      const mid = (clone.mediaId || "");
      if (mid.endsWith("_video") || src.endsWith(".mp4") || src.endsWith(".webm") || src.endsWith(".mov")) {
        clone.type = "video";
      }
    }
    return clone;
  });

  s.setTracks(data.tracks);
  s.setClips(restoredClips);
  s.setFps(data.fps);
  s.setProjectSize(data.projectWidth, data.projectHeight);
  s.setAspectPreset(data.aspectPreset as AspectPreset);
  s.setFitMode(data.fitMode as FitMode);
  s.setZoomLevel(data.zoomLevel);
  s.setCurrentFrame(data.currentFrame);
  s.setSnapEnabled(data.snapEnabled);
  s.setIsPlaying(false);
  s.clearSelection();
  s.clearHistory();
}

export function saveProjectToFile(name: string) {
  const data = serializeProject(name);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.flowcut`;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveProjectToLocalStorage(name: string) {
  const data = serializeProject(name);
  const key = `flowcut_project_${name}`;
  localStorage.setItem(key, JSON.stringify(data));
  localStorage.setItem('flowcut_last_project', key);
  return key;
}

export function loadProjectFromLocalStorage(key: string): ProjectData | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getProjectList(): { key: string; name: string; savedAt: string }[] {
  const list: { key: string; name: string; savedAt: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('flowcut_project_')) {
      try {
        const d = JSON.parse(localStorage.getItem(k) || '');
        list.push({ key: k, name: d.name || k, savedAt: d.savedAt || '' });
      } catch {}
    }
  }
  return list.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function loadProjectFromFile(): Promise<ProjectData | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.flowcut,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        resolve(JSON.parse(text));
      } catch { resolve(null); }
    };
    input.click();
  });
}