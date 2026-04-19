import type { Clip } from '../types/clip';

/**
 * Unified Text Renderer — Canvas 2D
 * 
 * This is the SINGLE source of truth for text rendering.
 * Used by BOTH preview (PreviewCanvas) and export (frame capture).
 * 
 * Whatever this function draws on the canvas IS the final output.
 * No CSS. No FFmpeg drawtext. One renderer. Pixel-perfect match.
 */

function containsKorean(text: string): boolean {
  return /[\uAC00-\uD7AF\u3131-\u3163\u318E]/.test(text);
}

function ensureKoreanFont(fontFamily: string, text: string): string {
  if (!containsKorean(text)) return fontFamily;
  // If the font doesn't support Korean, prepend Malgun Gothic
  const koreanUnsafe = ['Impact', 'Arial Black', 'Courier New', 'Georgia', 'Times New Roman', 'Comic Sans MS'];
  const base = fontFamily.split(',')[0].trim().replace(/['"]/g, '');
  if (koreanUnsafe.some(f => f.toLowerCase() === base.toLowerCase())) {
    return "'Malgun Gothic', " + fontFamily;
  }
  // If it already has a Korean-safe font, keep it
  return fontFamily;
}


// ═══ Animation Engine ═══

interface AnimContext {
  type: string;
  speed: number;
  amplitude: number;
  charDelay: number;
  time: number;  // normalized 0~1 within clip duration
  totalChars: number;
}

function easeOutBounce(t: number): number {
  if (t < 1/2.75) return 7.5625*t*t;
  if (t < 2/2.75) { t -= 1.5/2.75; return 7.5625*t*t + 0.75; }
  if (t < 2.5/2.75) { t -= 2.25/2.75; return 7.5625*t*t + 0.9375; }
  t -= 2.625/2.75; return 7.5625*t*t + 0.984375;
}

function getCharAnimation(charIdx: number, anim: AnimContext): { dx: number; dy: number; scale: number; alpha: number; rotation: number } {
  const { type, speed, amplitude, charDelay, time, totalChars } = anim;
  const charTime = Math.max(0, time * speed - (charIdx * charDelay / 1000));
  const result = { dx: 0, dy: 0, scale: 1, alpha: 1, rotation: 0 };

  switch (type) {
    case 'bounce': {
      const cycle = (charTime * 3) % 1;
      result.dy = -amplitude * easeOutBounce(1 - Math.abs(2 * cycle - 1));
      break;
    }
    case 'wave': {
      result.dy = Math.sin(charTime * Math.PI * 4 + charIdx * 0.5) * amplitude;
      break;
    }
    case 'slide-left': {
      const progress = Math.min(1, charTime * 2);
      const ease = 1 - Math.pow(1 - progress, 3);
      result.dx = (1 - ease) * 200;
      result.alpha = ease;
      break;
    }
    case 'slide-right': {
      const progress = Math.min(1, charTime * 2);
      const ease = 1 - Math.pow(1 - progress, 3);
      result.dx = -(1 - ease) * 200;
      result.alpha = ease;
      break;
    }
    case 'slide-up': {
      const progress = Math.min(1, charTime * 2);
      const ease = 1 - Math.pow(1 - progress, 3);
      result.dy = (1 - ease) * 100;
      result.alpha = ease;
      break;
    }
    case 'typewriter': {
      const charAppearTime = charIdx * (charDelay / 1000);
      result.alpha = time * speed > charAppearTime ? 1 : 0;
      break;
    }
    case 'glow-pulse': {
      // All chars glow together
      const pulse = 0.6 + 0.4 * Math.sin(charTime * Math.PI * 3);
      result.alpha = pulse;
      break;
    }
    case 'fade-in-char': {
      const progress = Math.min(1, charTime * 3);
      result.alpha = progress;
      result.scale = 0.5 + 0.5 * progress;
      break;
    }
  }
  return result;
}

function renderAnimatedText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  lines: string[], clipX: number, clipY: number, clipW: number, clipH: number,
  fontSize: number, lineHeight: number, textAlign: CanvasTextAlign,
  fontColor: string, anim: AnimContext
): void {
  const totalTextHeight = lines.length * lineHeight;
  const textStartY = clipY + (clipH - totalTextHeight) / 2;
  let globalCharIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const ly = textStartY + i * lineHeight;
    const line = lines[i];

    // Measure each character for positioning
    let lineWidth = 0;
    const charWidths: number[] = [];
    for (const ch of line) {
      const w = ctx.measureText(ch).width;
      charWidths.push(w);
      lineWidth += w;
    }

    // Calculate start X based on alignment
    let startX: number;
    if (textAlign === 'center') startX = clipX + (clipW - lineWidth) / 2;
    else if (textAlign === 'right') startX = clipX + clipW - lineWidth - 8;
    else startX = clipX + 8;

    let curX = startX;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const aResult = getCharAnimation(globalCharIdx, anim);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, aResult.alpha * (ctx.globalAlpha || 1)));

      const cx = curX + charWidths[j] / 2 + aResult.dx;
      const cy = ly + fontSize / 2 + aResult.dy;

      if (aResult.scale !== 1 || aResult.rotation !== 0) {
        ctx.translate(cx, cy);
        if (aResult.rotation) ctx.rotate(aResult.rotation);
        if (aResult.scale !== 1) ctx.scale(aResult.scale, aResult.scale);
        ctx.fillText(ch, -charWidths[j] / 2, -fontSize / 2);
      } else {
        ctx.fillText(ch, curX + aResult.dx, ly + aResult.dy);
      }

      ctx.restore();
      curX += charWidths[j];
      globalCharIdx++;
    }
  }
}

