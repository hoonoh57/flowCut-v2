import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { DeleteClipCommand } from '../stores/commands/DeleteClipCommand';
import { SplitClipCommand } from '../stores/commands/SplitClipCommand';
import { saveProjectToLocalStorage } from '../utils/ProjectManager';
import { createDefaultClip } from '../types/clip';

let clipboardClips: any[] = [];

export function useKeyboardShortcuts() {
  const store = useEditorStore;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = store.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z  Undo
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z  Redo
      if ((ctrl && e.key === 'y') || (ctrl && e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        s.redo();
        return;
      }

      // Delete / Backspace  Delete selected clips
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.selectedClipIds.forEach((id: string) => s.dispatch(new DeleteClipCommand(id)));
        return;
      }

      // Ctrl+B  Split at playhead
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        s.selectedClipIds.forEach((id: string) => s.dispatch(new SplitClipCommand(id, s.currentFrame)));
        return;
      }

      // Space  Play/Pause
      if (e.key === ' ') {
        e.preventDefault();
        s.togglePlayback();
        return;
      }

      // Arrow Left/Right  Seek (Shift = 10 frames)
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        s.setCurrentFrame(Math.max(0, s.currentFrame - (e.shiftKey ? 10 : 1)));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        s.setCurrentFrame(s.currentFrame + (e.shiftKey ? 10 : 1));
        return;
      }

      // S  Toggle snap
      if (e.key === 's' && !ctrl) {
        e.preventDefault();
        s.setSnapEnabled(!s.snapEnabled);
        return;
      }

      // Ctrl+S  Save project
      if (ctrl && e.key === 's') {
        e.preventDefault();
        try {
          saveProjectToLocalStorage('autosave');
          console.log('[Shortcut] Project saved');
        } catch (err) {
          console.error('[Shortcut] Save failed:', err);
        }
        return;
      }

      // Ctrl+C  Copy selected clips
      if (ctrl && e.key === 'c') {
        e.preventDefault();
        clipboardClips = s.selectedClipIds
          .map((id: string) => s.clips.find((c: any) => c.id === id))
          .filter(Boolean)
          .map((c: any) => ({ ...c }));
        console.log('[Shortcut] Copied', clipboardClips.length, 'clip(s)');
        return;
      }

      // Ctrl+V  Paste clips
      if (ctrl && e.key === 'v') {
        e.preventDefault();
        if (clipboardClips.length === 0) return;
        const newClips = clipboardClips.map((c: any) => {
          const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
          return createDefaultClip({
            ...c,
            id: newId,
            name: c.name + ' (copy)',
            startFrame: s.currentFrame,
          });
        });
        s.setClips([...s.clips, ...newClips]);
        s.setSelectedClipIds(newClips.map((c: any) => c.id));
        console.log('[Shortcut] Pasted', newClips.length, 'clip(s)');
        return;
      }

      // Ctrl+D  Duplicate selected clips (in place, offset +30 frames)
      if (ctrl && e.key === 'd') {
        e.preventDefault();
        const selected = s.selectedClipIds
          .map((id: string) => s.clips.find((c: any) => c.id === id))
          .filter(Boolean);
        if (selected.length === 0) return;
        const newClips = selected.map((c: any) => {
          const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
          return createDefaultClip({
            ...c,
            id: newId,
            name: c.name + ' (copy)',
            startFrame: c.startFrame + c.durationFrames,
          });
        });
        s.setClips([...s.clips, ...newClips]);
        s.setSelectedClipIds(newClips.map((c: any) => c.id));
        console.log('[Shortcut] Duplicated', newClips.length, 'clip(s)');
        return;
      }

      // Ctrl+A  Select all clips
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        s.setSelectedClipIds(s.clips.map((c: any) => c.id));
        return;
      }

      // Home  Go to start
      if (e.key === 'Home') {
        e.preventDefault();
        s.setCurrentFrame(0);
        return;
      }

      // End  Go to end
      if (e.key === 'End') {
        e.preventDefault();
        const maxFrame = Math.max(...s.clips.map((c: any) => c.startFrame + c.durationFrames), 0);
        s.setCurrentFrame(maxFrame);
        return;
      }
    };

    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}