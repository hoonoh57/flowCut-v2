import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { UpdateClipCommand } from '../../stores/commands/UpdateClipCommand';
import { getVisibleClips } from '../../engines/RenderEngine';
import { frameToTime } from '../../utils/timeFormat';
import { theme } from '../../styles/theme';
import type { Clip } from '../../types/clip';
import { getClipPreviewUrl } from '../../utils/mediaResolver';
import { getEnvelopeVolume } from '../../types/clip';
import { renderTextClip } from '../../renderer/textRenderer';
import type { FitMode, AspectPreset } from '../../stores/slices/playbackSlice';

type GuideMode = 'off' | 'safe' | 'grid' | 'center' | 'all';
const GUIDE_MODES: GuideMode[] = ['off', 'safe', 'grid', 'center', 'all'];
const GUIDE_LABELS: Record<GuideMode, string> = { off: 'OFF', safe: 'Safe', grid: 'Grid', center: 'Center', all: 'All' };
const PRESETS: AspectPreset[] = ['16:9', '9:16', '1:1', '4:3', '4:5', '21:9'];
const HANDLE_SIZE = 8;

function getClipDisplayRect(clip: Clip, pw: number, ph: number) {
  const isDefault = clip.x === 0 && clip.y === 0 && (clip.width !== pw || clip.height !== ph);
  if (isDefault && (clip.type === 'video' || clip.type === 'image')) {
    const clipAR = clip.width / clip.height;
    const projAR = pw / ph;
    let dw: number, dh: number, dx: number, dy: number;
    if (clipAR > projAR) { dw = pw; dh = pw / clipAR; dx = 0; dy = (ph - dh) / 2; }
    else { dh = ph; dw = ph * clipAR; dx = (pw - dw) / 2; dy = 0; }
    return { x: dx, y: dy, w: dw, h: dh, autoFit: true };
  }
  return { x: clip.x, y: clip.y, w: clip.width, h: clip.height, autoFit: false };
}

function getClipOpacity(clip: Clip, currentFrame: number): number {
  const baseOpacity = (clip.opacity ?? 100) / 100;
  const localFrame = currentFrame - clip.startFrame;
  const dur = clip.durationFrames;
  let fadeMultiplier = 1;
  if (clip.fadeIn > 0 && localFrame < clip.fadeIn) {
    fadeMultiplier = localFrame / clip.fadeIn;
  }
  if (clip.fadeOut > 0 && localFrame > dur - clip.fadeOut) {
    fadeMultiplier = Math.min(fadeMultiplier, (dur - localFrame) / clip.fadeOut);
  }
  return baseOpacity * Math.max(0, Math.min(1, fadeMultiplier));
}

function getClipFilter(clip: Clip): string {
  const filters: string[] = [];
  if (clip.brightness && clip.brightness !== 0) filters.push(`brightness(${1 + clip.brightness / 100})`);
  if (clip.contrast && clip.contrast !== 100) filters.push(`contrast(${clip.contrast / 100})`);
  if (clip.saturation !== undefined && clip.saturation !== 100) filters.push(`saturate(${clip.saturation / 100})`);
  if (clip.blur && clip.blur > 0) filters.push(`blur(${clip.blur}px)`);
  return filters.length > 0 ? filters.join(' ') : 'none';
}

const TextCanvasPreview: React.FC<{ clip: Clip; currentFrame?: number; fps?: number }> = ({ clip, currentFrame = 0, fps = 30 }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = clip.width || 800;
    const h = clip.height || 200;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const localFrame = Math.max(0, currentFrame - (clip.startFrame || 0));
    const duration = clip.durationFrames || 150;
    const animTime = duration > 0 ? localFrame / duration : 0;
    renderTextClip(ctx, { ...clip, x: 0, y: 0, _animTime: animTime } as any, w, h);
  }, [
    clip.text, clip.name, clip.fontSize, clip.fontFamily, clip.fontColor,
    clip.fontWeight, clip.fontStyle, clip.textAlign, clip.lineHeight,
    clip.textBgColor, clip.textBgOpacity, clip.borderColor, clip.borderWidth,
    clip.shadowColor, clip.shadowX, clip.shadowY, clip.width, clip.height,
    clip.opacity, currentFrame,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
};

