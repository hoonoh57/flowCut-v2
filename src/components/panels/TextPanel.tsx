import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { createTextClipFromPreset } from '../../utils/clipFactory';
import { AddClipCommand } from '../../stores/commands/AddClipCommand';
import { theme } from '../../styles/theme';
import {
  PRESET_CATEGORIES,
  getPresetsByCategory,
  getAllPresets,
  type PresetCategory,
  type TextPreset,
} from '../../presets/textPresets';
import {
  generateTextViaLLM,
  checkOllamaHealth,
  type AITextResult,
} from '../../presets/aiTextBridge';

export const TextPanel: React.FC = () => {
  const dispatch = useEditorStore((s) => s.dispatch);
  const tracks = useEditorStore((s) => s.tracks);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const fps = useEditorStore((s) => s.fps);

  const [customText, setCustomText] = useState('');
  const [activeCategory, setActiveCategory] = useState<PresetCategory | 'ai'>('basic');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState<AITextResult | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    checkOllamaHealth().then(setAiAvailable).catch(() => setAiAvailable(false));
  }, []);

  const addPresetClip = (preset: TextPreset, text?: string) => {
    let tTrack = tracks.find(t => t.type === 'text');
    if (!tTrack) tTrack = tracks.find(t => t.type === 'video');
    if (!tTrack) return;
    const clip = createTextClipFromPreset(
      preset.id, tTrack.id, currentFrame, fps, text || undefined
    );
    dispatch(new AddClipCommand(clip));
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiProcessing(true);
    setAiError('');
    setAiResult(null);
    try {
      const result = await generateTextViaLLM(aiPrompt, { language: 'Korean' });
      setAiResult(result);
    } catch (err: any) {
      setAiError(err.message || 'AI generation failed');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleAIApply = () => {
    if (!aiResult) return;
    let tTrack = tracks.find(t => t.type === 'text');
    if (!tTrack) tTrack = tracks.find(t => t.type === 'video');
    if (!tTrack) return;
    const clip = createTextClipFromPreset(
      aiResult.suggestedPreset || 'basic-white',
      tTrack.id, currentFrame, fps, aiResult.text
    );
    dispatch(new AddClipCommand(clip));
    setAiResult(null);
    setAiPrompt('');
  };

  const getFilteredPresets = (category: PresetCategory): TextPreset[] => {
    const presets = getPresetsByCategory(category);
    if (!searchQuery.trim()) return presets;
    const q = searchQuery.toLowerCase();
    return presets.filter(p =>
      p.label.toLowerCase().includes(q) ||
      p.labelEn.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  };

  const cardStyle = (preset: TextPreset): React.CSSProperties => ({
    padding: '14px 10px', borderRadius: theme.radius.md,
    background: preset.previewBg || theme.colors.bg.elevated,
    border: '1px solid ' + theme.colors.border.subtle,
    cursor: 'pointer', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    transition: 'transform 0.1s, border-color 0.15s',
    minHeight: 80, justifyContent: 'center',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Custom text input */}
      <div style={{ display: 'flex', gap: 4 }}>
        <input value={customText} onChange={(e) => setCustomText(e.target.value)}
          placeholder="텍스트 입력..."
          style={{ flex: 1, padding: '7px 8px', borderRadius: theme.radius.sm,
            border: '1px solid ' + theme.colors.border.default,
            background: theme.colors.bg.elevated, color: theme.colors.text.primary,
            fontSize: theme.fontSize.md, outline: 'none' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customText.trim()) {
              addPresetClip(getAllPresets()[0], customText.trim());
              setCustomText('');
            }
          }}
        />
        <button onClick={() => {
            if (customText.trim()) { addPresetClip(getAllPresets()[0], customText.trim()); setCustomText(''); }
          }}
          style={{ padding: '7px 14px', borderRadius: theme.radius.sm,
            background: theme.colors.accent.blue, color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: theme.fontSize.sm, fontWeight: 600 }}
        >추가</button>
      </div>

      {/* Search */}
      <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="프리셋 검색..."
        style={{ padding: '5px 8px', borderRadius: theme.radius.sm,
          border: '1px solid ' + theme.colors.border.default,
          background: theme.colors.bg.elevated, color: theme.colors.text.primary,
          fontSize: theme.fontSize.sm, outline: 'none' }}
      />

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {PRESET_CATEGORIES.map(cat => (
          <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
            style={{ padding: '4px 8px', borderRadius: theme.radius.sm,
              border: '1px solid ' + (activeCategory === cat.key ? theme.colors.accent.blue : theme.colors.border.subtle),
              background: activeCategory === cat.key ? theme.colors.accent.blue + '22' : theme.colors.bg.elevated,
              color: activeCategory === cat.key ? theme.colors.accent.blue : theme.colors.text.secondary,
              cursor: 'pointer', fontSize: 10, fontWeight: 600 }}
          >{cat.icon} {cat.label}</button>
        ))}
        <button onClick={() => setActiveCategory('ai')}
          style={{ padding: '4px 8px', borderRadius: theme.radius.sm,
            border: '1px solid ' + (activeCategory === 'ai' ? theme.colors.accent.purple : theme.colors.border.subtle),
            background: activeCategory === 'ai' ? theme.colors.accent.purple + '22' : theme.colors.bg.elevated,
            color: activeCategory === 'ai' ? theme.colors.accent.purple : theme.colors.text.secondary,
            cursor: 'pointer', fontSize: 10, fontWeight: 600 }}
        >🤖 AI</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeCategory !== 'ai' ? (
          <>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.text.muted, marginBottom: 6, fontWeight: 600 }}>
              {PRESET_CATEGORIES.find(c => c.key === activeCategory)?.label || ''} 프리셋
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {getFilteredPresets(activeCategory as PresetCategory).map(preset => (
                <button key={preset.id}
                  onClick={() => addPresetClip(preset, customText.trim() || undefined)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = theme.colors.accent.blue;
                    (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = theme.colors.border.subtle;
                    (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                  }}
                  style={cardStyle(preset)} title={preset.description}
                >
                  <span style={{
                    fontSize: Math.min(((preset.style.fontSize as number) || 48) / 3.5, 18),
                    fontFamily: (preset.style.fontFamily as string) || 'sans-serif',
                    fontWeight: (preset.style.fontWeight as string) || 'normal',
                    fontStyle: (preset.style.fontStyle as string) || 'normal',
                    color: preset.previewColor,
                    textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                    lineHeight: 1.3, padding: '2px 6px', borderRadius: 3,
                    background: ((preset.style.textBgOpacity as number) || 0) > 0
                      ? (preset.style.textBgColor as string || '#000') + Math.round((((preset.style.textBgOpacity as number) || 0) / 100) * 255).toString(16).padStart(2, '0')
                      : 'transparent',
                    border: ((preset.style.borderWidth as number) || 0) > 0
                      ? '1px solid ' + (preset.style.borderColor || '#000')
                      : 'none',
                  }}>
                    {preset.label}
                  </span>
                  <span style={{ fontSize: 9, color: theme.colors.text.muted }}>
                    {preset.labelEn}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, padding: '6px 8px', borderRadius: theme.radius.sm,
              background: aiAvailable ? theme.colors.accent.green + '15' : theme.colors.accent.red + '15',
              color: aiAvailable ? theme.colors.accent.green : theme.colors.accent.red,
              border: '1px solid ' + (aiAvailable ? theme.colors.accent.green + '33' : theme.colors.accent.red + '33') }}>
              {aiAvailable ? '✓ Ollama connected' : '✗ Ollama not detected — start: ollama serve'}
            </div>

            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={'AI에게 텍스트 생성 요청...\n예: 요리 영상 감성 제목'}
              rows={3}
              style={{ padding: 8, borderRadius: theme.radius.sm,
                border: '1px solid ' + theme.colors.border.default,
                background: theme.colors.bg.elevated, color: theme.colors.text.primary,
                fontSize: theme.fontSize.sm, outline: 'none', resize: 'vertical' }}
            />

            <button onClick={handleAIGenerate} disabled={aiProcessing || !aiPrompt.trim()}
              style={{ padding: '8px 12px', borderRadius: theme.radius.sm,
                background: aiProcessing ? theme.colors.bg.hover : theme.colors.accent.purple,
                color: '#fff', border: 'none',
                cursor: aiProcessing ? 'wait' : 'pointer',
                fontSize: theme.fontSize.sm, fontWeight: 600,
                opacity: (!aiPrompt.trim() || aiProcessing) ? 0.5 : 1 }}
            >{aiProcessing ? '생성 중...' : '🤖 AI 텍스트 생성'}</button>

            {aiError && <div style={{ fontSize: 10, color: theme.colors.accent.red }}>Error: {aiError}</div>}

            {aiResult && (
              <div style={{ padding: 10, borderRadius: theme.radius.md,
                background: theme.colors.bg.elevated,
                border: '1px solid ' + theme.colors.accent.purple + '33' }}>
                <div style={{ fontSize: 10, color: theme.colors.accent.purple, fontWeight: 600, marginBottom: 6 }}>
                  AI 생성 결과
                </div>
                <div style={{ fontSize: theme.fontSize.md, color: theme.colors.text.primary,
                  marginBottom: 8, padding: 8, background: theme.colors.bg.tertiary,
                  borderRadius: theme.radius.sm, lineHeight: 1.5 }}>
                  {aiResult.text}
                </div>
                <div style={{ fontSize: 10, color: theme.colors.text.muted, marginBottom: 8 }}>
                  추천: <strong style={{ color: theme.colors.accent.blue }}>{aiResult.suggestedPreset}</strong>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={handleAIApply}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: theme.radius.sm,
                      background: theme.colors.accent.blue, color: '#fff',
                      border: 'none', cursor: 'pointer', fontSize: theme.fontSize.sm, fontWeight: 600 }}
                  >타임라인에 추가</button>
                  <button onClick={() => setAiResult(null)}
                    style={{ padding: '6px 10px', borderRadius: theme.radius.sm,
                      background: theme.colors.bg.hover, color: theme.colors.text.secondary,
                      border: '1px solid ' + theme.colors.border.default,
                      cursor: 'pointer', fontSize: theme.fontSize.sm }}
                  >취소</button>
                </div>
              </div>
            )}

            <div style={{ fontSize: 9, color: theme.colors.text.muted, lineHeight: 1.5, marginTop: 4 }}>
              LLM: ollama run gemma4:e4b | ComfyUI: 127.0.0.1:8188
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
