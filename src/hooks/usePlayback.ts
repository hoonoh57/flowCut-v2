import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { getEnvelopeVolume } from '../types/clip';
import { getClipPreviewUrl } from '../utils/mediaResolver';

function isClipAudible(clipId: string, clips: any[], tracks: any[]): boolean {
  const clip = clips.find((c: any) => c.id === clipId);
  if (!clip) return false;
  if (clip.muted) return false;
  const track = tracks.find((t: any) => t.id === clip.trackId);
  if (!track) return true;
  if (track.muted) return false;
  // Solo logic: if ANY track has solo=true, only clips on solo tracks are audible
  const hasSolo = tracks.some((t: any) => t.solo === true);
  if (hasSolo && !track.solo) return false;
  return true;
}
export function usePlayback() {
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isPlaying = useEditorStore(s => s.isPlaying);
  const fps = useEditorStore(s => s.fps);
  const clips = useEditorStore(s => s.clips);

  // Audio elements only for audio-type clips (video audio is handled by PreviewCanvas)
  useEffect(() => {
    const map = audioMapRef.current;
    const audioOnlyClips = clips.filter(c => c.type === 'audio');
    const mediaItems = useEditorStore.getState().mediaItems || [];

    for (const clip of audioOnlyClips) {
      const src = getClipPreviewUrl(clip, mediaItems);
      if (!src) continue;
      const existing = map.get(clip.id);
      if (existing) {
        if (existing.src !== src) { existing.src = src; existing.load(); }
        continue;
      }
      const el = new Audio();
      el.src = src;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      map.set(clip.id, el);
    }

    const ids = new Set(audioOnlyClips.map(c => c.id));
    for (const [id, el] of map) {
      if (!ids.has(id)) { el.pause(); el.src = ''; map.delete(id); }
    }
  }, [clips]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioMapRef.current.forEach(el => { try { el.pause(); } catch {} });
      return;
    }
    prevTimeRef.current = performance.now();

    const syncAudio = (frame: number) => {
      const state = useEditorStore.getState();
      for (const [clipId, el] of audioMapRef.current) {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) { el.pause(); continue; }
        const inRange = frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames;
        if (inRange && isClipAudible(clipId, state.clips, state.tracks)) {
          const lf = frame - clip.startFrame;
          const targetTime = (lf / state.fps) * (clip.speed || 1);
          try { el.playbackRate = clip.speed || 1; } catch {}
          const pos = lf / clip.durationFrames;
          let vol = getEnvelopeVolume(clip.volumeEnvelope, pos) / 100;
          vol *= clip.volume / 100;
          if (clip.fadeIn > 0 && lf < clip.fadeIn) vol *= lf / clip.fadeIn;
          if (clip.fadeOut > 0 && lf > clip.durationFrames - clip.fadeOut) vol *= (clip.durationFrames - lf) / clip.fadeOut;
          el.volume = Math.min(1, Math.max(0, vol));
          if (Math.abs(el.currentTime - targetTime) > 0.3) el.currentTime = targetTime;
          if (el.paused) el.play().catch(() => {});
        } else {
          if (!el.paused) el.pause();
        }
      }
    };

    const tick = (now: number) => {
      const state = useEditorStore.getState();
      if (!state.isPlaying) return;
      const delta = now - prevTimeRef.current;
      const fd = 1000 / state.fps;
      if (delta >= fd) {
        // Advance exactly 1 frame per tick to prevent jumps
        const next = state.currentFrame + 1;
        // In-Out range check
        const outPt = state.outPoint;
        const inPt = state.inPoint;
        if (outPt !== null && next >= outPt) {
          if (state.loopPlayback && inPt !== null) {
            state.setCurrentFrame(inPt);
            syncAudio(inPt);
          } else {
            state.setCurrentFrame(outPt);
            state.setIsPlaying(false);
            audioMapRef.current.forEach(el => el.pause());
          }
          return;
        }
        const maxF = state.clips.reduce((mx, c) => Math.max(mx, c.startFrame + c.durationFrames), 0);
        if (next >= maxF && maxF > 0) {
          if (state.loopPlayback && inPt !== null) {
            state.setCurrentFrame(inPt);
            syncAudio(inPt);
          } else {
            state.setCurrentFrame(0); state.setIsPlaying(false);
            audioMapRef.current.forEach(el => el.pause());
          }
          return;
        }
        state.setCurrentFrame(next);
        prevTimeRef.current = now - (delta % fd);
        syncAudio(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    syncAudio(useEditorStore.getState().currentFrame);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, fps]);

  useEffect(() => {
    return () => {
      audioMapRef.current.forEach(el => { el.pause(); el.src = ''; });
      audioMapRef.current.clear();
    };
  }, []);
}