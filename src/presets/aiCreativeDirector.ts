import type { Clip } from '../types/clip';
import { generateTextViaLLM, getAIBridgeConfig } from './aiTextBridge';

/* ═══════════════════════════════════════════
   AI Creative Director — Analyzes prompts and
   decides what to create: text, image, video,
   composite layout, or combination.
   ═══════════════════════════════════════════ */

export type CreativeAction =
  | 'textOnly'
  | 'generateImage'
  | 'generateVideo'
  | 'compositeLayout'
  | 'imageWithText'
  | 'videoWithText';

export interface CreativePlan {
  action: CreativeAction;
  text?: string;
  presetId?: string;
  workflow?: string;
  comfyPrompt?: string;
  comfyNegative?: string;
  layoutData?: LayoutData;
  width?: number;
  height?: number;
  duration?: number;
  steps?: string[];
}

export interface LayoutData {
  type: 'table' | 'comparison' | 'list' | 'timeline' | 'custom';
  title: string;
  columns?: string[];
  rows?: string[][];
  items?: { label: string; value: string; icon?: string }[];
  style?: {
    bgColor?: string;
    textColor?: string;
    accentColor?: string;
    fontSize?: number;
  };
}

/* Result returned after ComfyUI or Canvas generation */
export interface GeneratedAsset {
  type: 'image' | 'video' | 'infographic';
  servePath: string;       // e.g. "/media/ai_123_image.png"
  serverUrl: string;       // e.g. "http://localhost:3456/media/ai_123_image.png"
  localPath: string;       // e.g. "E:\\2026\\flowcut\\media_cache\\ai_123_image.png"
  filename: string;        // e.g. "ai_123_image.png"
  width: number;
  height: number;
  promptId?: string;
}

const DIRECTOR_SYSTEM_PROMPT = `You are an AI Creative Director for a video editor.
Analyze the user's request and create a detailed production plan.

You MUST respond in valid JSON with this structure:
{
  "action": "textOnly" | "generateImage" | "generateVideo" | "compositeLayout" | "imageWithText" | "videoWithText",
  "text": "generated text content (Korean preferred)",
  "presetId": "text preset ID if text is involved",
  "workflow": "workflow template ID if image/video needed",
  "comfyPrompt": "English prompt for image/video generation",
  "comfyNegative": "negative prompt (optional)",
  "layoutData": { ... } (only for compositeLayout),
  "width": 1920,
  "height": 1080,
  "duration": 5,
  "steps": ["step 1 description", "step 2 description"]
}

AVAILABLE WORKFLOWS:
- "title-card": Photorealistic title card image (SDXL Lightning, fast)
- "background-scene": Artistic background/scene (DreamShaper XL)
- "anime-illustration": Anime/illustration style art (novaAnimeXL)
- "upscale-image": AI upscale existing image (4x-UltraSharp)
- "infographic-layout": Table/chart/infographic (Canvas, instant)
- "video-t2v": Text-to-Video (Wan2.2 5B, 480x272, ~1-3min)
- "video-i2v": Image-to-Video (Wan2.2 5B, needs reference image)

AVAILABLE TEXT PRESETS:
- trending-highlight: RED box, YouTube thumbnails, strong impact
- title-big: Large bold, main titles
- title-neon: Cyan glow, tech/gaming
- title-gold: Gold luxury text
- trending-fire: Orange energy text
- subtitle-classic: Yellow on black subtitles
- aesthetic-handwrite: Cursive vlog style
- lower-news: Professional info bar

DECISION RULES:
- "유튜브 썸네일/인트로" → action: imageWithText, workflow: title-card
- "배경 만들어줘" → action: generateImage, workflow: background-scene
- "비교표/설명자료/테이블" → action: compositeLayout
- "텍스트로 영상 만들어" → action: generateVideo, workflow: video-t2v
- "이미지를 영상으로/움직이게" → action: generateVideo, workflow: video-i2v
- "강한 제목/타이틀만" → action: textOnly
- "인포그래픽" → action: compositeLayout with layoutData
- General image request → action: generateImage

For compositeLayout, provide layoutData with type, title, columns, rows.
For comfyPrompt, write in ENGLISH, be descriptive, include style keywords.
Always include "steps" array explaining what will be created.`;


/* --- VRAM Management --- */

export async function unloadOllamaFromVRAM(): Promise<boolean> {
  const config = getAIBridgeConfig();
  try {
    const resp = await fetch(config.ollamaUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollamaModel, prompt: '', keep_alive: 0 }),
      signal: AbortSignal.timeout(5000),
    });
    console.log('[VRAM] Ollama unloaded:', resp.ok);
    return resp.ok;
  } catch { return false; }
}