export function renderTextClip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  clip: Clip,
  canvasWidth: number,
  canvasHeight: number
): void {
  const text = clip.text || clip.name || '';
  if (!text) return;

  const fontSize = clip.fontSize || 48;
  const fontFamily = ensureKoreanFont(clip.fontFamily || 'Malgun Gothic, sans-serif', text);
  const fontWeight = clip.fontWeight || 'normal';
  const fontStyle = clip.fontStyle || 'normal';
  const fontColor = clip.fontColor || '#ffffff';
  const textAlign = (clip.textAlign || 'center') as CanvasTextAlign;
  const lineHeight = (clip.lineHeight || 1.3) * fontSize;

  // Clip box position and size
  const clipX = clip.x || 0;
  const clipY = clip.y || 0;
  const clipW = clip.width || 800;
  const clipH = clip.height || 200;

  ctx.save();

  // Set font
  ctx.font = fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px ' + fontFamily;
  ctx.textBaseline = 'top';

  // Word wrap within clip box
  const lines = wrapText(ctx, text, clipW - 16);
  const totalTextHeight = lines.length * lineHeight;

  // Vertical center within clip box
  const textStartY = clipY + (clipH - totalTextHeight) / 2;

  // Background box
  const bgOpacity = (clip.textBgOpacity || 0) / 100;
  if (bgOpacity > 0) {
    const bgColor = clip.textBgColor || '#000000';
    const padding = Math.max(8, fontSize * 0.2);

    // Calculate actual text bounds for background
    let maxLineWidth = 0;
    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxLineWidth) maxLineWidth = m.width;
    }

    let bgX: number, bgW: number;
    if (textAlign === 'center') {
      const centerX = clipX + clipW / 2;
      bgX = centerX - maxLineWidth / 2 - padding;
      bgW = maxLineWidth + padding * 2;
    } else if (textAlign === 'right') {
      bgX = clipX + clipW - maxLineWidth - padding * 2;
      bgW = maxLineWidth + padding * 2;
    } else {
      bgX = clipX;
      bgW = maxLineWidth + padding * 2;
    }
    const bgY = textStartY - padding;
    const bgH = totalTextHeight + padding * 2;

    ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
    ctx.beginPath();
    roundRect(ctx, bgX, bgY, bgW, bgH, 4);
    ctx.fill();

    // Border on background box
    const borderWidth = clip.borderWidth || 0;
    if (borderWidth > 0) {
      ctx.strokeStyle = clip.borderColor || '#000000';
      ctx.lineWidth = borderWidth;
      ctx.beginPath();
      roundRect(ctx, bgX, bgY, bgW, bgH, 4);
      ctx.stroke();
    }
  } else {
    // Border without background — draw around text area
    const borderWidth = clip.borderWidth || 0;
    if (borderWidth > 0) {
      ctx.strokeStyle = clip.borderColor || '#000000';
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(clipX, clipY, clipW, clipH);
    }
  }

  // Shadow
  const shadowX = clip.shadowX || 0;
  const shadowY = clip.shadowY || 0;
  if (shadowX !== 0 || shadowY !== 0) {
    ctx.shadowColor = clip.shadowColor || 'rgba(0,0,0,0.7)';
    ctx.shadowOffsetX = shadowX;
    ctx.shadowOffsetY = shadowY;
    ctx.shadowBlur = 4;
  }

  // Text stroke (outline) — draw first, behind fill
  const textBorderWidth = clip.borderWidth || 0;
  if (textBorderWidth > 0 && bgOpacity <= 0) {
    ctx.strokeStyle = clip.borderColor || '#000000';
    ctx.lineWidth = textBorderWidth * 2;
    ctx.lineJoin = 'round';
    for (let i = 0; i < lines.length; i++) {
      const ly = textStartY + i * lineHeight;
      const lx = getLineX(clipX, clipW, textAlign);
      ctx.textAlign = textAlign;
      ctx.strokeText(lines[i], lx, ly);
    }
  }

  // Fill text (with optional animation)
  ctx.fillStyle = fontColor;
  const animType = (clip as any).animationType || 'none';
  const animTime = (clip as any)._animTime ?? 0.5; // 0~1, set by preview/export

  if (animType && animType !== 'none') {
    ctx.textAlign = 'left'; // Animation renders char-by-char
    ctx.textBaseline = 'top';
    const totalChars = lines.reduce((sum, l) => sum + l.length, 0);
    const anim: AnimContext = {
      type: animType,
      speed: (clip as any).animationSpeed || 1,
      amplitude: (clip as any).animationAmplitude || 10,
      charDelay: (clip as any).animationDelay || 50,
      time: animTime,
      totalChars,
    };
    renderAnimatedText(ctx, lines, clipX, clipY, clipW, clipH, fontSize, lineHeight, textAlign, fontColor, anim);
  } else {
    ctx.textAlign = textAlign;
    for (let i = 0; i < lines.length; i++) {
      const ly = textStartY + i * lineHeight;
      const lx = getLineX(clipX, clipW, textAlign);
      ctx.fillText(lines[i], lx, ly);
    }
  }

  ctx.restore();
}

