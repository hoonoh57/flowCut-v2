import React, { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { UpdateClipCommand } from '../../stores/commands/UpdateClipCommand';
import { theme } from '../../styles/theme';
import type { VolumePoint } from '../../types/clip';

const AUDIO_PRESETS = [
  { id: 'A01', name: 'Fade In', icon: '🔊', apply: { fadeIn: 30 } },
  { id: 'A02', name: 'Fade Out', icon: '🔉', apply: { fadeOut: 30 } },
  { id: 'A03', name: 'Fade Both', icon: '🔈', apply: { fadeIn: 20, fadeOut: 20 } },
  { id: 'A04', name: 'Mute', icon: '🔇', apply: { muted: true } },
  { id: 'A05', name: '50%', icon: '🔉', apply: { volume: 50 } },
  { id: 'A06', name: '150%', icon: '🔊', apply: { volume: 150 } },
  { id: 'A07', name: '200%', icon: '💥', apply: { volume: 200 } },
  { id: 'A08', name: '0.5x', icon: '🐢', apply: { speed: 0.5 } },
  { id: 'A09', name: '2x', icon: '⚡', apply: { speed: 2 } },
  { id: 'A10', name: 'Dramatic', icon: '🎭', apply: {
    volumeEnvelope: [{ position: 0, volume: 20 }, { position: 0.3, volume: 100 }, { position: 0.7, volume: 150 }, { position: 1, volume: 30 }]
  }},
  { id: 'A11', name: 'Swell', icon: '🌊', apply: {
    volumeEnvelope: [{ position: 0, volume: 10 }, { position: 0.5, volume: 60 }, { position: 0.85, volume: 150 }, { position: 1, volume: 100 }]
  }},
  { id: 'A12', name: 'Dip', icon: '🕳️', apply: {
    volumeEnvelope: [{ position: 0, volume: 100 }, { position: 0.35, volume: 20 }, { position: 0.65, volume: 20 }, { position: 1, volume: 100 }]
  }},
  { id: 'A13', name: 'Pulse', icon: '💓', apply: {
    volumeEnvelope: [{ position: 0, volume: 100 }, { position: 0.15, volume: 30 }, { position: 0.3, volume: 100 }, { position: 0.45, volume: 30 }, { position: 0.6, volume: 100 }, { position: 0.75, volume: 30 }, { position: 0.9, volume: 100 }, { position: 1, volume: 60 }]
  }},
];

export const AudioPanel: React.FC = () => {
  const selectedClipIds = useEditorStore(s => s.selectedClipIds);
  const clips = useEditorStore(s => s.clips);
  const dispatch = useEditorStore(s => s.dispatch);
  const tracks = useEditorStore(s => s.tracks);

  const selectedClip = clips.find(c => c.id === selectedClipIds[0]);
  const audioClips = clips.filter(c => c.type === 'audio' || c.type === 'video');
  const isMedia = selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'audio');

  const applyPreset = (preset: typeof AUDIO_PRESETS[0]) => {
    if (!selectedClip) return;
    dispatch(new UpdateClipCommand(selectedClip.id, preset.apply));
  };

  const resetEnvelope = () => {
    if (!selectedClip) return;
    dispatch(new UpdateClipCommand(selectedClip.id, {
      volumeEnvelope: [{ position: 0, volume: 100 }, { position: 1, volume: 100 }],
      fadeIn: 0, fadeOut: 0, volume: 100, muted: false, speed: 1,
    }));
  };

  const presetBtn = (active?: boolean): React.CSSProperties => ({
    padding: '6px 8px', borderRadius: 6, border: 'none',
    background: active ? theme.colors.accent.blue : theme.colors.bg.tertiary,
    color: active ? '#fff' : theme.colors.text.secondary,
    cursor: 'pointer', fontSize: 10, fontWeight: 600, textAlign: 'center' as const,
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, minWidth: 52,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Selected clip controls */}
      {isMedia && selectedClip && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: theme.colors.bg.elevated, border: `1px solid ${theme.colors.border.subtle}` }}>
          <div style={{ fontSize: 12, color: theme.colors.text.primary, fontWeight: 600 }}>{selectedClip.name}</div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>볼륨</span>
            <input type="range" min={0} max={200} value={selectedClip.volume}
              onChange={e => { const v = Number(e.target.value); const env = selectedClip.volumeEnvelope && selectedClip.volumeEnvelope.length >= 2 ? selectedClip.volumeEnvelope.map((p: VolumePoint, i: number) => (i === 0 || i === selectedClip.volumeEnvelope!.length - 1) ? { ...p, volume: v } : p) : [{ position: 0, volume: v }, { position: 1, volume: v }]; dispatch(new UpdateClipCommand(selectedClip.id, { volume: v, volumeEnvelope: env })); }}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.volume}%</span>
          </div>

          {/* Mute */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>뮤트</span>
            <button onClick={() => dispatch(new UpdateClipCommand(selectedClip.id, { muted: !selectedClip.muted }))} style={{
              padding: '4px 12px', borderRadius: 4, background: selectedClip.muted ? theme.colors.accent.red : theme.colors.bg.tertiary,
              color: selectedClip.muted ? '#fff' : theme.colors.text.secondary, border: `1px solid ${theme.colors.border.default}`, cursor: 'pointer', fontSize: 10,
            }}>
              {selectedClip.muted ? '🔇 해제' : '🔊 뮤트'}
            </button>
          </div>

          {/* Speed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>속도</span>
            <input type="range" min={0.25} max={4} step={0.25} value={selectedClip.speed}
              onChange={e => dispatch(new UpdateClipCommand(selectedClip.id, { speed: Number(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.speed}x</span>
          </div>

          {/* Fade In */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>Fade In</span>
            <input type="range" min={0} max={Math.floor(selectedClip.durationFrames * 0.4)} value={selectedClip.fadeIn}
              onChange={e => dispatch(new UpdateClipCommand(selectedClip.id, { fadeIn: Number(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.fadeIn}f</span>
          </div>

          {/* Fade Out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>Fade Out</span>
            <input type="range" min={0} max={Math.floor(selectedClip.durationFrames * 0.4)} value={selectedClip.fadeOut}
              onChange={e => dispatch(new UpdateClipCommand(selectedClip.id, { fadeOut: Number(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.fadeOut}f</span>
          </div>

          {/* Envelope info */}
          <div style={{ fontSize: 9, color: theme.colors.text.muted, padding: '4px 0', borderTop: `1px solid ${theme.colors.border.subtle}` }}>
            팁: 클립 선택 후 파형 영역을 더블클릭하여 볼륨 포인트 추가, 드래그로 조절, 우클릭으로 삭제
          </div>

          {/* Reset */}
          <button onClick={resetEnvelope} style={{
            padding: '6px', borderRadius: 4, border: `1px solid ${theme.colors.border.default}`,
            background: theme.colors.bg.tertiary, color: theme.colors.text.secondary, cursor: 'pointer', fontSize: 10,
          }}>
            초기화
          </button>
        </div>
      )}

      {/* Audio Effect Presets */}
      <div style={{ fontSize: 11, color: theme.colors.text.secondary, fontWeight: 600 }}>오디오 프리셋</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {AUDIO_PRESETS.map(p => (
          <button key={p.id} onClick={() => applyPreset(p)} disabled={!isMedia}
            style={{ ...presetBtn(), opacity: isMedia ? 1 : 0.4 }}>
            <span style={{ fontSize: 16 }}>{p.icon}</span>
            <span>{p.name}</span>
            <span style={{ fontSize: 8, color: theme.colors.text.muted }}>{p.id}</span>
          </button>
        ))}
      </div>

      {/* Mixer */}
      <div style={{ fontSize: 11, color: theme.colors.text.secondary, fontWeight: 600, marginTop: 4 }}>믹서</div>
      {audioClips.length === 0 && (
        <div style={{ color: theme.colors.text.muted, fontSize: 10, textAlign: 'center', paddingTop: 10 }}>오디오/비디오 클립이 없습니다</div>
      )}
      {audioClips.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, background: theme.colors.bg.tertiary }}>
          <span style={{ fontSize: 9, color: c.type === 'audio' ? theme.colors.track.audio : theme.colors.track.video, width: 10 }}>{'●'}</span>
          <span style={{ flex: 1, fontSize: 10, color: theme.colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
          <input type="range" min={0} max={200} value={c.volume}
            onChange={e => dispatch(new UpdateClipCommand(c.id, { volume: Number(e.target.value) }))}
            style={{ width: 50 }} />
          <span style={{ fontSize: 9, color: theme.colors.text.muted, width: 28, textAlign: 'right' }}>{c.volume}%</span>
          <button onClick={() => dispatch(new UpdateClipCommand(c.id, { muted: !c.muted }))} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: c.muted ? theme.colors.accent.red : theme.colors.text.muted,
          }}>{c.muted ? '🔇' : '🔊'}</button>
        </div>
      ))}

      {!isMedia && selectedClipIds.length > 0 && (
        <div style={{ fontSize: 10, color: theme.colors.text.muted, textAlign: 'center', paddingTop: 10 }}>
          비디오 또는 오디오 클립을 선택하세요
        </div>
      )}
    </div>
  );
};