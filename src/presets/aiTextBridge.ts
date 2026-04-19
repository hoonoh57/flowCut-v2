import type { Clip } from '../types/clip';

export interface AITextResult {
  text: string;
  suggestedPreset: string;
  imageUrl?: string;
  imageBase64?: string;
  metadata?: Record<string, unknown>;
}

export interface AIBridgeConfig {
  ollamaUrl: string;
  ollamaModel: string;
  comfyuiUrl: string;
  timeout: number;
}

const DEFAULT_CONFIG: AIBridgeConfig = {
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'gemma4:e4b',
  comfyuiUrl: 'http://127.0.0.1:8188',
  timeout: 30000,
};

let config: AIBridgeConfig = { ...DEFAULT_CONFIG };

export function configureAIBridge(partial: Partial<AIBridgeConfig>): void {
  config = { ...config, ...partial };
}

export function getAIBridgeConfig(): AIBridgeConfig {
  return { ...config };
}

export async function generateTextViaLLM(
  prompt: string,
  context?: { videoTopic?: string; targetPlatform?: string; language?: string }
): Promise<AITextResult> {
  const systemPrompt = [
    'You are a video text/subtitle generation assistant.',
    'Generate text and suggest a preset ID from:',
    'basic-white, basic-boxed, basic-outline, subtitle-classic, subtitle-news,',
    'subtitle-minimal, subtitle-karaoke, title-big, title-neon, title-gold,',
    'trending-highlight, trending-gradient-pop, trending-glow, trending-fire,',
    'aesthetic-handwrite, aesthetic-vintage, aesthetic-minimal-modern,',
    'lower-simple, lower-news.',
    'Respond in JSON: {"text": "...", "suggestedPreset": "..."}',
    context?.language ? 'Language: ' + context.language : 'Language: Korean',
  ].join('\n');

  try {
    const resp = await fetch(config.ollamaUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt,
        system: systemPrompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 500 },
      }),
      signal: AbortSignal.timeout(config.timeout),
    });

    if (!resp.ok) throw new Error('Ollama HTTP ' + resp.status);
    const data = await resp.json();
    const responseText = data.response || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        text: parsed.text || prompt,
        suggestedPreset: parsed.suggestedPreset || 'basic-white',
        metadata: { rawResponse: responseText },
      };
    }

    return { text: responseText.trim(), suggestedPreset: 'basic-white' };
  } catch (err) {
    console.warn('[AIBridge] LLM generation failed:', err);
    throw err;
  }
}

export async function generateImageViaComfyUI(
  prompt: string,
  options?: { width?: number; height?: number }
): Promise<AITextResult> {
  const width = options?.width || 800;
  const height = options?.height || 200;

  const workflow: Record<string, any> = {
    '3': {
      class_type: 'KSampler',
      inputs: { seed: Math.floor(Math.random() * 1e15), steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] },
    },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, ugly, distorted', clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'flowcut_ai', images: ['8', 0] } },
  };

  try {
    const queueResp = await fetch(config.comfyuiUrl + '/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: AbortSignal.timeout(config.timeout * 3),
    });

    if (!queueResp.ok) throw new Error('ComfyUI HTTP ' + queueResp.status);
    const queueData = await queueResp.json();
    const promptId = queueData.prompt_id;

    let imageUrl = '';
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const histResp = await fetch(config.comfyuiUrl + '/history/' + promptId);
      const histData = await histResp.json();
      const outputNode = histData[promptId]?.outputs?.['9'];
      if (outputNode?.images?.[0]) {
        const img = outputNode.images[0];
        imageUrl = config.comfyuiUrl + '/view?filename=' + img.filename + '&subfolder=' + (img.subfolder || '') + '&type=' + (img.type || 'output');
        break;
      }
    }

    if (!imageUrl) throw new Error('ComfyUI: image generation timed out');

    return { text: prompt, suggestedPreset: 'basic-white', imageUrl, metadata: { promptId } };
  } catch (err) {
    console.warn('[AIBridge] ComfyUI generation failed:', err);
    throw err;
  }
}

export async function generateAIContent(
  prompt: string,
  options?: {
    generateImage?: boolean;
    imageWidth?: number;
    imageHeight?: number;
    context?: { videoTopic?: string; targetPlatform?: string; language?: string };
  }
): Promise<AITextResult> {
  const textResult = await generateTextViaLLM(prompt, options?.context);

  if (options?.generateImage) {
    try {
      const imageResult = await generateImageViaComfyUI(
        'video title card: ' + textResult.text,
        { width: options.imageWidth, height: options.imageHeight }
      );
      return { ...textResult, imageUrl: imageResult.imageUrl };
    } catch {
      return textResult;
    }
  }

  return textResult;
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const resp = await fetch(config.ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch { return false; }
}

export async function checkComfyUIHealth(): Promise<boolean> {
  try {
    const resp = await fetch(config.comfyuiUrl + '/system_stats', { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch { return false; }
}
