import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { createDefaultClip } from '../../types/clip';
import { AddClipCommand } from '../../stores/commands/AddClipCommand';
import { AddTrackCommand } from '../../stores/commands/AddTrackCommand';
import { SplitClipCommand } from '../../stores/commands/SplitClipCommand';
import { DeleteClipCommand } from '../../stores/commands/DeleteClipCommand';
import { frameToTime } from '../../utils/timeFormat';
import { theme } from '../../styles/theme';
import { uid } from '../../utils/uid';
import type { Track } from '../../stores/slices/trackSlice';

export const TimelineControls: React.FC = () => {
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const fps = useEditorStore((s) => s.fps);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const dispatch = useEditorStore((s) => s.dispatch);
  const tracks = useEditorStore((s) => s.tracks);
  const clips = useEditorStore((s) => s.clips);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled);
  const rippleMode = useEditorStore((s) => s.rippleMode);
  const setRippleMode = useEditorStore((s) => s.setRippleMode);

  const maxFrame = clips.reduce((mx, c) => Math.max(mx, c.startFrame + c.durationFrames), 0);

  const goStart = () => setCurrentFrame(0);
  const goEnd = () => setCurrentFrame(maxFrame);
  const prevFrame = () => setCurrentFrame(Math.max(0, currentFrame - 1));
  const nextFrame = () => setCurrentFrame(currentFrame + 1);
  const togglePlay = () => setIsPlaying(!isPlaying);

  // Split at playhead
  const handleSplit = () => {
    if (selectedClipIds.length === 0) return;
    const clip = clips.find(c => c.id === selectedClipIds[0]);
    if (!clip) return;
    if (currentFrame <= clip.startFrame || currentFrame >= clip.startFrame + clip.durationFrames) return;
    dispatch(new SplitClipCommand(clip.id, currentFrame));
  };

  // Delete: rippleMode ON -> ripple delete, OFF -> normal delete
  const handleDelete = () => {
    if (selectedClipIds.length === 0) return;
    selectedClipIds.forEach(id => {
      dispatch(new DeleteClipCommand(id, rippleMode));
    });
  };

  // Force ripple delete regardless of mode (one-shot action)
  const handleRippleDelete = () => {
    if (selectedClipIds.length === 0) return;
    selectedClipIds.forEach(id => {
      dispatch(new DeleteClipCommand(id, true));
    });
  };

  const addTrack = (type: 'video' | 'audio' | 'text') => {
    const sameType = tracks.filter(t => t.type === type);
    const maxOrder = sameType.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
    const newTrack: Track = {
      id: uid(), name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${sameType.length + 1}`,
      type, order: maxOrder + 1, height: 60, locked: false, visible: true,
    };
    dispatch(new AddTrackCommand(newTrack));
  };

  const addTestClip = () => {
    const vTrack = tracks.find(t => t.type === 'video');
    if (!vTrack) return;
    const clip = createDefaultClip({
      id: uid(), name: 'Test Clip', type: 'video',
      trackId: vTrack.id, startFrame: currentFrame, durationFrames: fps * 5,
    });
    dispatch(new AddClipCommand(clip, rippleMode));
  };

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    background: active ? theme.colors.accent.blue : theme.colors.bg.elevated,
    color: active ? '#fff' : theme.colors.text.secondary,
    border: `1px solid ${active ? theme.colors.accent.blue : theme.colors.border.default}`,
    borderRadius: theme.radius.sm,
    padding: '4px 8px', cursor: 'pointer', fontSize: theme.fontSize.xs, whiteSpace: 'nowrap',
  });

  
  // Group selected clips
  const handleGroup = () => {
    if (selectedClipIds.length < 2) return;
    const gid = uid();
    const updated = clips.map(c =>
      selectedClipIds.includes(c.id) ? { ...c, groupId: gid } : c
    );
    useEditorStore.getState().setClips(updated);
    console.log('[Group]', selectedClipIds.length, 'clips grouped');
  };

  // Ungroup selected clips
  const handleUngroup = () => {
    if (selectedClipIds.length === 0) return;
    const selected = clips.filter(c => selectedClipIds.includes(c.id));
    const groupIds = new Set(selected.map(c => (c as any).groupId).filter(Boolean));
    if (groupIds.size === 0) return;
    const updated = clips.map(c =>
      (c as any).groupId && groupIds.has((c as any).groupId) ? { ...c, groupId: undefined } : c
    );
    useEditorStore.getState().setClips(updated);
    console.log('[Ungroup] done');
  };

  const hasSelection = selectedClipIds.length > 0;
  const hasMultiSelection = selectedClipIds.length >= 2;
  const hasGroupInSelection = selectedClipIds.some(id => {
    const c = clips.find(cl => cl.id === id);
    return c && (c as any).groupId;
  });

  const sep = { width: 1, height: 20, background: theme.colors.border.strong, margin: '0 4px' };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
      background: theme.colors.bg.secondary,
      borderBottom: `1px solid ${theme.colors.border.default}`, flexWrap: 'wrap',
    }}>
      {/* Playback controls */}
      <button onClick={goStart} style={btnStyle()} title="Go to start (Home)">⏮</button>
      <button onClick={prevFrame} style={btnStyle()} title="Previous frame (\u2190)">⏪</button>
      <button onClick={togglePlay} style={btnStyle(isPlaying)} title="Play/Pause (Space)">
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button onClick={nextFrame} style={btnStyle()} title="Next frame (\u2192)">⏩</button>
      <button onClick={goEnd} style={btnStyle()} title="Go to end (End)">⏭</button>

      <span style={{ color: theme.colors.text.primary, fontSize: theme.fontSize.sm,
        fontFamily: 'monospace', margin: '0 6px', minWidth: 70, textAlign: 'center' }}>
        {frameToTime(currentFrame, fps)}
      </span>

      <div style={sep} />

      {/* Edit actions */}
      <button onClick={handleSplit} style={btnStyle()} title="Split at playhead (Ctrl+B)">✂ Split</button>
      <button onClick={handleDelete} style={btnStyle()} title={`Delete${rippleMode ? ' (ripple)' : ''} (Del)`}>🗑</button>
        <button onClick={handleGroup} disabled={!hasMultiSelection} style={{...btnStyle(), opacity: hasMultiSelection ? 1 : 0.35}} title="Group selected clips (Ctrl+G)">🔗 Group</button>
        <button onClick={handleUngroup} disabled={!hasGroupInSelection} style={{...btnStyle(), opacity: hasGroupInSelection ? 1 : 0.35}} title="Ungroup (Ctrl+Shift+G)">⛓ Ungroup</button>

      <div style={sep} />

      {/* Mode toggles */}
      <button onClick={() => setSnapEnabled(!snapEnabled)} style={btnStyle(snapEnabled)} title="Snap to grid (S)">
        🧲 Snap
      </button>
      <button onClick={() => setRippleMode(!rippleMode)} style={btnStyle(rippleMode)} title="Ripple Mode: insert/delete/trim auto-shifts clips (R)">
        ⇆ Ripple {rippleMode ? 'ON' : 'OFF'}
      </button>

      <div style={sep} />

      {/* Undo/Redo */}
      <button onClick={undo} disabled={!canUndo()} style={{...btnStyle(), opacity: canUndo() ? 1 : 0.4}} title="Undo (Ctrl+Z)">↩</button>
      <button onClick={redo} disabled={!canRedo()} style={{...btnStyle(), opacity: canRedo() ? 1 : 0.4}} title="Redo (Ctrl+Y)">↪</button>

      <div style={sep} />

      {/* Add tracks */}
      <button onClick={() => addTrack('video')} style={btnStyle()} title="Add video track">+V</button>
      <button onClick={() => addTrack('audio')} style={btnStyle()} title="Add audio track">+A</button>
      <button onClick={() => addTrack('text')} style={btnStyle()} title="Add text track">+T</button>
      <button onClick={addTestClip} style={btnStyle()} title="Add test clip">🎬 Test</button>
    </div>
  );
};
