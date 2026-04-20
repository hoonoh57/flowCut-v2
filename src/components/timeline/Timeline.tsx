import React, { useRef, useCallback, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { TimelineControls } from './TimelineControls';
import { TrackLabel } from './TrackLabel';
import { TrackLane, getTrackHeight } from './TrackLane';
import { Ruler } from './Ruler';
import { Playhead } from './Playhead';
import { theme } from '../../styles/theme';

// TRACK_HEIGHT is now dynamic per track type via getTrackHeight
const RULER_HEIGHT = 30;
const LABEL_WIDTH = 180;

export const Timeline: React.FC = () => {
  const tracks = useEditorStore((s) => s.tracks);
  const zoom = useEditorStore((s) => s.zoomLevel);
  const setZoomLevel = useEditorStore((s) => s.setZoomLevel);
  const fps = useEditorStore((s) => s.fps);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const clips = useEditorStore((s) => s.clips);
  const setSelectedClipIds = useEditorStore((s) => s.setSelectedClipIds);

  const laneContainerRef = useRef<HTMLDivElement>(null);
  const labelContainerRef = useRef<HTMLDivElement>(null);
  const rulerContainerRef = useRef<HTMLDivElement>(null);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; x: number; y: number; w: number; h: number; active: boolean } | null>(null);

  const sortedTracks = [...tracks].sort((a, b) => {
    const pri: Record<string, number> = { text: 3, video: 2, audio: 1 };
    const pa = pri[a.type] ?? 0, pb = pri[b.type] ?? 0;
    if (pa !== pb) return pb - pa;
    return (b.order ?? 0) - (a.order ?? 0);
  });

  const totalHeight = sortedTracks.reduce((sum, t) => sum + getTrackHeight(t.type, t.height), 0);
  const maxClipFrame = clips.reduce((mx, c) => Math.max(mx, c.startFrame + c.durationFrames), 0);
  const totalWidth = Math.max(3000, ((maxClipFrame / fps) + 30) * 100 * zoom);
  const pxPerFrame = (100 * zoom) / fps;

  const onLaneScroll = useCallback(() => {
    const el = laneContainerRef.current;
    if (!el) return;
    if (labelContainerRef.current) labelContainerRef.current.scrollTop = el.scrollTop;
    if (rulerContainerRef.current) rulerContainerRef.current.scrollLeft = el.scrollLeft;
    setScrollLeft(el.scrollLeft);
  }, []);

  const onRulerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsPlaying(false);
    const container = rulerContainerRef.current;
    if (!container) return;
    const seek = (ev: { clientX: number }) => {
      const rect = container.getBoundingClientRect();
      const px = ev.clientX - rect.left + container.scrollLeft;
      setCurrentFrame(Math.max(0, Math.round(px / pxPerFrame)));
    };
    seek(e);
    const onMove = (ev: MouseEvent) => seek(ev);
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pxPerFrame, setCurrentFrame, setIsPlaying]);

  
  // Rubber band selection
  const onLaneMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start rubber band on empty area (not on clips)
    const target = e.target as HTMLElement;
    if (target !== e.currentTarget && !target.dataset.laneArea) return;
    
    const container = laneContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX - rect.left + container.scrollLeft;
    const startY = e.clientY - rect.top + container.scrollTop;
    
    setRubberBand({ startX, startY, x: startX, y: startY, w: 0, h: 0, active: true });
    
    const onMove = (ev: MouseEvent) => {
      const curX = ev.clientX - rect.left + container.scrollLeft;
      const curY = ev.clientY - rect.top + container.scrollTop;
      const x = Math.min(startX, curX);
      const y = Math.min(startY, curY);
      const w = Math.abs(curX - startX);
      const h = Math.abs(curY - startY);
      setRubberBand({ startX, startY, x, y, w, h, active: true });
      
      // Calculate which clips are inside the rubber band
      const state = useEditorStore.getState();
      const pxPF = (100 * state.zoomLevel) / state.fps;
      const trackList = [...state.tracks].sort((a, b) => {
        const pri: Record<string, number> = { text: 3, video: 2, audio: 1 };
        return (pri[b.type] ?? 0) - (pri[a.type] ?? 0) || (b.order ?? 0) - (a.order ?? 0);
      });
      
      let trackY = 0;
      const hitIds: string[] = [];
      for (const tk of trackList) {
        const tkH = tk.height > 0 ? tk.height : (tk.type === 'video' ? 80 : tk.type === 'audio' ? 60 : 40);
        const trackClips = state.clips.filter(c => c.trackId === tk.id);
        for (const cl of trackClips) {
          const clipLeft = cl.startFrame * pxPF;
          const clipRight = clipLeft + cl.durationFrames * pxPF;
          const clipTop = trackY;
          const clipBottom = trackY + tkH;
          // Check intersection
          if (clipRight > x && clipLeft < x + w && clipBottom > y && clipTop < y + h) {
            hitIds.push(cl.id);
          }
        }
        trackY += tkH;
      }
      state.setSelectedClipIds(hitIds);
    };
    
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setRubberBand(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const rulerPlayheadX = currentFrame * pxPerFrame - scrollLeft;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: theme.colors.bg.primary }}>
      <TimelineControls />

      {/* Ruler row */}
      <div style={{ display: 'flex', height: RULER_HEIGHT, flexShrink: 0 }}>
        <div style={{
          width: LABEL_WIDTH, minWidth: LABEL_WIDTH, height: RULER_HEIGHT,
          background: theme.colors.bg.secondary,
          borderBottom: `1px solid ${theme.colors.border.default}`,
          borderRight: `1px solid ${theme.colors.border.default}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>Tracks</span>
        </div>
        <div
          ref={rulerContainerRef}
          onMouseDown={onRulerMouseDown}
          style={{
            flex: 1, height: RULER_HEIGHT,
            overflowX: 'hidden', overflowY: 'hidden',
            position: 'relative', background: theme.colors.bg.tertiary,
            borderBottom: `1px solid ${theme.colors.border.default}`,
            cursor: 'pointer',
          }}
        >
          <Ruler totalWidth={totalWidth} />
          <div style={{
            position: 'absolute', left: rulerPlayheadX - 6, bottom: 0,
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderBottom: `8px solid ${theme.colors.accent.red}`,
            zIndex: 50, pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', left: rulerPlayheadX - 1, top: 0,
            width: 2, height: RULER_HEIGHT,
            background: theme.colors.accent.red, zIndex: 49, pointerEvents: 'none',
          }} />
        </div>
      </div>

      {/* Track body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Labels — NO guide line here */}
        <div
          ref={labelContainerRef}
          style={{
            width: LABEL_WIDTH, minWidth: LABEL_WIDTH,
            overflowY: 'hidden', overflowX: 'hidden',
            background: theme.colors.bg.secondary,
            borderRight: `1px solid ${theme.colors.border.default}`,
          }}
        >
          {sortedTracks.map((track) => (
            <TrackLabel key={track.id} track={track} />
          ))}
        </div>

        {/* Lanes */}
        <div
          ref={laneContainerRef}
          onScroll={onLaneScroll}
          onMouseDown={onLaneMouseDown}
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
        >
          <div data-lane-area="true" style={{ width: totalWidth, minHeight: totalHeight, position: 'relative' }}>
            {sortedTracks.map((track, idx) => (
              <TrackLane key={track.id} track={track} trackIndex={idx} totalWidth={totalWidth} />
            ))}
            <Playhead containerRef={laneContainerRef} />
            {rubberBand && rubberBand.w > 3 && (
              <div style={{
                position: 'absolute', left: rubberBand.x, top: rubberBand.y,
                width: rubberBand.w, height: rubberBand.h,
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.6)',
                pointerEvents: 'none', zIndex: 100,
                borderRadius: 2,
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Zoom */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
        background: theme.colors.bg.secondary, borderTop: `1px solid ${theme.colors.border.default}`,
      }}>
        <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>Zoom</span>
        <input type="range" min={0.1} max={5} step={0.1} value={zoom}
          onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
          style={{ flex: 1, maxWidth: 200 }} />
        <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.secondary, minWidth: 40, textAlign: 'right' }}>
          {zoom.toFixed(1)}x
        </span>
      </div>
    </div>
  );
};