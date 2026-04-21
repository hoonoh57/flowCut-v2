import { useCallback } from 'react';
import { DEFAULT_PROJECT } from '../types/project';
import { useEditorStore } from '../stores/editorStore';
import { uid } from '../utils/uid';
import type { MediaItem } from '../stores/slices/mediaSlice';

const SERVER_URL = 'http://localhost:3456';

async function uploadToServer(file: File): Promise<{ localPath: string; servePath: string } | null> {
  try {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch(`${SERVER_URL}/api/upload`, { method: 'POST', body: form });
    const data = await resp.json();
    if (data.success) return { localPath: data.localPath, servePath: data.servePath };
  } catch {}
  return null;
}

function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => { resolve(el.duration || 5); URL.revokeObjectURL(url); };
      el.onerror = () => { resolve(5); URL.revokeObjectURL(url); };
      el.src = url;
    } else {
      URL.revokeObjectURL(url);
      resolve(5);
    }
  });
}

function getMediaDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => { resolve({ width: video.videoWidth || DEFAULT_PROJECT.width, height: video.videoHeight || DEFAULT_PROJECT.height }); URL.revokeObjectURL(url); };
      video.onerror = () => { resolve({ width: DEFAULT_PROJECT.width, height: DEFAULT_PROJECT.height }); URL.revokeObjectURL(url); };
      video.src = url;
    } else if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { resolve({ width: DEFAULT_PROJECT.width, height: DEFAULT_PROJECT.height }); URL.revokeObjectURL(url); };
      img.src = url;
    } else {
      resolve({ width: 0, height: 0 });
    }
  });
}

function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'auto'; video.muted = true;
      video.onloadeddata = () => { video.currentTime = 0.5; };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(video, 0, 0, 160, 90);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
        URL.revokeObjectURL(url);
      };
      video.onerror = () => { resolve(''); URL.revokeObjectURL(url); };
      video.src = url;
    } else if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160; canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, 160, 90);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { resolve(''); URL.revokeObjectURL(url); };
      img.src = url;
    } else {
      resolve('');
    }
  });
}

export function useMediaImport() {
  const addMediaItem = useEditorStore((s) => s.addMediaItem);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      let type: 'video' | 'image' | 'audio' = 'video';
      if (file.type.startsWith('audio/')) type = 'audio';
      else if (file.type.startsWith('image/')) type = 'image';

      // Upload to local server for FFmpeg access
      const uploaded = await uploadToServer(file);
      const serverUrl = uploaded ? `${SERVER_URL}${uploaded.servePath}` : URL.createObjectURL(file);
      const localPath = uploaded?.localPath || '';

      const [duration, dimensions, thumbnail] = await Promise.all([
        getMediaDuration(file),
        getMediaDimensions(file),
        generateThumbnail(file),
      ]);

      const item: MediaItem = {
        id: uid(), name: file.name, type,
        url: serverUrl,
        objectUrl: serverUrl,
        localPath: localPath,
        duration,
        width: dimensions.width, height: dimensions.height,
        thumbnail, file, size: file.size,
      };
      addMediaItem(item);
    }
  }, [addMediaItem]);

  const openFilePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.accept = 'video/*,audio/*,image/*';
    input.onchange = () => {
      if (input.files && input.files.length > 0) importFiles(input.files);
    };
    input.click();
  }, [importFiles]);

  return { importFiles, openFilePicker };
}