const ClipMedia: React.FC<{ clip: Clip; isPlaying: boolean; currentFrame: number; fps: number; mediaItems?: any[] }> = ({ clip, isPlaying, currentFrame, fps, mediaItems }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetTime = (currentFrame - clip.startFrame) / fps * (clip.speed || 1);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.playbackRate !== (clip.speed || 1)) v.playbackRate = clip.speed || 1;
    // Apply volume from envelope + base volume + fade
    const localFrame = currentFrame - clip.startFrame;
    const pos = clip.durationFrames > 0 ? localFrame / clip.durationFrames : 0;
    let vol = getEnvelopeVolume(clip.volumeEnvelope, pos) / 100;
    vol *= clip.volume / 100;
    if (clip.fadeIn > 0 && localFrame < clip.fadeIn) vol *= localFrame / clip.fadeIn;
    if (clip.fadeOut > 0 && localFrame > clip.durationFrames - clip.fadeOut) vol *= (clip.durationFrames - localFrame) / clip.fadeOut;
    v.volume = Math.min(1, Math.max(0, vol));
    v.muted = clip.muted;
    if (isPlaying) { if (v.paused) v.play().catch(() => {}); }
    else { v.pause(); v.currentTime = targetTime; }
  }, [isPlaying, targetTime, clip.speed]);

  if (clip.type === 'video') {
    const vidSrc = getClipPreviewUrl(clip, mediaItems);
    return vidSrc ? (
      <video ref={videoRef} src={vidSrc} muted={clip.muted}
        onError={(e) => {
          const m = mediaItems?.find(mi => mi.id === clip.mediaId);
          if (m?.localPath) {
            const fn = m.localPath.split(/[\\/]/).pop() || '';
            (e.target as HTMLVideoElement).src = 'http://localhost:3456/media/' + fn;
          }
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    ) : (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1a1a2e', color: '#666', fontSize: 12 }}>
        {clip.name || 'Video'}
      </div>
    );
  }
  if (clip.type === 'image') {
    const imgSrc = getClipPreviewUrl(clip, mediaItems);
    return imgSrc ? (
      <img src={imgSrc} alt={clip.name}
        onError={(e) => {
          // Try reconstructing URL from localPath
          const m = mediaItems?.find(mi => mi.id === clip.mediaId);
          if (m?.localPath) {
            const fn = m.localPath.split(/[\\/]/).pop() || '';
            (e.target as HTMLImageElement).src = 'http://localhost:3456/media/' + fn;
          }
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    ) : (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1a1a2e', color: '#666', fontSize: 12 }}>
        {clip.name || 'Image'}
      </div>
    );
  }
  if (clip.type === 'text') {
    return <TextCanvasPreview clip={clip} currentFrame={currentFrame} fps={fps} />;
  }
  return null;
};

const SelectionOverlay: React.FC<{ clip: Clip; pw: number; ph: number; scale: number }> = ({ clip, pw, ph, scale }) => {
  const dispatch = useEditorStore((s) => s.dispatch);
  const allClips = useEditorStore((s) => s.clips);
  const setClips = useEditorStore((s) => s.setClips);
  const dr = getClipDisplayRect(clip, pw, ph);
  const dragRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0, origW: 0, origH: 0, type: '' });
  const x = dr.x * scale, y = dr.y * scale, w = dr.w * scale, h = dr.h * scale;
  const handles = [
    { id: 'tl', cx: 0, cy: 0, cursor: 'nwse-resize' }, { id: 'tr', cx: w, cy: 0, cursor: 'nesw-resize' },
    { id: 'bl', cx: 0, cy: h, cursor: 'nesw-resize' }, { id: 'br', cx: w, cy: h, cursor: 'nwse-resize' },
    { id: 'tm', cx: w/2, cy: 0, cursor: 'ns-resize' }, { id: 'bm', cx: w/2, cy: h, cursor: 'ns-resize' },
    { id: 'ml', cx: 0, cy: h/2, cursor: 'ew-resize' }, { id: 'mr', cx: w, cy: h/2, cursor: 'ew-resize' },
  ];
  const startDrag = useCallback((e: React.MouseEvent, type: string) => {
    e.preventDefault(); e.stopPropagation();
    if (dr.autoFit) setClips(allClips.map(c => c.id === clip.id ? { ...c, x: Math.round(dr.x), y: Math.round(dr.y), width: Math.round(dr.w), height: Math.round(dr.h) } : c));
    const ax = dr.autoFit ? Math.round(dr.x) : clip.x, ay = dr.autoFit ? Math.round(dr.y) : clip.y;
    const aw = dr.autoFit ? Math.round(dr.w) : clip.width, ah = dr.autoFit ? Math.round(dr.h) : clip.height;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: ax, origY: ay, origW: aw, origH: ah, type };
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - dragRef.current.startX) / scale, dy = (ev.clientY - dragRef.current.startY) / scale;
      const { origX: ox, origY: oy, origW: ow, origH: oh, type: dt } = dragRef.current;
      let nx = ox, ny = oy, nw = ow, nh = oh;
      if (dt === 'move') { nx = Math.round(ox + dx); ny = Math.round(oy + dy); }
      else {
        if (dt.includes('l')) { nx = Math.round(ox + dx); nw = Math.round(ow - dx); }
        if (dt.includes('r')) nw = Math.round(ow + dx);
        if (dt.includes('t')) { ny = Math.round(oy + dy); nh = Math.round(oh - dy); }
        if (dt.includes('b')) nh = Math.round(oh + dy);
        if (nw < 10) nw = 10; if (nh < 10) nh = 10;
      }
      setClips(allClips.map(c => c.id === clip.id ? { ...c, x: nx, y: ny, width: nw, height: nh } : c));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      const cur = useEditorStore.getState().clips.find(c => c.id === clip.id);
      if (!cur) return;
      const o = dragRef.current; const changes: Partial<Clip> = {};
      if (cur.x !== o.origX) changes.x = cur.x; if (cur.y !== o.origY) changes.y = cur.y;
      if (cur.width !== o.origW) changes.width = cur.width; if (cur.height !== o.origH) changes.height = cur.height;
      if (Object.keys(changes).length > 0) dispatch(new UpdateClipCommand(clip.id, changes));
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }, [clip, dr, scale, allClips, dispatch, setClips]);

  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, pointerEvents: 'none', zIndex: 20 }}>
      <div style={{ position: 'absolute', inset: -1, border: `2px solid ${theme.colors.accent.blue}`, pointerEvents: 'none' }} />
      <div onMouseDown={(e) => startDrag(e, 'move')} style={{ position: 'absolute', inset: HANDLE_SIZE/2, cursor: 'move', pointerEvents: 'auto' }} />
      {handles.map(hp => (
        <div key={hp.id} onMouseDown={(e) => startDrag(e, hp.id)} style={{
          position: 'absolute', left: hp.cx - HANDLE_SIZE/2, top: hp.cy - HANDLE_SIZE/2,
          width: HANDLE_SIZE, height: HANDLE_SIZE, background: '#fff',
          border: `2px solid ${theme.colors.accent.blue}`, borderRadius: 2,
          cursor: hp.cursor, pointerEvents: 'auto', zIndex: 25,
        }} />
      ))}
      <div style={{ position: 'absolute', bottom: -20, left: 0, fontSize: 9, color: theme.colors.accent.blue,
        background: 'rgba(0,0,0,0.7)', padding: '1px 4px', borderRadius: 2, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        {Math.round(dr.w)}x{Math.round(dr.h)} ({Math.round(dr.x)},{Math.round(dr.y)})
      </div>
    </div>
  );
};

