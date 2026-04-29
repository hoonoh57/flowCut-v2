import React, { useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { SubtitlePresetId } from '../../stores/slices/subtitleSlice';

const STYLES: Record<SubtitlePresetId, React.CSSProperties> = {
  none: { display: 'none' },
  clean: {
    fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif",
    fontSize: 28, fontWeight: 700, color: '#fff',
    textShadow: '1px 1px 4px rgba(0,0,0,0.9), -1px -1px 4px rgba(0,0,0,0.9)',
  },
  karaoke: {
    fontFamily: "'Noto Sans KR', sans-serif",
    fontSize: 30, fontWeight: 900, color: '#fff',
    textShadow: '0 0 8px rgba(59,130,246,0.6), 2px 2px 4px rgba(0,0,0,0.9)',
  },
  pill: {
    fontFamily: "'Noto Sans KR', sans-serif",
    fontSize: 24, fontWeight: 700, color: '#fff',
    background: 'rgba(0,0,0,0.7)', borderRadius: 20, padding: '4px 16px',
  },
  pop: {
    fontFamily: "'Noto Sans KR', sans-serif",
    fontSize: 32, fontWeight: 900, color: '#ffdd57',
    textShadow: '2px 2px 0 #000, -1px -1px 0 #000',
  },
  webtoon: {
    fontFamily: "'Noto Sans KR', sans-serif",
    fontSize: 22, fontWeight: 600, color: '#000',
    background: 'rgba(255,255,255,0.92)', borderRadius: 12,
    padding: '6px 14px', boxShadow: '2px 4px 8px rgba(0,0,0,0.3)',
  },
  typewriter: {
    fontFamily: "'Courier New', monospace",
    fontSize: 24, fontWeight: 400, color: '#00ff88',
    background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '4px 12px',
  },
  cinematic: {
    fontFamily: "'Noto Sans KR', serif",
    fontSize: 26, fontWeight: 400, color: '#e0e0e0',
    textShadow: '1px 1px 3px rgba(0,0,0,0.95)', letterSpacing: 2,
  },
  impact: {
    fontFamily: "'Impact', 'Noto Sans KR', sans-serif",
    fontSize: 36, fontWeight: 900, color: '#ff4444',
    WebkitTextStroke: '2px #fff', textShadow: '3px 3px 0 #000',
    paintOrder: 'stroke fill' as any,
  },
};

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > max && cur) { chunks.push(cur.trim()); cur = w; }
    else cur += (cur ? ' ' : '') + w;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length > 0 ? chunks : [text];
}

interface Props { scale: number; displayW: number; displayH: number; }

export const SubtitleOverlay: React.FC<Props> = ({ scale, displayW, displayH }) => {
  const frame = useEditorStore(s => s.currentFrame);
  const fps = useEditorStore(s => s.fps);
  const segments = useEditorStore(s => s.subtitleSegments);
  const preset = useEditorStore(s => s.subtitlePreset);
  const visible = useEditorStore(s => s.subtitleVisible);

  const seg = useMemo(() => {
    for (const s of segments) { if (frame >= s.startFrame && frame < s.endFrame) return s; }
    return null;
  }, [segments, frame]);

  if (!visible || preset === 'none' || !seg || segments.length === 0) return null;

  const chunks = chunkText(seg.text, 15);
  let text = seg.text;
  if (chunks.length > 1) {
    const dur = (seg.endFrame - seg.startFrame) / fps;
    const each = dur / chunks.length;
    const elapsed = (frame - seg.startFrame) / fps;
    text = chunks[Math.min(chunks.length - 1, Math.floor(elapsed / each))];
  }

  const s = STYLES[preset] || STYLES.clean;
  const sf = displayW / 1920;

  return (
    <div style={{
      position: 'absolute', bottom: displayH * 0.08, left: '50%',
      transform: 'translateX(-50%)', zIndex: 18, pointerEvents: 'none',
      textAlign: 'center', maxWidth: displayW * 0.85,
      whiteSpace: 'pre-wrap', wordBreak: 'keep-all', lineHeight: 1.4,
      ...s, fontSize: ((s.fontSize as number) || 28) * sf,
    }}>
      {text}
    </div>
  );
};
