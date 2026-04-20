import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { ClipEnvelope } from './ClipEnvelope';
import { useEditorStore } from '../../stores/editorStore';
import { MoveClipCommand } from '../../stores/commands/MoveClipCommand';
import { ResizeClipCommand } from '../../stores/commands/ResizeClipCommand';
import { snapToGrid } from '../../engines/SnapEngine';
import { hasCollision, findNearestFreeStart } from '../../engines/CollisionEngine';
import { theme } from '../../styles/theme';
import type { Clip } from '../../types/clip';
import { getClipPreviewUrl } from '../../utils/mediaResolver';

const HANDLE_WIDTH = 6;
const MIN_DURATION_FRAMES = 2;

const TYPE_COLORS: Record<string, string> = {
  video: theme.colors.track.video,
  image: theme.colors.track.video,
  audio: theme.colors.track.audio,
  text: theme.colors.track.text,
};

/* ======= Waveform hook ======= */
function useWaveform(clip: Clip, sampleCount: number): number[] {
  const [wave, setWave] = useState<number[]>([]);
  useEffect(() => {
    if ((clip.type !== 'video' && clip.type !== 'audio') || sampleCount < 5) return;
    const src = clip.src || clip.previewUrl;
    if (!src) return;
    let cancelled = false;
    const ctx = new AudioContext();
    fetch(src)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => {
        if (cancelled) return;
        const ch = decoded.getChannelData(0);
        const step = Math.floor(ch.length / sampleCount);
        const r: number[] = [];
        for (let i = 0; i < sampleCount; i++) {
          let sum = 0;
          const s = i * step;
          for (let j = s; j < s + step && j < ch.length; j++) sum += Math.abs(ch[j]);
          r.push(sum / step);
        }
        const mx = Math.max(...r, 0.01);
        setWave(r.map(v => v / mx));
      })
      .catch(() => {});
    return () => { cancelled = true; ctx.close(); };
  }, [clip.id, clip.src, clip.previewUrl, sampleCount, clip.type]);
  return wave;
}

/* ======= Thumbnail hook ======= */
function useThumbnails(clip: Clip, width: number, thumbH: number): string[] {
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    if ((clip.type !== 'video' && clip.type !== 'image') || width < 30) return;
    const src = clip.src || clip.previewUrl;
    if (!src) return;
    let cancelled = false;
    const thumbW = Math.max(thumbH * 1.6, 40);
    const count = Math.max(1, Math.floor(width / thumbW));

    // --- Image clip: use <img> directly ---
    if (clip.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(thumbW); canvas.height = thumbH;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        if (!cancelled) setThumbs(Array(count).fill(dataUrl));
      };
      img.onerror = () => { if (!cancelled) setThumbs(Array(count).fill(src)); };
      img.src = src;
      return () => { cancelled = true; };
    }

    // --- Video clip: seek through frames ---
    const video = document.createElement('video');
    video.src = src; video.muted = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
    video.onloadeddata = async () => {
      if (cancelled) return;
      const dur = video.duration || 5;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(thumbW); canvas.height = thumbH;
      const ctx2 = canvas.getContext('2d')!;
      const results: string[] = [];
      for (let i = 0; i < count; i++) {
        if (cancelled) break;
        const time = (i / count) * dur;
        video.currentTime = time;
        await new Promise<void>(r => {
          const done = () => { video.removeEventListener('seeked', done); r(); };
          video.addEventListener('seeked', done);
          setTimeout(() => { video.removeEventListener('seeked', done); r(); }, 300);
        });
        try {
          ctx2.drawImage(video, 0, 0, canvas.width, canvas.height);
          results.push(canvas.toDataURL('image/jpeg', 0.4));
        } catch { results.push(''); }
      }
      if (!cancelled) setThumbs(results);
    };
    video.load();
    return () => { cancelled = true; video.src = ''; };
  }, [clip.id, clip.src, clip.previewUrl, width, thumbH, clip.type]);
  return thumbs;
}
/* ======= COMPONENT ======= */
interface TimelineClipProps {
  clip: Clip;
  left: number;
  width: number;
  height: number;
  trackLocked: boolean;
  trackIndex: number;
}

