import React, { useState, useCallback, useRef } from 'react';
import { PreviewCanvas } from '../preview/PreviewCanvas';
import { Timeline } from '../timeline/Timeline';
import { theme } from '../../styles/theme';

const MIN_PREVIEW = 120;
const MIN_TIMELINE = 120;
const SPLITTER_H = 6;

export const CenterArea: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  // previewFlex: fraction of available space for preview (0..1)
  const [previewFlex, setPreviewFlex] = useState(0.45);
  const [dragging, setDragging] = useState(false);

  const onSplitterDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startY = e.clientY;
    const container = containerRef.current;
    if (!container) return;
    const totalH = container.clientHeight - SPLITTER_H;
    const startPx = previewFlex * totalH;

    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      let newPx = startPx + dy;
      newPx = Math.max(MIN_PREVIEW, Math.min(totalH - MIN_TIMELINE, newPx));
      setPreviewFlex(newPx / totalH);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [previewFlex]);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* Preview */}
      <div style={{ flex: previewFlex, minHeight: MIN_PREVIEW, overflow: 'hidden' }}>
        <PreviewCanvas />
      </div>

      {/* Draggable Splitter */}
      <div
        onMouseDown={onSplitterDown}
        style={{
          height: SPLITTER_H,
          flexShrink: 0,
          background: dragging ? theme.colors.accent.blue : theme.colors.border.default,
          cursor: 'row-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: dragging ? 'none' : 'background 0.15s',
          userSelect: 'none',
        }}
      >
        {/* Grip dots */}
        <div style={{
          width: 40, height: 2, borderRadius: 1,
          background: dragging ? '#fff' : theme.colors.text.muted,
          opacity: 0.6,
        }} />
      </div>

      {/* Timeline */}
      <div style={{ flex: 1 - previewFlex, minHeight: MIN_TIMELINE, overflow: 'hidden' }}>
        <Timeline />
      </div>
    </div>
  );
};