export async function reloadOllamaToVRAM(): Promise<boolean> {
  const config = getAIBridgeConfig();
  try {
    const resp = await fetch(config.ollamaUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollamaModel, prompt: 'hi', keep_alive: '10m', stream: false, options: { num_predict: 1 } }),
      signal: AbortSignal.timeout(30000),
    });
    console.log('[VRAM] Ollama reloaded:', resp.ok);
    return resp.ok;
  } catch { return false; }
}
export async function analyzeAndPlan(userPrompt: string): Promise<CreativePlan> {
  const config = getAIBridgeConfig();

  try {
    const resp = await fetch(config.ollamaUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt: userPrompt,
        system: DIRECTOR_SYSTEM_PROMPT,
        stream: false,
        options: { temperature: 0.4, num_predict: 1500 },
      }),
      signal: AbortSignal.timeout(config.timeout * 2),
    });

    if (!resp.ok) throw new Error('Ollama HTTP ' + resp.status);
    const data = await resp.json();
    const responseText = data.response || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0]) as CreativePlan;
      const validActions: CreativeAction[] = [
        'textOnly', 'generateImage', 'generateVideo',
        'compositeLayout', 'imageWithText', 'videoWithText'
      ];
      if (!validActions.includes(plan.action)) plan.action = 'textOnly';
      if (!plan.steps) plan.steps = [plan.action + ' will be executed'];
      return plan;
    }

    return {
      action: 'textOnly',
      text: responseText.trim() || userPrompt,
      presetId: 'basic-white',
      steps: ['AI could not parse a structured plan, falling back to text-only'],
    };
  } catch (err) {
    console.warn('[AIDirector] Plan generation failed:', err);
    throw err;
  }
}

/**
 * Execute ComfyUI workflow and return asset info
 */
