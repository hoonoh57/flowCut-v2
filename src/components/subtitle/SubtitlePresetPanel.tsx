import React, { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { theme } from '../../styles/theme';
import type { SubtitlePresetId, SubtitleSegment } from '../../stores/slices/subtitleSlice';

const PRESETS: { id: SubtitlePresetId; name: string; icon: string }[] = [
  { id: 'none',       name: '없음',      icon: '🚫' },
  { id: 'clean',      name: '클린',      icon: '✨' },
  { id: 'karaoke',    name: '카라오케',  icon: '🎤' },
  { id: 'pill',       name: '필',        icon: '💊' },
  { id: 'pop',        name: '팝',        icon: '💥' },
  { id: 'webtoon',    name: '웹툰',      icon: '💬' },
  { id: 'typewriter', name: '타자기',    icon: '⌨️' },
  { id: 'cinematic',  name: '시네마틱',  icon: '🎬' },
  { id: 'impact',     name: '임팩트',    icon: '⚡' },
];

function extractFromAudioClips(clips: any[]): SubtitleSegment[] {
  return clips
    .filter(c => c.type === 'audio' && c.name &&
      (c.name.startsWith('TTS:') || c.name.startsWith('Narration:')))
    .map(c => ({
      text: c.name.replace(/^(TTS:|Narration:)\s*/, '').trim(),
      startFrame: c.startFrame,
      endFrame: c.startFrame + c.durationFrames,
    }))
    .filter(s => s.text.length > 0)
    .sort((a, b) => a.startFrame - b.startFrame);
}

export const SubtitlePresetPanel: React.FC = () => {
  const preset = useEditorStore(s => s.subtitlePreset);
  const setPreset = useEditorStore(s => s.setSubtitlePreset);
  const visible = useEditorStore(s => s.subtitleVisible);
  const setVisible = useEditorStore(s => s.setSubtitleVisible);
  const segments = useEditorStore(s => s.subtitleSegments);
  const setSegments = useEditorStore(s => s.setSubtitleSegments);
  const clearSubtitles = useEditorStore(s => s.clearSubtitles);
  const clips = useEditorStore(s => s.clips);
  const [status, setStatus] = useState('');

  const handleGenerate = () => {
    const found = extractFromAudioClips(clips);
    if (found.length === 0) {
      setStatus('내레이션(TTS/Narration) 오디오 클립을 찾을 수 없습니다.');
      return;
    }
    setSegments(found);
    setVisible(true);
    if (preset === 'none') setPreset('clean');
    setStatus(found.length + '개 자막 세그먼트가 생성되었습니다.');
  };

  const handleClear = () => {
    clearSubtitles();
    setStatus('자막이 제거되었습니다.');
  };

  return (
    <div style={{
      padding: 10, borderRadius: 6,
      background: theme.colors.bg.elevated,
      border: '1px solid ' + theme.colors.border.subtle,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.colors.text.primary, marginBottom: 8 }}>
        자막 (Subtitle)
      </div>

      {/* Generate / Clear buttons */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button onClick={handleGenerate} style={{
          flex: 1, padding: '6px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
          background: theme.colors.accent.blue, color: '#fff', fontSize: 10, fontWeight: 600,
        }}>
          내레이션에서 자막 생성
        </button>
        {segments.length > 0 && (
          <button onClick={handleClear} style={{
            padding: '6px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
            background: theme.colors.bg.tertiary, color: theme.colors.text.secondary, fontSize: 10,
          }}>
            제거
          </button>
        )}
      </div>

      {status && (
        <div style={{ fontSize: 10, color: theme.colors.text.muted, marginBottom: 6 }}>{status}</div>
      )}

      {/* Preset grid — only show when segments exist */}
      {segments.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: theme.colors.text.secondary }}>
              {segments.length}개 세그먼트
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 10, color: theme.colors.text.secondary }}>
              <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
              프리뷰 표시
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)} style={{
                padding: '4px 2px', borderRadius: 4, cursor: 'pointer', fontSize: 9,
                border: preset === p.id ? '2px solid ' + theme.colors.accent.blue : '2px solid transparent',
                background: preset === p.id ? theme.colors.accent.blue + '22' : theme.colors.bg.tertiary,
                color: preset === p.id ? theme.colors.accent.blue : theme.colors.text.secondary,
                fontWeight: preset === p.id ? 700 : 400,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}>
                <span style={{ fontSize: 13 }}>{p.icon}</span>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
