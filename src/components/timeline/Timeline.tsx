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

  const laneContainerRef = useRef<HTMLDivElement>(null);
  const labelContainerRef = useRef<HTMLDivElement>(null);
  const rulerContainerRef = useRef<HTMLDivElement>(null);

  const [scrollLeft, setScrollLeft] = useState(0);

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
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
        >
          <div style={{ width: totalWidth, minHeight: totalHeight, position: 'relative' }}>
            {sortedTracks.map((track, idx) => (
              <TrackLane key={track.id} track={track} trackIndex={idx} totalWidth={totalWidth} />
            ))}
            <Playhead containerRef={laneContainerRef} />
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