export async function executeComfyWorkflow(
  workflowId: string,
  params: Record<string, any>,
  onLog?: (msg: string) => void,
): Promise<GeneratedAsset> {
  const log = onLog || (() => {});

  // 1) Ollama VRAM 해제
  log('🧹 Ollama VRAM 해제 중...');
  const unloaded = await unloadOllamaFromVRAM();
  if (unloaded) {
    log('✅ GPU 메모리 확보 완료');
    await new Promise(r => setTimeout(r, 2000));
  } else {
    log('⚠️ Ollama 언로드 건너뜀');
  }

  // 2) ComfyUI 실행
  log('🖼️ ComfyUI 이미지 생성 중... (' + workflowId + ')');
  let asset: GeneratedAsset;
  try {
    const resp = await fetch('http://localhost:3456/api/comfyui/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId,
        positive: params.positive || '',
        negative: params.negative || 'blurry, ugly, distorted, low quality',
        width: params.width,
        height: params.height,
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error('ComfyUI: ' + data.error);
    if (!data.success) throw new Error('ComfyUI: unexpected response');

    const servePath = data.servePath || '';
    asset = {
      type: (servePath.endsWith('.webm') || servePath.endsWith('.mp4')) ? 'video' : 'image',
      servePath,
      serverUrl: data.serverUrl || ('http://localhost:3456' + servePath),
      localPath: data.localPath || '',
      filename: servePath.split('/').pop() || data.imageFilename || 'ai_image.png',
      width: params.width || 1280,
      height: params.height || 720,
      promptId: data.promptId,
    };
  } catch (err) {
    log('⚠️ 오류 발생 — Ollama 복구 중...');
    await reloadOllamaToVRAM();
    throw err;
  }

  // 3) Ollama 복구
  log('🔄 Ollama 모델 복구 중...');
  await reloadOllamaToVRAM();
  log('✅ AI 대화 복구 완료');

  return asset;
}

/**
 * Upload a canvas-rendered infographic and return asset info
 */
export async function uploadInfographic(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<GeneratedAsset> {
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Canvas render failed');

  const formData = new FormData();
  const filename = 'infographic_' + Date.now() + '.png';
  formData.append('file', blob, filename);

  const uploadResp = await fetch('http://localhost:3456/api/upload', {
    method: 'POST',
    body: formData,
  });
  const uploadData = await uploadResp.json();

  if (!uploadData.success) {
    throw new Error('Upload failed: ' + (uploadData.error || 'unknown'));
  }

  return {
    type: 'infographic',
    servePath: uploadData.servePath,
    serverUrl: 'http://localhost:3456' + uploadData.servePath,
    localPath: uploadData.localPath || '',
    filename: uploadData.fileName || filename,
    width,
    height,
  };
}

/**
 * Render infographic/table layout to PNG via Canvas
 */
export function renderInfographic(
  layout: LayoutData,
  width: number = 1920,
  height: number = 1080
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const style = layout.style || {};
  const bgColor = style.bgColor || '#1a1a2e';
  const textColor = style.textColor || '#ffffff';
  const accentColor = style.accentColor || '#3b82f6';
  const fontSize = style.fontSize || 24;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = accentColor;
  ctx.font = 'bold ' + (fontSize * 1.8) + 'px "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(layout.title, width / 2, 80);

  if (layout.type === 'table' && layout.columns && layout.rows) {
    const cols = layout.columns.length;
    const rows = layout.rows.length;
    const tableW = width * 0.85;
    const tableH = height * 0.7;
    const startX = (width - tableW) / 2;
    const startY = 120;
    const cellW = tableW / cols;
    const cellH = tableH / (rows + 1);

    ctx.fillStyle = accentColor + '44';
    ctx.fillRect(startX, startY, tableW, cellH);
    ctx.fillStyle = accentColor;
    ctx.font = 'bold ' + fontSize + 'px "Malgun Gothic", sans-serif';
    for (let c = 0; c < cols; c++) {
      ctx.textAlign = 'center';
      ctx.fillText(layout.columns[c], startX + cellW * c + cellW / 2, startY + cellH / 2 + fontSize / 3);
    }

    ctx.font = fontSize + 'px "Malgun Gothic", sans-serif';
    for (let r = 0; r < rows; r++) {
      const y = startY + cellH * (r + 1);
      if (r % 2 === 0) {
        ctx.fillStyle = '#ffffff08';
        ctx.fillRect(startX, y, tableW, cellH);
      }
      ctx.fillStyle = textColor;
      for (let c = 0; c < cols; c++) {
        const text = layout.rows[r]?.[c] || '';
        ctx.textAlign = 'center';
        ctx.fillText(text, startX + cellW * c + cellW / 2, y + cellH / 2 + fontSize / 3);
      }
    }

    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(startX + cellW * c, startY);
      ctx.lineTo(startX + cellW * c, startY + cellH * (rows + 1));
      ctx.stroke();
    }
    for (let r = 0; r <= rows + 1; r++) {
      ctx.beginPath();
      ctx.moveTo(startX, startY + cellH * r);
      ctx.lineTo(startX + tableW, startY + cellH * r);
      ctx.stroke();
    }
  } else if (layout.type === 'comparison' && layout.items) {
    const items = layout.items;
    const cardW = (width * 0.85) / items.length;
    const startX = (width - cardW * items.length) / 2;
    const startY = 140;
    const cardH = height - startY - 60;

    for (let i = 0; i < items.length; i++) {
      const x = startX + cardW * i + 10;
      const w = cardW - 20;
      ctx.fillStyle = '#ffffff0a';
      ctx.beginPath();
      ctx.roundRect(x, startY, w, cardH, 12);
      ctx.fill();
      ctx.strokeStyle = accentColor + '66';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, startY, w, cardH, 12);
      ctx.stroke();
      ctx.fillStyle = accentColor;
      ctx.font = 'bold ' + (fontSize * 1.2) + 'px "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(items[i].label, x + w / 2, startY + 50);
      ctx.fillStyle = textColor;
      ctx.font = fontSize + 'px "Malgun Gothic", sans-serif';
      const words = items[i].value.split(' ');
      let lineY = startY + 100;
      let line = '';
      for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > w - 30 && line) {
          ctx.fillText(line.trim(), x + w / 2, lineY);
          line = word + ' ';
          lineY += fontSize * 1.4;
        } else {
          line = test;
        }
      }
      if (line.trim()) ctx.fillText(line.trim(), x + w / 2, lineY);
    }
  } else if (layout.type === 'list' && layout.items) {
    const startX = width * 0.1;
    let y = 140;
    ctx.textAlign = 'left';
    for (let i = 0; i < layout.items.length; i++) {
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(startX + 12, y + fontSize / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px "Malgun Gothic"';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), startX + 12, y + fontSize / 2 + 5);
      ctx.fillStyle = textColor;
      ctx.font = 'bold ' + fontSize + 'px "Malgun Gothic", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(layout.items[i].label, startX + 40, y + fontSize);
      ctx.fillStyle = textColor + 'bb';
      ctx.font = (fontSize * 0.85) + 'px "Malgun Gothic", sans-serif';
      ctx.fillText(layout.items[i].value, startX + 40, y + fontSize * 2.2);
      y += fontSize * 3.5;
    }
  }

  return canvas;
}
