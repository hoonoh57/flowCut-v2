import React, { useMemo, useCallback } from 'react';
import { DEFAULT_PROJECT } from '../../types/project';
import { useEditorStore } from '../../stores/editorStore';
import { TimelineClip } from './TimelineClip';
import { theme } from '../../styles/theme';
import type { Track } from '../../stores/slices/trackSlice';
import { createDefaultClip } from '../../types/clip';
import { AddClipCommand } from '../../stores/commands/AddClipCommand';
import { uid } from '../../utils/uid';

const TRACK_HEIGHT_VIDEO = 80;
const TRACK_HEIGHT_AUDIO = 60;
const TRACK_HEIGHT_TEXT = 40;

export function getTrackHeight(trackType: string, trackHeight?: number): number {
  if (trackHeight && trackHeight > 0) return trackHeight;
  if (trackType === 'video') return TRACK_HEIGHT_VIDEO;
  if (trackType === 'audio') return TRACK_HEIGHT_AUDIO;
  return TRACK_HEIGHT_TEXT;
}

interface TrackLaneProps {
  track: Track;
  trackIndex: number;
  totalWidth: number;
}

export const TrackLane: React.FC<TrackLaneProps> = ({ track, trackIndex, totalWidth }) => {
  const allClips = useEditorStore((s) => s.clips);
  const zoom = useEditorStore((s) => s.zoomLevel);
  const fps = useEditorStore((s) => s.fps);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const dispatch = useEditorStore((s) => s.dispatch);

  const clips = useMemo(
    () => allClips.filter((c) => c.trackId === track.id),
    [allClips, track.id]
  );

  const pxPerFrame = (100 * zoom) / fps;
  const trackH = getTrackHeight(track.type, track.height);

  const onClickLane = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) clearSelection();
  }, [clearSelection]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const mediaJson = e.dataTransfer.getData('application/x-media');
    if (!mediaJson) return;
    try {
      const media = JSON.parse(mediaJson);
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const startFrame = Math.max(0, Math.round(px / pxPerFrame));
      const clip = createDefaultClip({
        id: uid(),
        name: media.name || 'Clip',
        type: media.type === 'audio' ? 'audio' : media.type === 'image' ? 'image' : 'video',
        trackId: track.id,
        startFrame,
        durationFrames: Math.round((media.duration || 5) * fps),
        src: media.url,
        mediaId: media.id,
        localPath: media.localPath || '',
        width: media.width || DEFAULT_PROJECT.width,
        height: media.height || DEFAULT_PROJECT.height,
      });
      const rm = useEditorStore.getState().rippleMode || false;
      dispatch(new AddClipCommand(clip, rm));
    } catch (err) { console.error('DROP ERROR:', err, 'track:', track.id, track.type); }
  }, [track.id, pxPerFrame, fps, dispatch]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  return (
    <div
      data-lane-area="true"
      onClick={onClickLane}
      onDrop={onDrop}
      onDragOver={onDragOver}
      style={{
        position: 'relative',
        height: trackH,
        width: totalWidth,
        borderBottom: `1px solid ${theme.colors.border.default}`,
        background: track.visible === false ? 'rgba(0,0,0,0.3)' : 'transparent',
        boxSizing: 'border-box',
      }}
    >
      {clips.map((clip) => {
        const left = clip.startFrame * pxPerFrame;
        const width = clip.durationFrames * pxPerFrame;
        return (
          <TimelineClip
            key={clip.id}
            clip={clip}
            left={left}
            width={width}
            height={trackH - 6}
            trackLocked={!!track.locked}
            trackIndex={trackIndex}
          />
        );
      })}
    </div>
  );
};