export const TimelineClip: React.FC<TimelineClipProps> = ({
  clip, left, width, height, trackLocked, trackIndex,
}) => {
  const selectedIds = useEditorStore(s => s.selectedClipIds);
  const selectClip = useEditorStore(s => s.selectClip);
  const dispatch = useEditorStore(s => s.dispatch);
  const zoom = useEditorStore(s => s.zoomLevel);
  const fps = useEditorStore(s => s.fps);
  const allClips = useEditorStore(s => s.clips);
  const tracks = useEditorStore(s => s.tracks);
  const snapEnabled = useEditorStore(s => s.snapEnabled);
  const setClips = useEditorStore(s => s.setClips);
  const mediaItems = useEditorStore(s => s.mediaItems);
  const rippleMode = useEditorStore(s => s.rippleMode);

  const isSelected = selectedIds.includes(clip.id);
  const [hoverEdge, setHoverEdge] = useState<'left' | 'right' | null>(null);
  const dragRef = useRef({ startX: 0, startY: 0, origFrame: 0, origTrackId: '', moved: false });
  const resizeRef = useRef({ startX: 0, origStart: 0, origDuration: 0, edge: '' as 'left' | 'right' });

  const pxPerFrame = (100 * zoom) / fps;

  const isVideo = clip.type === 'video';
  const isAudio = clip.type === 'audio';
  const isMedia = isVideo || isAudio;

  const thumbZoneH = (isVideo || clip.type === 'image') ? Math.round(height * 0.65) : 0;
  const waveZoneH = (isVideo || clip.type === 'image') ? height - thumbZoneH : (isAudio ? height : 0);
  const waveTop = (isVideo || clip.type === 'image') ? thumbZoneH : 0;

  const sampleCount = Math.max(10, Math.floor(width / 3));
  const waveform = useWaveform(clip, isMedia ? sampleCount : 0);
  const thumbnails = useThumbnails(clip, width, thumbZoneH - 2);

  const fadeInPx = Math.min((clip.fadeIn || 0) * pxPerFrame, width * 0.4);
  const fadeOutPx = Math.min((clip.fadeOut || 0) * pxPerFrame, width * 0.4);

  const sortedTracks = useMemo(() =>
    [...tracks].sort((a, b) => {
      const pri: Record<string, number> = { text: 3, video: 2, audio: 1 };
      return (pri[b.type] ?? 0) - (pri[a.type] ?? 0) || (b.order ?? 0) - (a.order ?? 0);
    }), [tracks]);

  const TRACK_HEIGHT = height + 6;

  /* --- Edge detection --- */
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (trackLocked) { setHoverEdge(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    if (lx <= HANDLE_WIDTH) setHoverEdge('left');
    else if (lx >= rect.width - HANDLE_WIDTH) setHoverEdge('right');
    else setHoverEdge(null);
  }, [trackLocked]);
  const onMouseLeave = useCallback(() => setHoverEdge(null), []);

  /* --- RESIZE --- */
  const onResizeStart = useCallback((e: React.MouseEvent, edge: 'left' | 'right') => {
    e.preventDefault(); e.stopPropagation(); selectClip(clip.id);
    const origSourceStart = clip.sourceStart;
    const origSourceDuration = clip.sourceDuration;
    const origStart = clip.startFrame;
    const origDuration = clip.durationFrames;
    // Snapshot positions of all clips on same track (for ripple)
    const trackClips = allClips.filter(c => c.trackId === clip.trackId && c.id !== clip.id);
    const origPositions = trackClips.map(c => ({ id: c.id, startFrame: c.startFrame }));
    
    resizeRef.current = { startX: e.clientX, origStart, origDuration, edge };
    
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - resizeRef.current.startX;
      const dF = Math.round(dx / pxPerFrame);
      let ns = origStart, nd = origDuration;
      let newSrcStart = origSourceStart;
      let newSrcDur = origSourceDuration;
      const secPerFrame = 1 / fps;
      
      if (edge === 'left') {
        ns = Math.max(0, origStart + dF);
        const frameDelta = ns - origStart;
        nd = origDuration - frameDelta;
        if (nd < MIN_DURATION_FRAMES) {
          nd = MIN_DURATION_FRAMES;
          ns = origStart + origDuration - MIN_DURATION_FRAMES;
        }
        const srcDelta = (ns - origStart) * secPerFrame * (clip.speed || 1);
        newSrcStart = Math.max(0, origSourceStart + srcDelta);
        newSrcDur = origSourceDuration - srcDelta;
        if (newSrcDur < 0.1) {
          newSrcDur = 0.1;
          newSrcStart = origSourceStart + origSourceDuration - 0.1;
        }
      } else {
        nd = Math.max(MIN_DURATION_FRAMES, origDuration + dF);
        newSrcDur = nd * secPerFrame * (clip.speed || 1);
      }
      
      const rm = useEditorStore.getState().rippleMode || false;
      const durationDelta = nd - origDuration;
      
      // Build updated clips array
      let updated = allClips.map(c => {
        if (c.id === clip.id) {
          return { ...c, startFrame: ns, durationFrames: nd, sourceStart: newSrcStart, sourceDuration: newSrcDur };
        }
        return c;
      });
      
      // Ripple: shift subsequent clips in real-time
      if (rm && durationDelta !== 0) {
        const origEnd = origStart + origDuration;
        updated = updated.map(c => {
          if (c.id === clip.id) return c;
          if (c.trackId !== clip.trackId) return c;
          // Find original position of this clip
          const orig = origPositions.find(o => o.id === c.id);
          if (!orig) return c;
          // Shift clips that were originally at or after the original clip end
          if (orig.startFrame >= origEnd) {
            return { ...c, startFrame: Math.max(0, orig.startFrame + durationDelta) };
          }
          // Also push clips that the resize now overlaps
          if (edge === 'right') {
            const newEnd = ns + nd;
            if (orig.startFrame >= origEnd && orig.startFrame < newEnd) {
              return { ...c, startFrame: Math.max(0, newEnd) };
            }
          }
          return c;
        });
      }
      
      setClips(updated);
    };
    
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const cur = useEditorStore.getState().clips.find(c => c.id === clip.id);
      if (cur && (cur.startFrame !== origStart || cur.durationFrames !== origDuration)) {
        const rm = useEditorStore.getState().rippleMode || false;
        dispatch(new ResizeClipCommand(cur.id, cur.startFrame, cur.durationFrames, cur.sourceStart, cur.sourceDuration, rm));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [clip, pxPerFrame, allClips, selectClip, dispatch, setClips, fps]);

  /* --- MOVE --- */
  const onMoveStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); selectClip(clip.id); if (trackLocked) return;
    const isAltDrag = e.altKey;
    let cloneId: string | null = null;
    
    // Alt+drag: create a clone immediately
    if (isAltDrag) {
      cloneId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
      const clone = { ...clip, id: cloneId, name: clip.name.replace(/ \(copy\)$/, '') + ' (copy)' };
      setClips([...allClips, clone]);
      selectClip(cloneId);
    }
    
    const activeId = isAltDrag && cloneId ? cloneId : clip.id;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origFrame: clip.startFrame, origTrackId: clip.trackId, moved: false };
    
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragRef.current.startX, dy = ev.clientY - dragRef.current.startY;
      if (!dragRef.current.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      dragRef.current.moved = true;
      let nf = Math.max(0, dragRef.current.origFrame + Math.round(dx / pxPerFrame));
      const ti = Math.min(Math.max(0, trackIndex + Math.round(dy / TRACK_HEIGHT)), sortedTracks.length - 1);
      const ntid = sortedTracks[ti].id;
      const currentClips = useEditorStore.getState().clips;
      if (snapEnabled) nf = snapToGrid(nf, currentClips, activeId, fps, zoom).frame;
      if (hasCollision({ ...clip, id: activeId } as any, nf, ntid, currentClips)) nf = findNearestFreeStart({ ...clip, id: activeId } as any, nf, ntid, currentClips);
      setClips(currentClips.map(c => c.id === activeId ? { ...c, startFrame: nf, trackId: ntid } : c));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      if (dragRef.current.moved) {
        const cur = useEditorStore.getState().clips.find(c => c.id === activeId);
        if (cur && (cur.startFrame !== dragRef.current.origFrame || cur.trackId !== dragRef.current.origTrackId)) {
          dispatch(new MoveClipCommand(activeId, dragRef.current.origTrackId, dragRef.current.origFrame, cur.trackId, cur.startFrame));
        }
      } else if (isAltDrag && cloneId) {
        // Didn't move, remove the clone
        const currentClips = useEditorStore.getState().clips;
        setClips(currentClips.filter(c => c.id !== cloneId));
        selectClip(clip.id);
      }
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }, [clip, trackLocked, zoom, fps, trackIndex, sortedTracks, allClips, snapEnabled, selectClip, dispatch, setClips, pxPerFrame, TRACK_HEIGHT]);

  /* --- Mouse down: resize edges only, move otherwise --- */
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Ctrl+Click or Shift+Click = multi-select (don't start move/resize)
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && !e.altKey && !hoverEdge) {
      e.stopPropagation();
      selectClip(clip.id, true);
      return;
    }
    if (hoverEdge) onResizeStart(e, hoverEdge);
    else onMoveStart(e);
  }, [hoverEdge, onResizeStart, onMoveStart, selectClip, clip.id]);

  const bg = TYPE_COLORS[clip.type] || theme.colors.accent.purple;
  const cursor = trackLocked ? 'not-allowed' : hoverEdge ? 'ew-resize' : 'grab';
  const durationSec = (clip.durationFrames / fps).toFixed(1);

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute', left, top: 3, width: Math.max(width, 8), height,
        background: `${bg}${isSelected ? 'dd' : '99'}`,
        border: isSelected ? `2px solid ${bg}` : `1px solid ${bg}88`,
        borderRadius: 4, cursor, overflow: 'hidden',
        boxSizing: 'border-box', userSelect: 'none', zIndex: isSelected ? 10 : 1,
      }}
    >
      {/* ===== VIDEO: Thumbnail zone ===== */}
      {(isVideo || clip.type === 'image') && thumbnails.length > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: thumbZoneH, display: 'flex', overflow: 'hidden', pointerEvents: 'none' }}>
          {thumbnails.map((src, i) => (
            <img key={i} src={src} alt="" style={{
              height: thumbZoneH - 2, width: Math.max(width / thumbnails.length, 30),
              objectFit: 'cover', opacity: 0.7, flexShrink: 0,
            }} />
          ))}
        </div>
      )}
      {(isVideo || clip.type === 'image') && (
        <div style={{ position: 'absolute', left: 0, top: thumbZoneH, width: '100%', height: 1, background: 'rgba(255,255,255,0.15)', pointerEvents: 'none' }} />
      )}

      {/* ===== Waveform zone ===== */}
      {isMedia && waveform.length > 0 && (
        <svg
          style={{ position: 'absolute', left: 0, top: waveTop, width: '100%', height: waveZoneH, pointerEvents: 'none', opacity: 0.35 }}
          viewBox={`0 0 ${width} ${waveZoneH}`}
          preserveAspectRatio="none"
        >
          {waveform.map((v, i) => {
            const bw = Math.max(1, width / waveform.length - 0.5);
            const bh = v * (waveZoneH - 4);
            const x = (i / waveform.length) * width;
            return <rect key={i} x={x} y={(waveZoneH - bh) / 2} width={bw} height={bh} fill="#fff" rx={1} />;
          })}
        </svg>
      )}

      {/* ===== ClipEnvelope: 독립된 볼륨 엔벨로프 (wavesurfer 패턴) ===== */}
      {isMedia && (
        <ClipEnvelope
          clip={clip}
          width={Math.max(1, width)}
          height={waveZoneH}
          top={waveTop}
        />
      )}

      {/* Fade in overlay */}
      {fadeInPx > 2 && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: fadeInPx, height: '100%', background: 'linear-gradient(to right, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      )}
      {/* Fade out overlay */}
      {fadeOutPx > 2 && (
        <div style={{ position: 'absolute', right: 0, top: 0, width: fadeOutPx, height: '100%', background: 'linear-gradient(to left, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />
      )}

      {/* Resize handles */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: HANDLE_WIDTH, height: '100%', background: hoverEdge === 'left' ? 'rgba(255,255,255,0.25)' : 'transparent', borderRadius: '4px 0 0 4px' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: HANDLE_WIDTH, height: '100%', background: hoverEdge === 'right' ? 'rgba(255,255,255,0.25)' : 'transparent', borderRadius: '0 4px 4px 0' }} />

      {/* Label */}
      <div style={{ position: 'absolute', left: 8, top: isVideo ? 2 : (height / 2 - 7), right: 8, display: 'flex', alignItems: 'center', zIndex: 25, pointerEvents: 'none' }}>
        <span style={{ fontSize: 10, color: '#fff', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {clip.name}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginLeft: 4, flexShrink: 0, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
          {durationSec}s
        </span>
        {clip.muted && <span style={{ marginLeft: 2, fontSize: 9 }}>{'\uD83D\uDD07'}</span>}
        {clip.groupId && <span style={{ marginLeft: 2, fontSize: 8, background: '#' + (clip.groupId || '').slice(0, 6), width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} title={`Group: ${clip.groupId?.slice(0, 8)}`} />}
        {trackLocked && <span style={{ marginLeft: 2, fontSize: 10 }}>{'\uD83D\uDD12'}</span>}
      </div>
    </div>
  );
};