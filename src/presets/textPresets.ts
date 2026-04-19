import type { Clip } from '../types/clip';

/* ═══════════════════════════════════════════════════
   TextPresetRegistry — scriptable, AI-composable
   
   Usage:
     import { getPreset, getPresetsByCategory, applyPreset } from '../presets/textPresets';
     
     // UI click
     const clip = applyPreset('subtitle-classic', baseClip);
     
     // Script / automation
     fetch('/api/script', { body: JSON.stringify({ action: 'applyPreset', presetId: 'title-neon', text: 'Hello' }) });
     
     // AI bridge
     const aiResult = await aiTextBridge.generate(prompt);
     const clip = applyPreset(aiResult.suggestedPreset, baseClip, { text: aiResult.text });
   ═══════════════════════════════════════════════════ */

export type PresetCategory = 'basic' | 'subtitle' | 'title' | 'trending' | 'aesthetic' | 'lowerThird';

export interface TextPreset {
  id: string;
  category: PresetCategory;
  label: string;
  labelEn: string;
  description: string;
  // Visual preview hints
  previewBg: string;        // CSS background for preset card
  previewColor: string;     // preview text color
  // Clip overrides
  style: Partial<Clip>;
}

const PRESETS: TextPreset[] = [
  // ──── BASIC ────
  {
    id: 'basic-white',
    category: 'basic',
    label: '기본 화이트',
    labelEn: 'Basic White',
    description: 'Clean white text with subtle shadow',
    previewBg: '#1a1a2e',
    previewColor: '#ffffff',
    style: {
      fontSize: 48, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#ffffff',
      fontWeight: 'normal', fontStyle: 'normal', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '', borderWidth: 0,
      shadowColor: '#000000', shadowX: 0, shadowY: 3,
      lineHeight: 1.3, width: 800, height: 200,
    },
  },
  {
    id: 'basic-boxed',
    category: 'basic',
    label: '박스 텍스트',
    labelEn: 'Boxed Text',
    description: 'White text on semi-transparent black box',
    previewBg: '#1a1a2e',
    previewColor: '#ffffff',
    style: {
      fontSize: 44, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '#000000', textBgOpacity: 70,
      borderColor: '', borderWidth: 0,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 800, height: 200,
    },
  },
  {
    id: 'basic-outline',
    category: 'basic',
    label: '아웃라인',
    labelEn: 'Outline',
    description: 'White text with black outline border',
    previewBg: '#1a1a2e',
    previewColor: '#ffffff',
    style: {
      fontSize: 48, fontFamily: 'Arial, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#000000', borderWidth: 3,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 800, height: 200,
    },
  },

  // ──── SUBTITLE ────
  {
    id: 'subtitle-classic',
    category: 'subtitle',
    label: '클래식 자막',
    labelEn: 'Classic Subtitle',
    description: 'Yellow text on black background — broadcast standard',
    previewBg: '#000000',
    previewColor: '#ffff00',
    style: {
      fontSize: 32, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#ffff00',
      fontWeight: 'normal', textAlign: 'center',
      textBgColor: '#000000', textBgOpacity: 80,
      borderColor: '', borderWidth: 0,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.4, width: 900, height: 120,
      y: 850,
    },
  },
  {
    id: 'subtitle-news',
    category: 'subtitle',
    label: '뉴스 자막',
    labelEn: 'News Banner',
    description: 'White text on blue bar with white border',
    previewBg: '#1a3a7a',
    previewColor: '#ffffff',
    style: {
      fontSize: 34, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '#1a3a7a', textBgOpacity: 90,
      borderColor: '#ffffff', borderWidth: 2,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 1000, height: 100,
      y: 880,
    },
  },
  {
    id: 'subtitle-minimal',
    category: 'subtitle',
    label: '미니멀 자막',
    labelEn: 'Minimal Subtitle',
    description: 'White text with shadow only — no background',
    previewBg: 'transparent',
    previewColor: '#ffffff',
    style: {
      fontSize: 30, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#ffffff',
      fontWeight: 'normal', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '', borderWidth: 0,
      shadowColor: '#000000', shadowX: 1, shadowY: 2,
      lineHeight: 1.4, width: 900, height: 100,
      y: 870,
    },
  },
  {
    id: 'subtitle-karaoke',
    category: 'subtitle',
    label: '노래방 자막',
    labelEn: 'Karaoke Style',
    description: 'Cyan text on dark purple with glow',
    previewBg: '#2d1b69',
    previewColor: '#00ffff',
    style: {
      fontSize: 36, fontFamily: 'Arial, sans-serif', fontColor: '#00ffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '#2d1b69', textBgOpacity: 85,
      borderColor: '#00ffff', borderWidth: 1,
      shadowColor: '#00ffff', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 900, height: 120,
      y: 850,
    },
  },

  // ──── TITLE ────
  {
    id: 'title-big',
    category: 'title',
    label: '빅 타이틀',
    labelEn: 'Big Title',
    description: 'Large bold white text with strong shadow',
    previewBg: '#0f0f23',
    previewColor: '#ffffff',
    style: {
      fontSize: 72, fontFamily: 'Arial, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '', borderWidth: 0,
      shadowColor: '#000000', shadowX: 3, shadowY: 5,
      lineHeight: 1.2, width: 1200, height: 300,
    },
  },
  {
    id: 'title-neon',
    category: 'title',
    label: '네온 타이틀',
    labelEn: 'Neon Title',
    description: 'Cyan glow effect on dark background',
    previewBg: '#0a0a1a',
    previewColor: '#00ffff',
    style: {
      fontSize: 64, fontFamily: 'Consolas, monospace', fontColor: '#00ffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '#000022', textBgOpacity: 50,
      borderColor: '#00ffff', borderWidth: 2,
      shadowColor: '#00ffff', shadowX: 0, shadowY: 0,
      lineHeight: 1.2, width: 1000, height: 250,
    },
  },
  {
    id: 'title-gold',
    category: 'title',
    label: '골드 타이틀',
    labelEn: 'Gold Title',
    description: 'Gold text with warm brown border',
    previewBg: '#1a0f00',
    previewColor: '#ffd700',
    style: {
      fontSize: 68, fontFamily: 'Georgia, serif', fontColor: '#ffd700',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#8b4513', borderWidth: 3,
      shadowColor: '#8b4513', shadowX: 2, shadowY: 4,
      lineHeight: 1.2, width: 1000, height: 250,
    },
  },

  // ──── TRENDING ────
  {
    id: 'trending-highlight',
    // Animation
    category: 'trending',
    label: '하이라이트',
    labelEn: 'Highlight Box',
    description: 'Bold white on red box — attention grabbing',
    previewBg: '#ff0000',
    previewColor: '#ffffff',
    style: {
      fontSize: 42, fontFamily: 'Impact, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '#ff0000', textBgOpacity: 95,
      borderColor: '#ffffff', borderWidth: 2,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 700, height: 160,
    },
  },
  {
    id: 'trending-gradient-pop',
    category: 'trending',
    label: '그라데이션 팝',
    labelEn: 'Gradient Pop',
    description: 'Pink text with purple border — social media style',
    previewBg: '#1a0020',
    previewColor: '#ff6b9d',
    style: {
      fontSize: 46, fontFamily: 'Arial, sans-serif', fontColor: '#ff6b9d',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '#1a0020', textBgOpacity: 60,
      borderColor: '#a855f7', borderWidth: 2,
      shadowColor: '#a855f7', shadowX: 0, shadowY: 3,
      lineHeight: 1.3, width: 800, height: 200,
    },
  },
  {
    id: 'trending-glow',
    category: 'trending',
    label: '글로우',
    labelEn: 'Glow Effect',
    description: 'Green glowing text on dark background',
    previewBg: '#001a00',
    previewColor: '#00ff88',
    style: {
      fontSize: 48, fontFamily: 'Verdana, sans-serif', fontColor: '#00ff88',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#00ff88', borderWidth: 1,
      shadowColor: '#00ff88', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 800, height: 200,
    },
  },
  {
    id: 'trending-fire',
    category: 'trending',
    label: '파이어',
    labelEn: 'Fire Text',
    description: 'Orange-red text with warm glow',
    previewBg: '#1a0500',
    previewColor: '#ff6600',
    style: {
      fontSize: 52, fontFamily: 'Impact, sans-serif', fontColor: '#ff6600',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#ff0000', borderWidth: 2,
      shadowColor: '#ff3300', shadowX: 0, shadowY: 4,
      lineHeight: 1.2, width: 800, height: 200,
    },
  },

  // ──── AESTHETIC ────
  {
    id: 'aesthetic-handwrite',
    category: 'aesthetic',
    label: '손글씨 감성',
    labelEn: 'Handwritten Feel',
    description: 'Cursive font with soft pink — vlog style',
    previewBg: '#1a1018',
    previewColor: '#ffb6c1',
    style: {
      fontSize: 40, fontFamily: 'Comic Sans MS, cursive', fontColor: '#ffb6c1',
      fontWeight: 'normal', fontStyle: 'italic', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '', borderWidth: 0,
      shadowColor: '#000000', shadowX: 1, shadowY: 2,
      lineHeight: 1.5, width: 800, height: 200,
    },
  },
  {
    id: 'aesthetic-vintage',
    category: 'aesthetic',
    label: '빈티지',
    labelEn: 'Vintage',
    description: 'Serif font in beige with brown border',
    previewBg: '#1a1510',
    previewColor: '#f5deb3',
    style: {
      fontSize: 44, fontFamily: 'Georgia, serif', fontColor: '#f5deb3',
      fontWeight: 'normal', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#8b4513', borderWidth: 2,
      shadowColor: '#000000', shadowX: 1, shadowY: 2,
      lineHeight: 1.4, width: 800, height: 200,
    },
  },
  {
    id: 'aesthetic-minimal-modern',
    category: 'aesthetic',
    label: '미니멀 모던',
    labelEn: 'Minimal Modern',
    description: 'Thin sans-serif in light gray — clean and quiet',
    previewBg: '#0f0f0f',
    previewColor: '#aaaaaa',
    style: {
      fontSize: 36, fontFamily: 'Segoe UI, sans-serif', fontColor: '#aaaaaa',
      fontWeight: 'normal', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '', borderWidth: 0,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.6, width: 800, height: 180,
    },
  },

  // ──── LOWER THIRD ────
  {
    id: 'lower-simple',
    category: 'lowerThird',
    label: '심플 바',
    labelEn: 'Simple Bar',
    description: 'Name bar with blue background at bottom',
    previewBg: '#3b82f6',
    previewColor: '#ffffff',
    style: {
      fontSize: 28, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'left',
      textBgColor: '#3b82f6', textBgOpacity: 90,
      borderColor: '', borderWidth: 0,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 500, height: 80,
      x: 40, y: 900,
    },
  },
  {
    id: 'lower-news',
    category: 'lowerThird',
    label: '뉴스 스타일',
    labelEn: 'News Style',
    description: 'Professional news lower third',
    previewBg: '#1a1a3a',
    previewColor: '#ffffff',
    style: {
      fontSize: 26, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'left',
      textBgColor: '#1a1a3a', textBgOpacity: 95,
      borderColor: '#ff0000', borderWidth: 2,
      shadowColor: '', shadowX: 0, shadowY: 0,
      lineHeight: 1.3, width: 600, height: 80,
      x: 40, y: 920,
    },
  },

  // ──── ANIMATED PRESETS ────
  {
    id: 'anim-bounce',
    category: 'trending',
    label: '바운스 텍스트',
    labelEn: 'Bounce Text',
    description: 'Bouncing text with energy',
    previewBg: '#1a0520',
    previewColor: '#ff6b6b',
    style: {
      fontSize: 48, fontFamily: 'Arial, sans-serif', fontColor: '#ff6b6b',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#ffffff', borderWidth: 2,
      shadowColor: '#ff0000', shadowX: 0, shadowY: 3,
      lineHeight: 1.3, width: 800, height: 200,
      animationType: 'bounce', animationSpeed: 1.2, animationAmplitude: 15, animationDelay: 60,
    } as any,
  },
  {
    id: 'anim-wave',
    category: 'trending',
    label: '웨이브 텍스트',
    labelEn: 'Wave Text',
    description: 'Smooth wave motion',
    previewBg: '#001a2e',
    previewColor: '#00bfff',
    style: {
      fontSize: 44, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#00bfff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#0088cc', borderWidth: 1,
      shadowColor: '#0066aa', shadowX: 0, shadowY: 2,
      lineHeight: 1.3, width: 800, height: 200,
      animationType: 'wave', animationSpeed: 1, animationAmplitude: 8, animationDelay: 40,
    } as any,
  },
  {
    id: 'anim-typewriter',
    category: 'aesthetic',
    label: '타이핑 효과',
    labelEn: 'Typewriter',
    description: 'Characters appear one by one',
    previewBg: '#0f0f0f',
    previewColor: '#00ff00',
    style: {
      fontSize: 36, fontFamily: 'Consolas, monospace', fontColor: '#00ff00',
      fontWeight: 'normal', textAlign: 'left',
      textBgColor: '#000000', textBgOpacity: 80,
      borderColor: '', borderWidth: 0,
      shadowColor: '#00ff00', shadowX: 0, shadowY: 0,
      lineHeight: 1.4, width: 900, height: 150,
      animationType: 'typewriter', animationSpeed: 1, animationDelay: 80,
    } as any,
  },
  {
    id: 'anim-slide',
    category: 'title',
    label: '슬라이드 인',
    labelEn: 'Slide In',
    description: 'Text slides in from left',
    previewBg: '#0a0a1a',
    previewColor: '#ffffff',
    style: {
      fontSize: 64, fontFamily: 'Arial, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '', borderWidth: 0,
      shadowColor: '#000000', shadowX: 2, shadowY: 4,
      lineHeight: 1.2, width: 1000, height: 250,
      animationType: 'slide-left', animationSpeed: 1.5, animationDelay: 30,
    } as any,
  },


  // ──── ANIMATED PRESETS ────
  {
    id: 'anim-bounce',
    category: 'trending',
    label: '바운스 텍스트',
    labelEn: 'Bounce Text',
    description: 'Bouncing text with energy',
    previewBg: '#1a0520',
    previewColor: '#ff6b6b',
    style: {
      fontSize: 48, fontFamily: 'Arial, sans-serif', fontColor: '#ff6b6b',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#ffffff', borderWidth: 2,
      shadowColor: '#ff0000', shadowX: 0, shadowY: 3,
      lineHeight: 1.3, width: 800, height: 200,
      animationType: 'bounce', animationSpeed: 1.2, animationAmplitude: 15, animationDelay: 60,
    } as any,
  },
  {
    id: 'anim-wave',
    category: 'trending',
    label: '웨이브 텍스트',
    labelEn: 'Wave Text',
    description: 'Smooth wave motion',
    previewBg: '#001a2e',
    previewColor: '#00bfff',
    style: {
      fontSize: 44, fontFamily: 'Malgun Gothic, sans-serif', fontColor: '#00bfff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '#0088cc', borderWidth: 1,
      shadowColor: '#0066aa', shadowX: 0, shadowY: 2,
      lineHeight: 1.3, width: 800, height: 200,
      animationType: 'wave', animationSpeed: 1, animationAmplitude: 8, animationDelay: 40,
    } as any,
  },
  {
    id: 'anim-typewriter',
    category: 'aesthetic',
    label: '타이핑 효과',
    labelEn: 'Typewriter',
    description: 'Characters appear one by one',
    previewBg: '#0f0f0f',
    previewColor: '#00ff00',
    style: {
      fontSize: 36, fontFamily: 'Consolas, monospace', fontColor: '#00ff00',
      fontWeight: 'normal', textAlign: 'left',
      textBgColor: '#000000', textBgOpacity: 80,
      borderColor: '', borderWidth: 0,
      shadowColor: '#00ff00', shadowX: 0, shadowY: 0,
      lineHeight: 1.4, width: 900, height: 150,
      animationType: 'typewriter', animationSpeed: 1, animationDelay: 80,
    } as any,
  },
  {
    id: 'anim-slide',
    category: 'title',
    label: '슬라이드 인',
    labelEn: 'Slide In',
    description: 'Text slides in from left',
    previewBg: '#0a0a1a',
    previewColor: '#ffffff',
    style: {
      fontSize: 64, fontFamily: 'Arial, sans-serif', fontColor: '#ffffff',
      fontWeight: 'bold', textAlign: 'center',
      textBgColor: '', textBgOpacity: 0,
      borderColor: '', borderWidth: 0,
      shadowColor: '#000000', shadowX: 2, shadowY: 4,
      lineHeight: 1.2, width: 1000, height: 250,
      animationType: 'slide-left', animationSpeed: 1.5, animationDelay: 30,
    } as any,
  },
];

