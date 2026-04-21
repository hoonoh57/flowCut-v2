import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { frameToTime } from '../../utils/timeFormat';
import { theme } from '../../styles/theme';

interface RulerProps {
  totalWidth: number;
}

export const Ruler: React.FC<RulerProps> = ({ totalWidth }) => {
  const zoom = useEditorStore((s) => s.zoomLevel);
  const fps = useEditorStore((s) => s.fps);
  const pxPerSec = 100 * zoom;
  const totalSec = Math.ceil(totalWidth / pxPerSec) + 2;
  const marks: { x: number; label: string; major: boolean }[] = [];
  for (let s = 0; s <= totalSec; s++) {
    marks.push({ x: s * pxPerSec, label: frameToTime(s * fps, fps), major: s % 5 === 0 });
    for (let sub = 1; sub < 4; sub++) {
      marks.push({ x: (s + sub / 4) * pxPerSec, label: '', major: false });
    }
  }
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const inPx = inPoint !== null ? inPoint * (pxPerSec / fps) : null;
  const outPx = outPoint !== null ? outPoint * (pxPerSec / fps) : null;

  return (
    <div style={{ position: 'relative', width: totalWidth, height: '100%', pointerEvents: 'none' }}>
      {/* In-Out Range highlight */}
      {inPx !== null && outPx !== null && outPx > inPx && (
        <div style={{
          position: 'absolute', left: inPx, top: 0,
          width: outPx - inPx, height: '100%',
          background: 'rgba(59, 130, 246, 0.2)',
          borderLeft: '2px solid #3b82f6',
          borderRight: '2px solid #3b82f6',
          zIndex: 5,
        }} />
      )}
      {inPx !== null && (
        <div style={{ position: 'absolute', left: inPx - 1, top: 0, width: 2, height: '100%', background: '#3b82f6', zIndex: 6 }}>
          <span style={{ position: 'absolute', top: -1, left: -6, fontSize: 8, color: '#3b82f6', fontWeight: 700, background: 'rgba(0,0,0,0.7)', padding: '0 2px', borderRadius: 2 }}>I</span>
        </div>
      )}
      {outPx !== null && (
        <div style={{ position: 'absolute', left: outPx - 1, top: 0, width: 2, height: '100%', background: '#3b82f6', zIndex: 6 }}>
          <span style={{ position: 'absolute', top: -1, right: -8, fontSize: 8, color: '#3b82f6', fontWeight: 700, background: 'rgba(0,0,0,0.7)', padding: '0 2px', borderRadius: 2 }}>O</span>
        </div>
      )}
      {marks.map((m, i) => (
        <div key={i} style={{ position: 'absolute', left: m.x, top: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 1, height: m.major ? 14 : m.label ? 10 : 6, background: m.major ? theme.colors.text.secondary : theme.colors.border.strong }} />
          {m.label && m.major && (
            <span style={{ fontSize: 9, color: theme.colors.text.muted, marginTop: 1, whiteSpace: 'nowrap', userSelect: 'none' }}>{m.label}</span>
          )}
        </div>
      ))}
    </div>
  );
};