const GuideOverlay: React.FC<{ mode: GuideMode }> = ({ mode }) => {
  if (mode === 'off') return null;
  const line = (c: string): React.CSSProperties => ({ position: 'absolute', background: c, pointerEvents: 'none' });
  const ss = mode === 'safe' || mode === 'all', sg = mode === 'grid' || mode === 'all', sc = mode === 'center' || mode === 'all';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
      {ss && <><div style={{ position: 'absolute', left: '5%', top: '5%', right: '5%', bottom: '5%', border: '1px dashed rgba(255,255,0,0.5)' }} />
        <div style={{ position: 'absolute', left: '10%', top: '10%', right: '10%', bottom: '10%', border: '1px dashed rgba(255,200,0,0.4)' }} /></>}
      {sg && <><div style={{ ...line('rgba(255,255,255,0.15)'), left: '33.33%', top: 0, width: 1, height: '100%' }} />
        <div style={{ ...line('rgba(255,255,255,0.15)'), left: '66.66%', top: 0, width: 1, height: '100%' }} />
        <div style={{ ...line('rgba(255,255,255,0.15)'), top: '33.33%', left: 0, height: 1, width: '100%' }} />
        <div style={{ ...line('rgba(255,255,255,0.15)'), top: '66.66%', left: 0, height: 1, width: '100%' }} /></>}
      {sc && <><div style={{ ...line('rgba(0,150,255,0.4)'), left: '50%', top: 0, width: 1, height: '100%' }} />
        <div style={{ ...line('rgba(0,150,255,0.4)'), top: '50%', left: 0, height: 1, width: '100%' }} /></>}
    </div>
  );
};

