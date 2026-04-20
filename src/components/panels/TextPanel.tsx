import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { createTextClipFromPreset, createMediaClipFromItem } from '../../utils/clipFactory';
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
import {
  analyzeAndPlan,
  executeComfyWorkflow,
  renderInfographic,
  uploadInfographic,
  type CreativePlan,
  type GeneratedAsset,
} from '../../presets/aiCreativeDirector';
import type { MediaItem } from '../../stores/slices/mediaSlice';

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
  const [creativePlan, setCreativePlan] = useState<CreativePlan | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);

  useEffect(() => {
    checkOllamaHealth().then(setAiAvailable).catch(() => setAiAvailable(false));
  }, []);

  const addTrack = useEditorStore((s) => s.addTrack);
  const addMediaItem = useEditorStore((s) => s.addMediaItem);

  // ─── Helper: Add generated image to media panel + timeline ───
  const addGeneratedAssetToTimeline = (asset: GeneratedAsset, label: string) => {
    // 1. Create a MediaItem and register in media panel
    const mediaItem: MediaItem = {
      id: 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: label,
      type: asset.type === 'video' ? 'video' : 'image',
      url: asset.serverUrl,
      objectUrl: asset.serverUrl,
      localPath: asset.localPath,
      duration: 5,            // default 5 seconds for images
      width: asset.width,
      height: asset.height,
      size: 0,                // unknown at this point
    };
    addMediaItem(mediaItem);

    // 2. Find or create an image/video track
    let imgTrack = tracks.find(t => t.type === 'video');
    if (!imgTrack) {
      const newTrack = {
        id: 'v' + Date.now(),
        name: 'Video 1',
        type: 'video' as const,
        order: 100,
        height: 60,
        color: '#3b82f6',
        locked: false,
        visible: true,
      };
      addTrack(newTrack);
      imgTrack = newTrack;
    }

    // 3. Create image clip on timeline at current playhead
    const clip = createMediaClipFromItem(
      mediaItem,
      imgTrack.id,
      currentFrame,
      fps,
      {
        x: 0,
        y: 0,
        width: asset.width || 1920,
        height: asset.height || 1080,
      }
    );
    dispatch(new AddClipCommand(clip));

    return { mediaItem, clip };
  };

  const addPresetClip = (preset: TextPreset, text?: string) => {
    let tTrack = tracks.find(t => t.type === 'text');
    if (!tTrack) {
      const newTrack = {
        id: 't' + Date.now(),
        name: 'Text ' + (tracks.filter(t => t.type === 'text').length + 1),
        type: 'text' as const,
        order: 300,
        height: 40,
        color: '#f59e0b',
        locked: false,
        visible: true,
      };
      addTrack(newTrack);
      tTrack = newTrack;
    }
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
    setCreativePlan(null);
    setExecutionLog([]);
    setGeneratedPreview(null);
    try {
      setExecutionLog(prev => [...prev, '🧠 AI가 요청을 분석 중...']);
      const plan = await analyzeAndPlan(aiPrompt);
      setCreativePlan(plan);
      setExecutionLog(prev => [...prev, '📋 계획: ' + plan.action, ...(plan.steps || []).map(s => '  → ' + s)]);

      if (plan.text) {
        setAiResult({ text: plan.text, suggestedPreset: plan.presetId || 'basic-white' });
      }
    } catch (err: any) {
      setAiError(err.message || 'AI analysis failed');
    } finally {
      setAiProcessing(false);
    }
  };

  const executeCreativePlan = async () => {
    if (!creativePlan) return;
    setIsExecuting(true);
    setAiError('');
    setGeneratedPreview(null);

    try {
      const plan = creativePlan;

      // ━━━ TEXT ONLY ━━━
      if (plan.action === 'textOnly') {
        handleAIApply();
        setExecutionLog(prev => [...prev, '✅ 텍스트 클립 추가 완료']);
      }

      // ━━━ COMPOSITE LAYOUT (Infographic / Table) ━━━
      else if (plan.action === 'compositeLayout' && plan.layoutData) {
        setExecutionLog(prev => [...prev, '🎨 인포그래픽 렌더링 중...']);
        const w = plan.width || 1920;
        const h = plan.height || 1080;
        const canvas = renderInfographic(plan.layoutData, w, h);

        setExecutionLog(prev => [...prev, '📤 서버에 업로드 중...']);
        const asset = await uploadInfographic(canvas, w, h);

        // Show preview
        setGeneratedPreview(asset.serverUrl);

        // Auto-add to media panel + timeline
        const { clip } = addGeneratedAssetToTimeline(asset, '📊 ' + (plan.layoutData.title || 'Infographic'));
        setExecutionLog(prev => [
          ...prev,
          '✅ 인포그래픽 생성 완료!',
          '📁 미디어 패널에 추가됨',
          '🎬 타임라인에 이미지 클립 삽입 (frame ' + clip.startFrame + ')',
        ]);
      }

      // ━━━ GENERATE IMAGE / IMAGE WITH TEXT ━━━
      else if (['generateImage', 'imageWithText'].includes(plan.action) && plan.workflow) {
        setExecutionLog(prev => [...prev, '🖼️ ComfyUI 이미지 생성 중... (' + plan.workflow + ')']);
        setExecutionLog(prev => [...prev, '⏳ GPU에서 렌더링 중 — 10~30초 소요']);

        const asset = await executeComfyWorkflow(plan.workflow, {
          positive: plan.comfyPrompt || plan.text || '',
          negative: plan.comfyNegative,
          width: plan.width || 1280,
          height: plan.height || 720,
        });

        // Show preview thumbnail
        setGeneratedPreview(asset.serverUrl);

        // Auto-add to media panel + timeline
        const label = plan.action === 'imageWithText'
          ? '🖼️+📝 ' + (plan.comfyPrompt || 'AI Image').substring(0, 30)
          : '🖼️ ' + (plan.comfyPrompt || 'AI Image').substring(0, 30);

        const { clip } = addGeneratedAssetToTimeline(asset, label);
        setExecutionLog(prev => [
          ...prev,
          '✅ 이미지 생성 완료!',
          '📁 미디어 패널에 등록됨: ' + asset.filename,
          '🎬 타임라인에 삽입됨 (frame ' + clip.startFrame + ', 5초)',
        ]);

        // If imageWithText, also add text overlay clip
        if (plan.action === 'imageWithText' && plan.text) {
          handleAIApply();
          setExecutionLog(prev => [...prev, '📝 텍스트 오버레이 클립 추가 완료']);
        }
      }

      // ━━━ VIDEO GENERATION (placeholder) ━━━
      else if (['generateVideo', 'videoWithText'].includes(plan.action)) {
        setExecutionLog(prev => [...prev, '🎬 Wan2.2 영상 생성 시작...']);
        const videoResult = await executeComfyWorkflow(plan.workflow || 'video-t2v', {
          positive: plan.comfyPrompt || plan.text || '',
          negative: plan.comfyNegative,
          // width/height: use workflow default
        }, (msg) => setExecutionLog(prev => [...prev, msg]));
        if (videoResult.servePath) {
          setGeneratedPreview(videoResult.serverUrl);
          const { clip: vidClip } = addGeneratedAssetToTimeline(videoResult, '🎬 ' + (plan.comfyPrompt || 'AI Video').substring(0, 30));
          setExecutionLog(prev => [...prev,
            '✅ 영상 생성 완료!',
            '📁 미디어 패널에 등록됨: ' + videoResult.filename,
            '🎬 타임라인에 삽입됨 (frame ' + vidClip.startFrame + ')',
          ]);
        }
        if (plan.text) {
          handleAIApply();
        }
      }

      setExecutionLog(prev => [...prev, '', '🎉 모든 작업 완료!']);
    } catch (err: any) {
      setAiError(err.message || 'Execution failed');
      setExecutionLog(prev => [...prev, '❌ 오류: ' + (err.message || 'unknown')]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleAIApply = () => {
    if (!aiResult) return;
    let tTrack = tracks.find(t => t.type === 'text');
    if (!tTrack) {
      const newTrack = {
        id: 't' + Date.now(),
        name: 'Text ' + (tracks.filter(t => t.type === 'text').length + 1),
        type: 'text' as const,
        order: 300,
        height: 40,
        color: '#f59e0b',
        locked: false,
        visible: true,
      };
      addTrack(newTrack);
      tTrack = newTrack;
    }
    const clip = createTextClipFromPreset(
      aiResult.suggestedPreset || 'basic-white',
      tTrack.id, currentFrame, fps, aiResult.text
    );
    dispatch(new AddClipCommand(clip));
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
              placeholder={'AI Creative Director에게 요청...\n예: 게임 채널 인트로 배경 이미지\n예: 프로그래밍 언어 비교표\n예: 유튜브 강의용 제목 카드'}
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
            >{aiProcessing ? '🧠 분석 중...' : '🤖 AI 분석 & 계획'}</button>

            {aiError && (
              <div style={{ fontSize: 10, color: theme.colors.accent.red, padding: '4px 8px',
                background: theme.colors.accent.red + '11', borderRadius: theme.radius.sm }}>
                ❌ {aiError}
              </div>
            )}

            {/* AI Text Result (for textOnly / imageWithText) */}
            {aiResult && (
              <div style={{ padding: 10, borderRadius: theme.radius.md,
                background: theme.colors.bg.elevated,
                border: '1px solid ' + theme.colors.accent.purple + '33' }}>
                <div style={{ fontSize: 10, color: theme.colors.accent.purple, fontWeight: 600, marginBottom: 6 }}>
                  📝 AI 생성 텍스트
                </div>
                <div style={{ fontSize: theme.fontSize.md, color: theme.colors.text.primary,
                  marginBottom: 8, padding: 8, background: theme.colors.bg.tertiary,
                  borderRadius: theme.radius.sm, lineHeight: 1.5 }}>
                  {aiResult.text}
                </div>
                <div style={{ fontSize: 10, color: theme.colors.text.muted, marginBottom: 8 }}>
                  추천 프리셋: <strong style={{ color: theme.colors.accent.blue }}>{aiResult.suggestedPreset}</strong>
                </div>
                {/* Only show manual "add text" button for textOnly */}
                {creativePlan?.action === 'textOnly' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { handleAIApply(); setExecutionLog(prev => [...prev, '✅ 텍스트 클립 추가 완료']); }}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: theme.radius.sm,
                        background: theme.colors.accent.blue, color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: theme.fontSize.sm, fontWeight: 600 }}
                    >타임라인에 추가</button>
                    <button onClick={() => { setAiResult(null); setCreativePlan(null); }}
                      style={{ padding: '6px 10px', borderRadius: theme.radius.sm,
                        background: theme.colors.bg.hover, color: theme.colors.text.secondary,
                        border: '1px solid ' + theme.colors.border.default,
                        cursor: 'pointer', fontSize: theme.fontSize.sm }}
                    >취소</button>
                  </div>
                )}
              </div>
            )}

            {/* Creative Plan (for non-textOnly actions) */}
            {creativePlan && creativePlan.action !== 'textOnly' && (
              <div style={{ padding: 10, borderRadius: theme.radius.md,
                background: theme.colors.bg.elevated,
                border: '1px solid ' + theme.colors.accent.green + '33' }}>
                <div style={{ fontSize: 10, color: theme.colors.accent.green, fontWeight: 600, marginBottom: 6 }}>
                  🎬 AI 제작 계획
                </div>
                <div style={{ fontSize: 11, color: theme.colors.text.primary, marginBottom: 4 }}>
                  액션: <strong>{creativePlan.action}</strong>
                  {creativePlan.workflow && <span> | 워크플로우: <strong>{creativePlan.workflow}</strong></span>}
                </div>
                {creativePlan.comfyPrompt && (
                  <div style={{ fontSize: 10, color: theme.colors.text.muted, marginBottom: 8,
                    fontStyle: 'italic', padding: '4px 6px', background: theme.colors.bg.tertiary,
                    borderRadius: theme.radius.sm }}>
                    🎨 "{creativePlan.comfyPrompt.substring(0, 100)}{creativePlan.comfyPrompt.length > 100 ? '...' : ''}"
                  </div>
                )}
                {creativePlan.layoutData && (
                  <div style={{ fontSize: 10, color: theme.colors.text.muted, marginBottom: 8 }}>
                    📊 {creativePlan.layoutData.type}: {creativePlan.layoutData.title}
                  </div>
                )}
                <button onClick={executeCreativePlan} disabled={isExecuting}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: theme.radius.sm,
                    background: isExecuting ? theme.colors.bg.hover : theme.colors.accent.green,
                    color: '#fff', border: 'none',
                    cursor: isExecuting ? 'wait' : 'pointer',
                    fontSize: theme.fontSize.sm, fontWeight: 600,
                    opacity: isExecuting ? 0.6 : 1 }}
                >{isExecuting ? '⏳ 생성 중... (GPU 작업)' : '🚀 제작 실행 → 타임라인에 자동 삽입'}</button>
              </div>
            )}

            {/* Generated Image Preview */}
            {generatedPreview && (
              <div style={{ borderRadius: theme.radius.md, overflow: 'hidden',
                border: '2px solid ' + theme.colors.accent.green }}>
                <div style={{ fontSize: 9, padding: '4px 8px', background: theme.colors.accent.green + '22',
                  color: theme.colors.accent.green, fontWeight: 600 }}>
                  ✅ 생성된 이미지 (타임라인에 추가됨)
                </div>
                <img src={generatedPreview} alt="AI Generated"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  crossOrigin="anonymous"
                />
              </div>
            )}

            {/* Execution Log */}
            {executionLog.length > 0 && (
              <div style={{ padding: 8, borderRadius: theme.radius.sm,
                background: theme.colors.bg.tertiary, maxHeight: 180, overflowY: 'auto' }}>
                {executionLog.map((log, i) => (
                  <div key={i} style={{
                    fontSize: 10, lineHeight: 1.6, fontFamily: 'monospace',
                    color: log.includes('✅') || log.includes('🎉') ? theme.colors.accent.green
                      : log.includes('❌') ? theme.colors.accent.red
                      : log.includes('⏳') || log.includes('📤') ? theme.colors.accent.blue
                      : theme.colors.text.secondary
                  }}>{log}</div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 9, color: theme.colors.text.muted, lineHeight: 1.5, marginTop: 4 }}>
              LLM: ollama (gemma4:e4b) | ComfyUI: 127.0.0.1:8188 | GPU: RTX 4070
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
