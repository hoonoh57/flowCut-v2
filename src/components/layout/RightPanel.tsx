import React from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { UpdateClipCommand } from '../../stores/commands/UpdateClipCommand';
import { theme } from '../../styles/theme';

/* ── Font Presets ── */
const FONT_OPTIONS = [
  { value: 'Malgun Gothic, sans-serif', label: '\uB9D1\uC740 \uACE0\uB515' },
  { value: 'NanumGothic, sans-serif', label: '\uB098\uB214\uACE0\uB515' },
  { value: 'NanumMyeongjo, serif', label: '\uB098\uB214\uBA85\uC870' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Courier New, monospace', label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: 'Comic Sans MS, cursive', label: 'Comic Sans' },
  { value: 'Consolas, monospace', label: 'Consolas' },
  { value: 'Segoe UI, sans-serif', label: 'Segoe UI' },
  { value: 'Calibri, sans-serif', label: 'Calibri' },
];

export function RightPanel() {
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const clips = useEditorStore((s) => s.clips);
  const dispatch = useEditorStore((s) => s.dispatch);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);

  const sc = clips.find((c) => c.id === selectedClipIds[0]);

  const update = (key: string, value: number | string | boolean) => {
    if (!sc) return;
    dispatch(new UpdateClipCommand(sc.id, { [key]: value }));
  };

  /* ── Reusable field components ── */
  const numField = (label: string, key: string, val: number, opts?: { min?: number; max?: number; step?: number; unit?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      <span style={{ width: 56, fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>{label}</span>
      <input type="number" value={val}
        min={opts?.min} max={opts?.max} step={opts?.step || 1}
        onChange={(e) => update(key, Number(e.target.value))}
        style={{
          flex: 1, padding: '3px 6px', fontSize: theme.fontSize.sm,
          background: theme.colors.bg.elevated, color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm,
          outline: 'none',
        }}
      />
      {opts?.unit && <span style={{ fontSize: 10, color: theme.colors.text.muted, width: 20 }}>{opts.unit}</span>}
    </div>
  );

  const colorField = (label: string, key: string, val: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      <span style={{ width: 56, fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>{label}</span>
      <input type="color" value={val || '#000000'} onChange={(e) => update(key, e.target.value)}
        style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
      <span style={{ fontSize: 10, color: theme.colors.text.muted }}>{val || 'none'}</span>
    </div>
  );

  const selectField = (label: string, key: string, val: string, options: { value: string; label: string }[]) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
      <span style={{ width: 56, fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>{label}</span>
      <select value={val} onChange={(e) => update(key, e.target.value)}
        style={{
          flex: 1, padding: '3px 4px', fontSize: theme.fontSize.sm,
          background: theme.colors.bg.elevated, color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm,
          outline: 'none',
        }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const sectionHeader = (title: string) => (
    <div style={{
      fontSize: theme.fontSize.sm, fontWeight: 600, color: theme.colors.accent.blue,
      marginTop: 14, marginBottom: 6, paddingBottom: 4,
      borderBottom: `1px solid ${theme.colors.border.subtle}`,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>{title}</div>
  );

  /* ── No selection ── */
  if (!sc) {
    return (
      <div style={{ padding: theme.spacing.lg, color: theme.colors.text.muted, fontSize: theme.fontSize.sm }}>
        <div style={{ fontSize: theme.fontSize.lg, fontWeight: 600, marginBottom: 16, color: theme.colors.text.primary }}>
          Properties
        </div>
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          Select a clip to edit properties
        </div>
      </div>
    );
  }

  const typeColor = sc.type === 'video' ? theme.colors.track.video
    : sc.type === 'audio' ? theme.colors.track.audio
    : sc.type === 'text' ? theme.colors.track.text
    : theme.colors.accent.purple;

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ fontSize: theme.fontSize.lg, fontWeight: 600, marginBottom: 4, color: theme.colors.text.primary }}>
        Properties
      </div>
      <div style={{
        color: typeColor, fontSize: theme.fontSize.md, fontWeight: 600, marginBottom: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>
        {sc.name}
      </div>
      <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted, marginBottom: 10 }}>
        {sc.type.toUpperCase()} | ID: {sc.id.slice(0, 8)}
      </div>

      {/* ════ TIMELINE ════ */}
      {sectionHeader('Timeline')}
      {numField('Start', 'startFrame', sc.startFrame, { min: 0, unit: 'f' })}
      {numField('Duration', 'durationFrames', sc.durationFrames, { min: 1, unit: 'f' })}
      {(sc.type === 'video' || sc.type === 'audio') &&
        numField('Speed', 'speed', sc.speed, { min: 0.25, max: 4, step: 0.25, unit: 'x' })}

      {/* ════ TRANSFORM ════ */}
      {(sc.type !== 'audio') && (
        <>
          {sectionHeader('Transform')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {numField('X', 'x', sc.x, { unit: 'px' })}
            {numField('Y', 'y', sc.y, { unit: 'px' })}
            {numField('W', 'width', sc.width, { min: 10, unit: 'px' })}
            {numField('H', 'height', sc.height, { min: 10, unit: 'px' })}
          </div>
          {numField('Rotation', 'rotation', sc.rotation, { min: -360, max: 360, unit: '\u00B0' })}
          {numField('Opacity', 'opacity', sc.opacity, { min: 0, max: 100, unit: '%' })}
        </>
      )}

      {/* ════ TEXT CONTENT ════ */}
      {sc.type === 'text' && (
        <>
          {sectionHeader('Text')}
          <div style={{ marginBottom: 6 }}>
            <textarea value={sc.text || ''} onChange={(e) => update('text', e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: 6, fontSize: 13, resize: 'vertical',
                background: theme.colors.bg.elevated, color: theme.colors.text.primary,
                border: `1px solid ${theme.colors.border.default}`, borderRadius: theme.radius.sm,
                outline: 'none', fontFamily: sc.fontFamily || 'sans-serif',
              }}
              placeholder="Enter text..." />
          </div>
          {selectField('Font', 'fontFamily', sc.fontFamily || 'Malgun Gothic, sans-serif', FONT_OPTIONS)}
          {numField('Size', 'fontSize', sc.fontSize || 48, { min: 8, max: 300, unit: 'px' })}
          {colorField('Color', 'fontColor', sc.fontColor || '#ffffff')}
          {selectField('Align', 'textAlign', sc.textAlign || 'center', [
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ])}
          {selectField('Weight', 'fontWeight', sc.fontWeight || 'normal', [
            { value: 'normal', label: 'Normal' },
            { value: 'bold', label: 'Bold' },
          ])}
          {selectField('Style', 'fontStyle', sc.fontStyle || 'normal', [
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: 'Italic' },
          ])}
          {numField('Line H', 'lineHeight', sc.lineHeight ?? 1.2, { min: 0.5, max: 4, step: 0.1 })}
        </>
      )}

      {/* ════ TEXT BACKGROUND ════ */}
      {sc.type === 'text' && (
        <>
          {sectionHeader('Background')}
          {colorField('BG Color', 'textBgColor', sc.textBgColor || '#000000')}
          {numField('BG Opacity', 'textBgOpacity', sc.textBgOpacity ?? 0, { min: 0, max: 100, unit: '%' })}
          <div style={{ fontSize: 10, color: theme.colors.text.muted, marginBottom: 4 }}>
            0% = transparent, 100% = solid background
          </div>
        </>
      )}

      {/* ════ TEXT BORDER / OUTLINE ════ */}
      {sc.type === 'text' && (
        <>
          {sectionHeader('Border / Outline')}
          {numField('Width', 'borderWidth', sc.borderWidth ?? 0, { min: 0, max: 20, unit: 'px' })}
          {colorField('Color', 'borderColor', sc.borderColor || '#000000')}
        </>
      )}

      {/* ════ TEXT SHADOW ════ */}
      {sc.type === 'text' && (
        <>
          {sectionHeader('Shadow')}
          {colorField('Color', 'shadowColor', sc.shadowColor || '#000000')}
          {numField('X', 'shadowX', sc.shadowX ?? 0, { min: -50, max: 50, unit: 'px' })}
          {numField('Y', 'shadowY', sc.shadowY ?? 2, { min: -50, max: 50, unit: 'px' })}
        </>
      )}

      {/* ════ VISUAL EFFECTS ════ */}
      {(sc.type === 'video' || sc.type === 'image') && (
        <>
          {sectionHeader('Effects')}
          {numField('Bright', 'brightness', sc.brightness, { min: -100, max: 100, unit: '%' })}
          {numField('Contrast', 'contrast', sc.contrast, { min: 0, max: 200, unit: '%' })}
          {numField('Saturate', 'saturation', sc.saturation, { min: 0, max: 200, unit: '%' })}
        </>
      )}

      {/* ════ AUDIO ════ */}
      {(sc.type === 'video' || sc.type === 'audio') && (
        <>
          {sectionHeader('Audio')}
          {numField('Volume', 'volume', sc.volume, { min: 0, max: 200, unit: '%' })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span style={{ width: 56, fontSize: theme.fontSize.xs, color: theme.colors.text.muted }}>Muted</span>
            <input type="checkbox" checked={sc.muted} onChange={(e) => update('muted', e.target.checked)} />
          </div>
        </>
      )}

      {/* ════ FADE ════ */}
      {sectionHeader('Fade')}
      {numField('Fade In', 'fadeIn', sc.fadeIn, { min: 0, unit: 'f' })}
      {numField('Fade Out', 'fadeOut', sc.fadeOut, { min: 0, unit: 'f' })}

      {/* Footer */}
      <div style={{
        marginTop: 16, paddingTop: 10, borderTop: `1px solid ${theme.colors.border.subtle}`,
        display: 'flex', justifyContent: 'space-between', fontSize: theme.fontSize.xs, color: theme.colors.text.muted
      }}>
        <span>Undo: {canUndo() ? 'Y' : 'N'}</span>
        <span>Redo: {canRedo() ? 'Y' : 'N'}</span>
      </div>
    </div>
  );
}