function getLineX(clipX: number, clipW: number, align: CanvasTextAlign): number {
  if (align === 'center') return clipX + clipW / 2;
  if (align === 'right') return clipX + clipW - 8;
  return clipX + 8;
}

function wrapText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split('');  // Character-level for CJK support
    let currentLine = '';

    for (const char of words) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function roundRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Render a full frame (all visible clips) to a Canvas.
 * Used for export: capture each frame as image.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  clips: Clip[],
  canvasWidth: number,
  canvasHeight: number,
  currentFrame: number,
  fps: number
): void {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Render text clips (video/image clips handled separately via FFmpeg)
  const textClips = clips.filter(c =>
    c.type === 'text' &&
    c.visible !== false &&
    currentFrame >= c.startFrame &&
    currentFrame < c.startFrame + c.durationFrames
  );

  for (const clip of textClips) {
    // Apply opacity with fade
    const localFrame = currentFrame - clip.startFrame;
    const dur = clip.durationFrames;
    let opacity = (clip.opacity ?? 100) / 100;
    if (clip.fadeIn > 0 && localFrame < clip.fadeIn) {
      opacity *= localFrame / clip.fadeIn;
    }
    if (clip.fadeOut > 0 && localFrame > dur - clip.fadeOut) {
      opacity *= (dur - localFrame) / clip.fadeOut;
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    renderTextClip(ctx, clip, canvasWidth, canvasHeight);
    ctx.globalAlpha = 1;
  }
}
