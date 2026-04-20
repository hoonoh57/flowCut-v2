import React from 'react';
import { theme } from '../../styles/theme';
import { useEditorStore } from '../../stores/editorStore';
import type { Track } from '../../types/track';
import { getTrackHeight } from './TrackLane';

interface TrackLabelProps {
  track: Track;
}

const smallBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid transparent',
  cursor: 'pointer',
  padding: '1px 4px',
  fontSize: 11,
  borderRadius: 3,
  lineHeight: 1.2,
  fontWeight: 600,
  minWidth: 22,
  textAlign: 'center' as const,
};

export const TrackLabel: React.FC<TrackLabelProps> = ({ track }) => {
  const setTracks = useEditorStore((s) => s.setTracks);
  const tracks = useEditorStore((s) => s.tracks);
  const toggleTrackMute = useEditorStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useEditorStore((s) => s.toggleTrackSolo);
  const trackH = getTrackHeight(track.type, track.height);

  const typeColor = track.type === 'video'
    ? theme.colors.track.video
    : track.type === 'audio'
    ? theme.colors.track.audio
    : theme.colors.track.text;

  const toggleLock = () => {
    setTracks(tracks.map(t => t.id === track.id ? { ...t, locked: !t.locked } : t));
  };
  const toggleVisible = () => {
    setTracks(tracks.map(t => t.id === track.id ? { ...t, visible: t.visible === false ? true : false } : t));
  };

  const isMuted = !!track.muted;
  const isSolo = !!track.solo;

  return (
    <div style={{
      height: trackH,
      display: 'flex',
      alignItems: 'center',
      padding: '0 6px',
      gap: 4,
      borderBottom: `1px solid ${theme.colors.border.default}`,
      background: theme.colors.bg.secondary,
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: 3, height: 24, borderRadius: 2,
        background: typeColor, flexShrink: 0,
      }} />

      <span style={{
        flex: 1, fontSize: theme.fontSize.sm,
        color: theme.colors.text.primary,
        overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', userSelect: 'none',
      }}>
        {(() => {
          const n = track.name;
          return n
            .replace(/^Video\s*/i, '비디오 ')
            .replace(/^Audio\s*/i, '오디오 ')
            .replace(/^text\s*/i, '텍스트 ')
            .trim();
        })()}
      </span>

      <button
        onClick={() => toggleTrackMute(track.id)}
        title={isMuted ? '뮤트 해제' : '뮤트'}
        style={{
          ...smallBtn,
          color: isMuted ? theme.colors.accent.red : theme.colors.text.muted,
          background: isMuted ? 'rgba(239,68,68,0.15)' : 'transparent',
          borderColor: isMuted ? theme.colors.accent.red : 'transparent',
        }}
      >
        M
      </button>

      <button
        onClick={() => toggleTrackSolo(track.id)}
        title={isSolo ? '단독 해제' : '단독 재생'}
        style={{
          ...smallBtn,
          color: isSolo ? theme.colors.accent.amber : theme.colors.text.muted,
          background: isSolo ? 'rgba(245,158,11,0.15)' : 'transparent',
          borderColor: isSolo ? theme.colors.accent.amber : 'transparent',
        }}
      >
        S
      </button>

      <button onClick={toggleVisible} title={track.visible === false ? '표시' : '숨기기'} style={{
        ...smallBtn, color: track.visible === false ? theme.colors.text.muted : theme.colors.text.secondary, fontSize: 13,
      }}>
        {track.visible === false ? '🙈' : '👁'}
      </button>

      <button onClick={toggleLock} title={track.locked ? '잠금 해제' : '잠금'} style={{
        ...smallBtn, color: track.locked ? theme.colors.accent.amber : theme.colors.text.secondary, fontSize: 13,
      }}>
        {track.locked ? '🔒' : '🔓'}
      </button>
    </div>
  );
};