export const PreviewCanvas: React.FC = () => {
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const fps = useEditorStore((s) => s.fps);
  const clips = useEditorStore((s) => s.clips);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const pw = useEditorStore((s) => s.projectWidth);
  const ph = useEditorStore((s) => s.projectHeight);
  const aspectPreset = useEditorStore((s) => s.aspectPreset);
  const setAspectPreset = useEditorStore((s) => s.setAspectPreset);
  const fitMode = useEditorStore((s) => s.fitMode);
  const setFitMode = useEditorStore((s) => s.setFitMode);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const mediaItems = useEditorStore((s) => s.mediaItems);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const [guideMode, setGuideMode] = useState<GuideMode>('off');
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });

  useEffect(() => {
    const el = canvasWrapRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => { const e = entries[0]; if (e) setContainerSize({ w: e.contentRect.width, h: e.contentRect.height }); });
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const scale = Math.min(containerSize.w / pw, containerSize.h / ph);
  const displayW = pw * scale, displayH = ph * scale;
  const visibleClips = useMemo(() => getVisibleClips(clips, currentFrame), [clips, currentFrame]);
  const visibleIds = useMemo(() => new Set(visibleClips.map(v => v.clip.id)), [visibleClips]);
  const nextGuide = () => setGuideMode(GUIDE_MODES[(GUIDE_MODES.indexOf(guideMode) + 1) % GUIDE_MODES.length]);
  const nextFit = () => { const m: FitMode[] = ['fit', 'fill', 'stretch']; setFitMode(m[(m.indexOf(fitMode) + 1) % m.length]); };
  const btn: React.CSSProperties = { background: theme.colors.bg.elevated, color: theme.colors.text.secondary, border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm, padding: '2px 6px', cursor: 'pointer', fontSize: theme.fontSize.xs };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.colors.bg.primary }}>
      <div ref={canvasWrapRef} onClick={(e) => { if (e.target === e.currentTarget) clearSelection(); }}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 8, position: 'relative' }}>
        <div style={{ position: 'relative', width: displayW, height: displayH, background: '#000', overflow: 'visible', borderRadius: theme.radius.sm }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: theme.radius.sm }}>
            {visibleClips.map(({ clip }) => {
              const dr = getClipDisplayRect(clip, pw, ph);
              const opacity = getClipOpacity(clip, currentFrame);
              return (
                <div key={clip.id} style={{
                  position: 'absolute', left: dr.x * scale, top: dr.y * scale,
                  width: dr.w * scale, height: dr.h * scale,
                  opacity, filter: getClipFilter(clip),
                  transition: 'opacity 0.05s linear', overflow: 'hidden',
                }}>
                  <ClipMedia clip={clip} isPlaying={isPlaying} currentFrame={currentFrame} fps={fps} mediaItems={mediaItems} />
                </div>
              );
            })}
          </div>
          <GuideOverlay mode={guideMode} />
          {selectedClipIds.map(sid => {
            if (!visibleIds.has(sid)) return null;
            const sc = clips.find(c => c.id === sid);
            if (!sc) return null;
            return <SelectionOverlay key={sid} clip={sc} pw={pw} ph={ph} scale={scale} />;
          })}
          {visibleClips.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: theme.colors.text.muted, gap: 8 }}>
              <span style={{ fontSize: 40 }}>{'\u{1F3AC}'}</span>
              <span style={{ fontSize: theme.fontSize.md }}>No clips at current frame</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: theme.colors.bg.secondary, borderTop: `1px solid ${theme.colors.border.default}`, flexWrap: 'wrap' }}>
        {PRESETS.map(p => (<button key={p} onClick={() => setAspectPreset(p)} style={{ ...btn, background: aspectPreset === p ? theme.colors.accent.blue : theme.colors.bg.elevated, color: aspectPreset === p ? '#fff' : theme.colors.text.secondary }}>{p}</button>))}
        <div style={{ width: 1, height: 16, background: theme.colors.border.strong }} />
        <button onClick={nextFit} style={btn}>{fitMode.toUpperCase()}</button>
        <button onClick={nextGuide} style={btn}>Guide: {GUIDE_LABELS[guideMode]}</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'monospace', fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>{pw}x{ph} | {fps}fps | {frameToTime(currentFrame, fps)}</span>
      </div>
    </div>
  );
};