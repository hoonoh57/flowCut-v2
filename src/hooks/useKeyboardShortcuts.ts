import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { DeleteClipCommand } from '../stores/commands/DeleteClipCommand';
import { SplitClipCommand } from '../stores/commands/SplitClipCommand';
import { AddClipCommand } from '../stores/commands/AddClipCommand';
import { MoveClipCommand } from '../stores/commands/MoveClipCommand';
import { UpdateClipCommand } from '../stores/commands/UpdateClipCommand';
import { saveProjectToLocalStorage } from '../utils/ProjectManager';
import { createDefaultClip } from '../types/clip';
import type { Clip } from '../types/clip';

let clipboardClips: Clip[] = [];

function genId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
}

/** Get all clips sharing the same groupId as any of the selected clips */
function getGroupedClipIds(clips: Clip[], selectedIds: string[]): string[] {
  const selected = clips.filter(c => selectedIds.includes(c.id));
  const groupIds = new Set(selected.map(c => c.groupId).filter(Boolean));
  if (groupIds.size === 0) return selectedIds;
  const grouped = clips.filter(c => c.groupId && groupIds.has(c.groupId)).map(c => c.id);
  return [...new Set([...selectedIds, ...grouped])];
}

export function useKeyboardShortcuts() {
  const store = useEditorStore;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = store.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const key = e.key.toLowerCase();

      // ============================================================
      // UNDO / REDO
      // ============================================================
      if (ctrl && key === 'z' && !shift) {
        e.preventDefault(); s.undo(); return;
      }
      if ((ctrl && key === 'y') || (ctrl && key === 'z' && shift)) {
        e.preventDefault(); s.redo(); return;
      }

      // ============================================================
      // DELETE - respects ripple mode + group
      // ============================================================
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const rm = s.rippleMode || false;
        const ids = getGroupedClipIds(s.clips, s.selectedClipIds);
        ids.forEach((id: string) => s.dispatch(new DeleteClipCommand(id, rm)));
        return;
      }

      // ============================================================
      // SPLIT
      // ============================================================
      // Ctrl+B - Split selected clip at playhead
      if (ctrl && key === 'b' && !shift) {
        e.preventDefault();
        s.selectedClipIds.forEach((id: string) => s.dispatch(new SplitClipCommand(id, s.currentFrame)));
        return;
      }
      // Ctrl+Shift+B - Split ALL clips at playhead (all tracks)
      if (ctrl && key === 'b' && shift) {
        e.preventDefault();
        s.clips.forEach((c: Clip) => {
          if (s.currentFrame > c.startFrame && s.currentFrame < c.startFrame + c.durationFrames) {
            s.dispatch(new SplitClipCommand(c.id, s.currentFrame));
          }
        });
        return;
      }

      // ============================================================
      // PLAYBACK
      // ============================================================
      // Space - Play/Pause
      if (e.key === ' ') {
        e.preventDefault(); s.togglePlayback(); return;
      }
      // J/K/L - Shuttle (reverse / stop / forward)
      if (key === 'j' && !ctrl && !alt) {
        e.preventDefault();
        s.setIsPlaying(false);
        s.setCurrentFrame(Math.max(0, s.currentFrame - 5));
        return;
      }
      if (key === 'k' && !ctrl && !alt) {
        e.preventDefault();
        s.setIsPlaying(false);
        return;
      }
      if (key === 'l' && !ctrl && !alt) {
        e.preventDefault();
        s.setIsPlaying(false);
        s.setCurrentFrame(s.currentFrame + 5);
        return;
      }

      // ============================================================
      // NAVIGATION
      // ============================================================
      // Arrow Left/Right - Seek (Shift = 10 frames)
      if (e.key === 'ArrowLeft' && !ctrl && !alt) {
        e.preventDefault();
        s.setCurrentFrame(Math.max(0, s.currentFrame - (shift ? 10 : 1)));
        return;
      }
      if (e.key === 'ArrowRight' && !ctrl && !alt) {
        e.preventDefault();
        s.setCurrentFrame(s.currentFrame + (shift ? 10 : 1));
        return;
      }
      // Home / End
      if (e.key === 'Home') {
        e.preventDefault(); s.setCurrentFrame(0); return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        const maxFrame = Math.max(...s.clips.map((c: Clip) => c.startFrame + c.durationFrames), 0);
        s.setCurrentFrame(maxFrame);
        return;
      }
      // Up/Down - Previous/Next cut point
      if (e.key === 'ArrowUp' && !ctrl && !alt) {
        e.preventDefault();
        const cutPoints = [...new Set(s.clips.flatMap((c: Clip) => [c.startFrame, c.startFrame + c.durationFrames]))]
          .filter((f: number) => f < s.currentFrame).sort((a: number, b: number) => b - a);
        if (cutPoints.length > 0) s.setCurrentFrame(cutPoints[0]);
        return;
      }
      if (e.key === 'ArrowDown' && !ctrl && !alt) {
        e.preventDefault();
        const cutPoints = [...new Set(s.clips.flatMap((c: Clip) => [c.startFrame, c.startFrame + c.durationFrames]))]
          .filter((f: number) => f > s.currentFrame).sort((a: number, b: number) => a - b);
        if (cutPoints.length > 0) s.setCurrentFrame(cutPoints[0]);
        return;
      }

      // ============================================================
      // CLIP NUDGE (Alt+Arrow)
      // ============================================================
      if (alt && e.key === 'ArrowLeft') {
        e.preventDefault();
        const ids = getGroupedClipIds(s.clips, s.selectedClipIds);
        const delta = shift ? -10 : -1;
        const updated = s.clips.map((c: Clip) =>
          ids.includes(c.id) ? { ...c, startFrame: Math.max(0, c.startFrame + delta) } : c
        );
        s.setClips(updated);
        return;
      }
      if (alt && e.key === 'ArrowRight') {
        e.preventDefault();
        const ids = getGroupedClipIds(s.clips, s.selectedClipIds);
        const delta = shift ? 10 : 1;
        const updated = s.clips.map((c: Clip) =>
          ids.includes(c.id) ? { ...c, startFrame: c.startFrame + delta } : c
        );
        s.setClips(updated);
        return;
      }

      // ============================================================
      // TRACK MOVE (Ctrl+Up/Down)
      // ============================================================
      if (ctrl && e.key === 'ArrowUp') {
        e.preventDefault();
        const sorted = [...s.tracks].sort((a: any, b: any) => {
          const pri: Record<string, number> = { text: 3, video: 2, audio: 1 };
          return (pri[b.type] ?? 0) - (pri[a.type] ?? 0) || (b.order ?? 0) - (a.order ?? 0);
        });
        s.selectedClipIds.forEach((id: string) => {
          const clip = s.clips.find((c: Clip) => c.id === id);
          if (!clip) return;
          const idx = sorted.findIndex((t: any) => t.id === clip.trackId);
          if (idx > 0) {
            const newTrackId = sorted[idx - 1].id;
            s.dispatch(new MoveClipCommand(id, clip.trackId, clip.startFrame, newTrackId, clip.startFrame));
          }
        });
        return;
      }
      if (ctrl && e.key === 'ArrowDown') {
        e.preventDefault();
        const sorted = [...s.tracks].sort((a: any, b: any) => {
          const pri: Record<string, number> = { text: 3, video: 2, audio: 1 };
          return (pri[b.type] ?? 0) - (pri[a.type] ?? 0) || (b.order ?? 0) - (a.order ?? 0);
        });
        s.selectedClipIds.forEach((id: string) => {
          const clip = s.clips.find((c: Clip) => c.id === id);
          if (!clip) return;
          const idx = sorted.findIndex((t: any) => t.id === clip.trackId);
          if (idx < sorted.length - 1) {
            const newTrackId = sorted[idx + 1].id;
            s.dispatch(new MoveClipCommand(id, clip.trackId, clip.startFrame, newTrackId, clip.startFrame));
          }
        });
        return;
      }

      // ============================================================
      // COPY / PASTE / DUPLICATE
      // ============================================================
      if (ctrl && key === 'c' && !shift) {
        e.preventDefault();
        clipboardClips = s.selectedClipIds
          .map((id: string) => s.clips.find((c: Clip) => c.id === id))
          .filter(Boolean) as Clip[];
        console.log('[Shortcut] Copied', clipboardClips.length, 'clip(s)');
        return;
      }
      if (ctrl && key === 'v' && !shift) {
        e.preventDefault();
        if (clipboardClips.length === 0) return;
        const minStart = Math.min(...clipboardClips.map(c => c.startFrame));
        const offset = s.currentFrame - minStart;
        const rm = s.rippleMode || false;
        const newClips = clipboardClips.map((c: Clip) => {
          return createDefaultClip({
            ...c,
            id: genId(),
            groupId: undefined,
            name: c.name.replace(/ \(copy\)$/, '') + ' (copy)',
            startFrame: Math.max(0, c.startFrame + offset),
          });
        });
        newClips.forEach(nc => s.dispatch(new AddClipCommand(nc, rm)));
        s.setSelectedClipIds(newClips.map(c => c.id));
        console.log('[Shortcut] Pasted', newClips.length, 'clip(s) at frame', s.currentFrame);
        return;
      }
      // Ctrl+D - Duplicate (place right after original)
      if (ctrl && key === 'd') {
        e.preventDefault();
        const selected = s.selectedClipIds
          .map((id: string) => s.clips.find((c: Clip) => c.id === id))
          .filter(Boolean) as Clip[];
        if (selected.length === 0) return;
        const rm = s.rippleMode || false;
        const newClips = selected.map((c: Clip) => {
          return createDefaultClip({
            ...c,
            id: genId(),
            groupId: undefined,
            name: c.name.replace(/ \(copy\)$/, '') + ' (copy)',
            startFrame: c.startFrame + c.durationFrames,
          });
        });
        newClips.forEach(nc => s.dispatch(new AddClipCommand(nc, rm)));
        s.setSelectedClipIds(newClips.map(c => c.id));
        console.log('[Shortcut] Duplicated', newClips.length, 'clip(s)');
        return;
      }

      // ============================================================
      // SELECT ALL
      // ============================================================
      if (ctrl && key === 'a') {
        e.preventDefault();
        s.setSelectedClipIds(s.clips.map((c: Clip) => c.id));
        return;
      }

      // ============================================================
      // GROUP / UNGROUP
      // ============================================================
      // Ctrl+G - Group selected clips
      if (ctrl && key === 'g' && !shift) {
        e.preventDefault();
        if (s.selectedClipIds.length < 2) return;
        const gid = genId();
        const updated = s.clips.map((c: Clip) =>
          s.selectedClipIds.includes(c.id) ? { ...c, groupId: gid } : c
        );
        s.setClips(updated);
        console.log('[Shortcut] Grouped', s.selectedClipIds.length, 'clips, groupId:', gid);
        return;
      }
      // Ctrl+Shift+G - Ungroup
      if (ctrl && key === 'g' && shift) {
        e.preventDefault();
        const selected = s.clips.filter((c: Clip) => s.selectedClipIds.includes(c.id));
        const groupIds = new Set(selected.map(c => c.groupId).filter(Boolean));
        const updated = s.clips.map((c: Clip) =>
          c.groupId && groupIds.has(c.groupId) ? { ...c, groupId: undefined } : c
        );
        s.setClips(updated);
        console.log('[Shortcut] Ungrouped');
        return;
      }

      // ============================================================
      // QUICK RIPPLE TRIM (Q = trim left, W = trim right)
      // ============================================================
      // Q - Delete from clip start to playhead (ripple trim left)
      if (key === 'q' && !ctrl && !alt && !shift) {
        e.preventDefault();
        if (s.selectedClipIds.length === 0) return;
        const clip = s.clips.find((c: Clip) => c.id === s.selectedClipIds[0]);
        if (!clip) return;
        if (s.currentFrame <= clip.startFrame || s.currentFrame >= clip.startFrame + clip.durationFrames) return;
        const trimFrames = s.currentFrame - clip.startFrame;
        const secPerFrame = 1 / s.fps;
        const newSourceStart = clip.sourceStart + trimFrames * secPerFrame * (clip.speed || 1);
        const newDuration = clip.durationFrames - trimFrames;
        const newSourceDur = newDuration * secPerFrame * (clip.speed || 1);
        const updated = s.clips.map((c: Clip) => {
          if (c.id !== clip.id) {
            // Ripple: pull clips after the old start
            if (s.rippleMode && c.trackId === clip.trackId && c.startFrame > clip.startFrame) {
              return { ...c, startFrame: c.startFrame - trimFrames };
            }
            return c;
          }
          return { ...c, startFrame: s.currentFrame - trimFrames + (s.rippleMode ? 0 : trimFrames), durationFrames: newDuration, sourceStart: newSourceStart, sourceDuration: newSourceDur };
        });
        // Actually set the clip to start where playhead is (non-ripple) or pull everything
        const finalClips = s.clips.map((c: Clip) => {
          if (c.id === clip.id) {
            return { ...c, startFrame: s.rippleMode ? clip.startFrame : s.currentFrame, durationFrames: newDuration, sourceStart: newSourceStart, sourceDuration: newSourceDur };
          }
          if (s.rippleMode && c.trackId === clip.trackId && c.startFrame >= clip.startFrame + clip.durationFrames) {
            return { ...c, startFrame: c.startFrame - trimFrames };
          }
          return c;
        });
        s.setClips(finalClips);
        console.log('[Shortcut] Q - Trim left', trimFrames, 'frames');
        return;
      }
      // W - Delete from playhead to clip end (ripple trim right)
      if (key === 'w' && !ctrl && !alt && !shift) {
        e.preventDefault();
        if (s.selectedClipIds.length === 0) return;
        const clip = s.clips.find((c: Clip) => c.id === s.selectedClipIds[0]);
        if (!clip) return;
        if (s.currentFrame <= clip.startFrame || s.currentFrame >= clip.startFrame + clip.durationFrames) return;
        const newDuration = s.currentFrame - clip.startFrame;
        const secPerFrame = 1 / s.fps;
        const newSourceDur = newDuration * secPerFrame * (clip.speed || 1);
        const trimmed = clip.durationFrames - newDuration;
        const finalClips = s.clips.map((c: Clip) => {
          if (c.id === clip.id) {
            return { ...c, durationFrames: newDuration, sourceDuration: newSourceDur };
          }
          if (s.rippleMode && c.trackId === clip.trackId && c.startFrame >= clip.startFrame + clip.durationFrames) {
            return { ...c, startFrame: c.startFrame - trimmed };
          }
          return c;
        });
        s.setClips(finalClips);
        console.log('[Shortcut] W - Trim right', trimmed, 'frames');
        return;
      }

      // ============================================================
      // TOGGLE MODES
      // ============================================================
      // R - Toggle ripple mode
      if (key === 'r' && !ctrl && !alt) {
        e.preventDefault();
        if (typeof s.setRippleMode === 'function') {
          s.setRippleMode(!s.rippleMode);
          console.log('[Shortcut] Ripple mode:', !s.rippleMode);
        }
        return;
      }
      // N - Toggle snap (CapCut standard)
      if (key === 'n' && !ctrl && !alt) {
        e.preventDefault();
        s.setSnapEnabled(!s.snapEnabled);
        return;
      }
      // V - Toggle clip visibility/active
      if (key === 'v' && !ctrl && !alt) {
        e.preventDefault();
        if (s.selectedClipIds.length === 0) return;
        const updated = s.clips.map((c: Clip) =>
          s.selectedClipIds.includes(c.id) ? { ...c, visible: !c.visible } : c
        );
        s.setClips(updated);
        return;
      }

      // ============================================================
      // ZOOM
      // ============================================================
      // Ctrl+= or Ctrl++ - Zoom in
      if (ctrl && (key === '=' || key === '+')) {
        e.preventDefault();
        s.setZoomLevel(Math.min(10, s.zoomLevel + 0.2));
        return;
      }
      // Ctrl+- - Zoom out
      if (ctrl && key === '-') {
        e.preventDefault();
        s.setZoomLevel(Math.max(0.1, s.zoomLevel - 0.2));
        return;
      }
      // Shift+Z - Fit timeline to view
      if (shift && key === 'z' && !ctrl) {
        e.preventDefault();
        const maxFrame = Math.max(...s.clips.map((c: Clip) => c.startFrame + c.durationFrames), 300);
        const pxAvailable = window.innerWidth - 200;
        const fitZoom = (pxAvailable / (maxFrame / s.fps)) / 100;
        s.setZoomLevel(Math.max(0.1, Math.min(10, fitZoom)));
        return;
      }

      // ============================================================
      // SAVE
      // ============================================================
      if (ctrl && key === 's') {
        e.preventDefault();
        try {
          saveProjectToLocalStorage('autosave');
          console.log('[Shortcut] Project saved');
        } catch (err) {
          console.error('[Shortcut] Save failed:', err);
        }
        return;
      }

      // ============================================================
      // LOCK CLIP (Ctrl+L)
      // ============================================================
      if (ctrl && key === 'l') {
        e.preventDefault();
        if (s.selectedClipIds.length === 0) return;
        const updated = s.clips.map((c: Clip) =>
          s.selectedClipIds.includes(c.id) ? { ...c, locked: !c.locked } : c
        );
        s.setClips(updated);
        console.log('[Shortcut] Toggle lock');
        return;
      }

      // ============================================================
      // SELECT TO LEFT/RIGHT ([ and ])
      // ============================================================
      if (key === '[' && !ctrl) {
        e.preventDefault();
        const ids = s.clips.filter((c: Clip) => c.startFrame + c.durationFrames <= s.currentFrame).map((c: Clip) => c.id);
        s.setSelectedClipIds(ids);
        return;
      }
      if (key === ']' && !ctrl) {
        e.preventDefault();
        const ids = s.clips.filter((c: Clip) => c.startFrame >= s.currentFrame).map((c: Clip) => c.id);
        s.setSelectedClipIds(ids);
        return;
      }
    };

    // ============================================================
    // MOUSE WHEEL - Ctrl+Wheel = zoom, Alt+Wheel = horizontal scroll
    // ============================================================
    const onWheel = (e: WheelEvent) => {
      const s = store.getState();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        s.setZoomLevel(Math.max(0.1, Math.min(10, s.zoomLevel + delta)));
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });

    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);
}
