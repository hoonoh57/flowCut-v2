// src/scripting/PromptEnhancer.ts
// LLM-powered prompt enhancement + cinematic keyword injection

import { detectSceneType, suggestCamera, suggestLighting, suggestShotSize } from '../config/cinematicKeywords';
import type { SceneType } from '../config/cinematicKeywords';
import { getProviderManager } from '../providers/ProviderManager';

export interface EnhancedPrompt {
  original: string;
  enhanced: string;
  negative: string;
  sceneType: SceneType;
  camera: string;
  lighting: string;
  shotSize: string;
}

// --- Cinematic Enhancement (no LLM, instant) ---
export function enhanceWithCinematic(
  prompt: string,
  energy: 'low' | 'medium' | 'high' = 'medium'
): EnhancedPrompt {
  const sceneType = detectSceneType(prompt);
  const camera = suggestCamera(sceneType, energy);
  const lighting = suggestLighting(sceneType);
  const shotSize = suggestShotSize(sceneType);

  const parts = [
    prompt,
    shotSize,
    camera.prompt,
    lighting.prompt,
    '8K, highly detailed, professional photography',
  ];

  const enhanced = parts.filter(Boolean).join(', ');

  const negativeParts = ['blurry, ugly, deformed, low quality, JPEG artifacts, watermark, text'];
  if (sceneType === 'portrait' || sceneType === 'emotion') {
    negativeParts.push('deformed face, extra fingers, mutated hands, bad anatomy');
  }

  return {
    original: prompt,
    enhanced,
    negative: negativeParts.join(', '),
    sceneType,
    camera: camera.prompt,
    lighting: lighting.prompt,
    shotSize,
  };
}

// --- LLM Enhancement (async, uses Ollama/OpenAI) ---
export async function enhanceWithLLM(
  prompt: string,
  options?: {
    genre?: string;
    era?: string;
    tone?: string;
    energy?: 'low' | 'medium' | 'high';
  }
): Promise<EnhancedPrompt> {
  const pm = getProviderManager();

  const systemPrompt = [
    'You are a cinematic AI video prompt engineer.',
    'Given a simple scene description, enhance it with:',
    '1. Specific camera angle and movement',
    '2. Lighting description',
    '3. Atmospheric details',
    '4. Visual style keywords',
    '',
    'Rules:',
    '- Keep the original intent',
    '- Add cinematic quality keywords',
    '- Be specific about camera (e.g., "slow dolly in", "medium close-up")',
    '- Be specific about lighting (e.g., "golden hour", "Rembrandt lighting")',
    '- Output ONLY the enhanced prompt text, no explanation',
    '- Maximum 80 words',
    '',
    options?.genre ? 'Genre: ' + options.genre : '',
    options?.era ? 'Era: ' + options.era : '',
    options?.tone ? 'Tone: ' + options.tone : '',
  ].filter(Boolean).join('\n');

  try {
    const result = await pm.callLLM({
      prompt: 'Enhance this scene prompt for AI video generation:\n\n"' + prompt + '"',
      system: systemPrompt,
      temperature: 0.7,
      maxTokens: 200,
    });

    if (result.success && result.text) {
      const cleanText = result.text
        .replace(/^["']|["']$/g, '')
        .replace(/^Enhanced prompt:\s*/i, '')
        .replace(/^Here'?s?\s*(the\s*)?enhanced\s*prompt:\s*/i, '')
        .trim();

      const sceneType = detectSceneType(cleanText);

      return {
        original: prompt,
        enhanced: cleanText,
        negative: 'blurry, ugly, deformed, low quality, JPEG artifacts, watermark, text',
        sceneType,
        camera: 'LLM-determined',
        lighting: 'LLM-determined',
        shotSize: 'LLM-determined',
      };
    }
  } catch (err) {
    console.warn('[PromptEnhancer] LLM failed, falling back to cinematic:', err);
  }

  // Fallback to non-LLM enhancement
  return enhanceWithCinematic(prompt, options?.energy || 'medium');
}

// --- Batch enhance for VideoDirector beats ---
export function enhanceBeats(
  beats: Array<{ scenePrompt: string; energy: 'low' | 'medium' | 'high' }>
): Array<{ original: string; enhanced: string; negative: string }> {
  return beats.map(beat => {
    const result = enhanceWithCinematic(beat.scenePrompt, beat.energy);
    return {
      original: beat.scenePrompt,
      enhanced: result.enhanced,
      negative: result.negative,
    };
  });
}

// --- Expose to browser console ---
if (typeof window !== 'undefined') {
  (window as any).__flowcut_enhancer = {
    enhance: enhanceWithCinematic,
    enhanceLLM: enhanceWithLLM,
    enhanceBeats,
  };
}