/* ═══════ PUBLIC API ═══════ */

/** Get all categories with labels */
export const PRESET_CATEGORIES: { key: PresetCategory; label: string; labelEn: string; icon: string }[] = [
  { key: 'basic', label: '기본', labelEn: 'Basic', icon: 'Aa' },
  { key: 'subtitle', label: '자막', labelEn: 'Subtitle', icon: '💬' },
  { key: 'title', label: '제목', labelEn: 'Title', icon: '🔤' },
  { key: 'trending', label: '트렌딩', labelEn: 'Trending', icon: '🔥' },
  { key: 'aesthetic', label: '감성', labelEn: 'Aesthetic', icon: '✨' },
  { key: 'lowerThird', label: '로어서드', labelEn: 'Lower Third', icon: '📺' },
];

/** Get all presets */
export function getAllPresets(): TextPreset[] {
  return [...PRESETS];
}

/** Get presets by category */
export function getPresetsByCategory(category: PresetCategory): TextPreset[] {
  return PRESETS.filter(p => p.category === category);
}

/** Get a single preset by ID */
export function getPreset(id: string): TextPreset | undefined {
  return PRESETS.find(p => p.id === id);
}

/** Apply preset style to a partial Clip — returns Clip overrides.
 *  This is the SINGLE function used by UI, scripts, and AI bridge.
 *  textOverride allows replacing the text content (e.g., from AI generation). */
export function applyPresetStyle(
  presetId: string,
  textOverride?: string,
  positionOverride?: { x?: number; y?: number }
): Partial<Clip> {
  const preset = getPreset(presetId);
  if (!preset) return {};
  return {
    ...preset.style,
    ...(textOverride ? { text: textOverride, name: textOverride } : {}),
    ...(positionOverride || {}),
  };
}

/** Register a custom preset at runtime (for plugins / user presets) */
export function registerPreset(preset: TextPreset): void {
  const idx = PRESETS.findIndex(p => p.id === preset.id);
  if (idx >= 0) PRESETS[idx] = preset;
  else PRESETS.push(preset);
}

/** Remove a custom preset */
export function unregisterPreset(id: string): boolean {
  const idx = PRESETS.findIndex(p => p.id === id);
  if (idx >= 0) { PRESETS.splice(idx, 1); return true; }
  return false;
}

/** Serialize all presets to JSON (for export/backup) */
export function serializePresets(): string {
  return JSON.stringify(PRESETS, null, 2);
}

/** Load presets from JSON (for import) */
export function loadPresets(json: string): void {
  const parsed = JSON.parse(json) as TextPreset[];
  parsed.forEach(p => registerPreset(p));
}