import React, { useCallback, useMemo } from 'react';
import { DEFAULT_PROJECT } from '../../types/project';
import { useEditorStore } from '../../stores/editorStore';

/* ───── tiny color input ───── */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ width: 72, color: '#ccc' }}>{label}</span>
      <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
        style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
      <span style={{ color: '#999', fontSize: 10 }}>{value || 'none'}</span>
    </label>
  );
}

/* ───── number input ───── */
function NumField({ label, value, onChange, min, max, step, unit }:
  { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ width: 72, color: '#ccc' }}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step || 1}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 60, background: '#2a2a2a', color: '#eee', border: '1px solid #444', borderRadius: 3, padding: '2px 4px', fontSize: 12 }} />
      {unit && <span style={{ color: '#777', fontSize: 10 }}>{unit}</span>}
    </label>
  );
}

/* ───── select ───── */
function SelectField({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ width: 72, color: '#ccc' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ flex: 1, background: '#2a2a2a', color: '#eee', border: '1px solid #444', borderRadius: 3, padding: '2px 4px', fontSize: 12 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ───── section header ───── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  );
}

/* ═══════ FONT PRESETS ═══════ */
const FONT_OPTIONS = [
  { value: 'Malgun Gothic, sans-serif', label: '맑은 고딕' },
  { value: 'NanumGothic, sans-serif', label: '나눔고딕' },
  { value: 'NanumMyeongjo, serif', label: '나눔명조' },
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

/* ═══════ MAIN COMPONENT ═══════ */
export default function ClipInspector() {
  const selectedClipId = useEditorStore(s => s.selectedClipId);
  const clips = useEditorStore(s => s.clips);
  const updateClip = useEditorStore(s => s.updateClip);
  const fps = useEditorStore(s => s.fps);

  const clip = useMemo(() => clips.find(c => c.id === selectedClipId), [clips, selectedClipId]);

  const set = useCallback((field: string, value: any) => {
    if (!clip) return;
    updateClip(clip.id, { [field]: value });
  }, [clip, updateClip]);

  if (!clip) {
    return (
      <div style={{ padding: 16, color: '#777', fontSize: 13, textAlign: 'center' }}>
        클립을 선택하면 속성을 편집할 수 있습니다
      </div>
    );
  }

  const isText = clip.type === 'text';
  const isVisual = clip.type === 'video' || clip.type === 'image';
  const isAudio = clip.type === 'audio';
  const durationSec = ((clip.durationFrames || 0) / (fps || 30)).toFixed(2);

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%', background: '#1e1e1e' }}>
      {/* Header */}
      <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #333' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{clip.name || clip.type}</div>
        <div style={{ fontSize: 11, color: '#888' }}>{clip.type.toUpperCase()} · {durationSec}s</div>
      </div>

      {/* ─── Transform (visual + text) ─── */}
      {(isVisual || isText) && (
        <Section title="Transform">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <NumField label="X" value={clip.x || 0} onChange={v => set('x', v)} unit="px" />
            <NumField label="Y" value={clip.y || 0} onChange={v => set('y', v)} unit="px" />
            <NumField label="Width" value={clip.width || DEFAULT_PROJECT.width} onChange={v => set('width', v)} min={1} unit="px" />
            <NumField label="Height" value={clip.height || DEFAULT_PROJECT.height} onChange={v => set('height', v)} min={1} unit="px" />
          </div>
          <NumField label="Rotation" value={clip.rotation || 0} onChange={v => set('rotation', v)} min={-360} max={360} unit="°" />
          <NumField label="Opacity" value={clip.opacity ?? 100} onChange={v => set('opacity', v)} min={0} max={100} unit="%" />
        </Section>
      )}

      {/* ─── Text Style ─── */}
      {isText && (
        <Section title="Text Style">
          <div style={{ marginBottom: 4 }}>
            <textarea value={clip.text || ''} onChange={e => set('text', e.target.value)}
              rows={3}
              style={{ width: '100%', background: '#2a2a2a', color: '#eee', border: '1px solid #444',
                borderRadius: 4, padding: 6, fontSize: 13, resize: 'vertical', fontFamily: clip.fontFamily || 'sans-serif' }}
              placeholder="텍스트 입력..." />
          </div>
          <SelectField label="Font" value={clip.fontFamily || 'Malgun Gothic, sans-serif'} onChange={v => set('fontFamily', v)} options={FONT_OPTIONS} />
          <NumField label="Size" value={clip.fontSize || 40} onChange={v => set('fontSize', v)} min={8} max={300} unit="px" />
          <ColorField label="Color" value={clip.fontColor || '#ffffff'} onChange={v => set('fontColor', v)} />
          <SelectField label="Align" value={clip.textAlign || 'center'} onChange={v => set('textAlign', v)}
            options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
          <div style={{ display: 'flex', gap: 4 }}>
            <SelectField label="Weight" value={clip.fontWeight || 'normal'} onChange={v => set('fontWeight', v)}
              options={[{ value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Bold' }]} />
          </div>
          <SelectField label="Style" value={clip.fontStyle || 'normal'} onChange={v => set('fontStyle', v)}
            options={[{ value: 'normal', label: 'Normal' }, { value: 'italic', label: 'Italic' }]} />
          <NumField label="Line H" value={clip.lineHeight ?? 1.2} onChange={v => set('lineHeight', v)} min={0.5} max={4} step={0.1} />
        </Section>
      )}

      {/* ─── Text Background ─── */}
      {isText && (
        <Section title="Background">
          <ColorField label="BG Color" value={clip.textBgColor || '#000000'} onChange={v => set('textBgColor', v)} />
          <NumField label="BG Opacity" value={clip.textBgOpacity ?? 0} onChange={v => set('textBgOpacity', v)} min={0} max={100} unit="%" />
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>0% = transparent, 100% = solid</div>
        </Section>
      )}

      {/* ─── Border ─── */}
      {isText && (
        <Section title="Border / Outline">
          <NumField label="Width" value={clip.borderWidth ?? 0} onChange={v => set('borderWidth', v)} min={0} max={20} unit="px" />
          <ColorField label="Color" value={clip.borderColor || '#000000'} onChange={v => set('borderColor', v)} />
        </Section>
      )}

      {/* ─── Shadow ─── */}
      {isText && (
        <Section title="Shadow">
          <ColorField label="Color" value={clip.shadowColor || '#000000'} onChange={v => set('shadowColor', v)} />
          <NumField label="X Offset" value={clip.shadowX ?? 0} onChange={v => set('shadowX', v)} min={-50} max={50} unit="px" />
          <NumField label="Y Offset" value={clip.shadowY ?? 2} onChange={v => set('shadowY', v)} min={-50} max={50} unit="px" />
        </Section>
      )}

      {/* ─── Audio Controls ─── */}
      {(isAudio || clip.type === 'video') && (
        <Section title="Audio">
          <NumField label="Volume" value={clip.volume ?? 100} onChange={v => set('volume', v)} min={0} max={200} unit="%" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 72, color: '#ccc' }}>Muted</span>
            <input type="checkbox" checked={clip.muted || false} onChange={e => set('muted', e.target.checked)} />
          </div>
        </Section>
      )}

      {/* ─── Visual Effects ─── */}
      {isVisual && (
        <Section title="Effects">
          <NumField label="Brightness" value={clip.brightness ?? 100} onChange={v => set('brightness', v)} min={0} max={200} unit="%" />
          <NumField label="Contrast" value={clip.contrast ?? 100} onChange={v => set('contrast', v)} min={0} max={200} unit="%" />
          <NumField label="Saturation" value={clip.saturation ?? 100} onChange={v => set('saturation', v)} min={0} max={200} unit="%" />
        </Section>
      )}

      {/* ─── Timing ─── */}
      
      {/* --- Source Trim (In/Out) --- */}
      {(isVisual || isAudio) && clip.sourceDuration > 0 && (
        <Section title="Source Trim">
          <NumField label="In Point" value={clip.sourceStart || 0} onChange={v => {
            const maxIn = (clip.sourceDuration || 5) - 0.1;
            set('sourceStart', Math.max(0, Math.min(v, maxIn)));
          }} min={0} max={clip.sourceDuration || 5} step={0.01} unit="s" />
          <NumField label="Out Point" value={(clip.sourceStart || 0) + (clip.sourceDuration || 5)} onChange={v => {
            const newDur = Math.max(0.1, v - (clip.sourceStart || 0));
            set('sourceDuration', newDur);
          }} min={0.1} step={0.01} unit="s" />
          <NumField label="Src Duration" value={clip.sourceDuration || 0} onChange={v => set('sourceDuration', Math.max(0.1, v))} min={0.1} step={0.01} unit="s" />
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            Source: {(clip.sourceStart || 0).toFixed(2)}s ~ {((clip.sourceStart || 0) + (clip.sourceDuration || 0)).toFixed(2)}s
          </div>
        </Section>
      )}

<Section title="Timing">
        <NumField label="Start" value={clip.startFrame || 0} onChange={v => set('startFrame', v)} min={0} unit="frames" />
        <NumField label="Duration" value={clip.durationFrames || 0} onChange={v => set('durationFrames', v)} min={1} unit="frames" />
        {(isVisual || isAudio) && (
          <NumField label="Speed" value={clip.speed ?? 1} onChange={v => set('speed', v)} min={0.1} max={10} step={0.1} unit="x" />
        )}
      </Section>
    </div>
  );
}