
const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const fs = require('fs');
// === FONT MAP (inline) ===
const FONT_DIR_PATH = 'C:/Windows/Fonts';
const FONT_MAP = {
  'Malgun Gothic':'malgun.ttf','맑은 고딕':'malgun.ttf',
  'NanumGothic':'NanumGothic.ttf','나눔고딕':'NanumGothic.ttf',
  'Arial':'arial.ttf','Times New Roman':'times.ttf',
  'Courier New':'cour.ttf','Georgia':'georgia.ttf',
  'Verdana':'verdana.ttf','Impact':'impact.ttf',
  'Consolas':'consola.ttf','Segoe UI':'segoeui.ttf',
  'Comic Sans MS':'comic.ttf','Calibri':'calibri.ttf',
  'sans-serif':'malgun.ttf','serif':'batang.ttc',
  'monospace':'consola.ttf','cursive':'comic.ttf'
};
const BOLD_MAP = {
  'malgun.ttf':'malgunbd.ttf','arial.ttf':'arialbd.ttf',
  'times.ttf':'timesbd.ttf','consola.ttf':'consolab.ttf'
};
function resolveFontPath(cssFontFamily, bold) {
  if (!cssFontFamily) cssFontFamily = 'sans-serif';
  const families = cssFontFamily.split(',').map(f => f.trim().replace(/^['"]|['"]$/g, ''));
  let ttf = null;
  for (const fam of families) {
    if (FONT_MAP[fam]) { ttf = FONT_MAP[fam]; break; }
    const lo = fam.toLowerCase();
    for (const [k,v] of Object.entries(FONT_MAP)) {
      if (k.toLowerCase() === lo) { ttf = v; break; }
    }
    if (ttf) break;
  }
  if (!ttf) ttf = 'malgun.ttf';
  if (bold && BOLD_MAP[ttf]) {
    const bp = path.join(FONT_DIR_PATH, BOLD_MAP[ttf]);
    if (fs.existsSync(bp)) ttf = BOLD_MAP[ttf];
  }
  const full = path.join(FONT_DIR_PATH, ttf).replace(/\\/g, '/');
  if (!fs.existsSync(full)) return path.join(FONT_DIR_PATH, 'malgun.ttf').replace(/\\/g, '/');
  return full;
}
// === END FONT MAP ===

const path = require('path');
const multer = require('multer');

function envelopeToVolumeFilter(envelope, durationSec) {
  if (!envelope || envelope.length < 2) return null;
  const sorted = [...envelope].sort((a, b) => a.position - b.position);
  const parts = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const t0 = (a.position * durationSec).toFixed(3);
    const t1 = (b.position * durationSec).toFixed(3);
    const v0 = (a.volume / 100).toFixed(3);
    const dt = (b.position - a.position) * durationSec;
    if (dt <= 0) continue;
    const slope = ((b.volume - a.volume) / 100 / dt).toFixed(6);
    parts.push('if(between(t,' + t0 + ',' + t1 + '),' + v0 + '+' + slope + '*(t-' + t0 + '))');
  }
  if (parts.length === 0) return null;
  return "volume='" + parts.join('+') + "':eval=frame";
}

function getClipRect(clip, pw, ph, ow, oh) {
  const sx = ow / pw, sy = oh / ph;
  const cx = clip.x || 0, cy = clip.y || 0;
  const cw = clip.clipWidth || pw, ch = clip.clipHeight || ph;
  const isDefault = cx === 0 && cy === 0 && (cw === pw || cw === 1920) && (ch === ph || ch === 1080);
  if (isDefault && (clip.type === 'video' || clip.type === 'image')) {
    return { x: 0, y: 0, w: ow, h: oh, fullscreen: true };
  }
  return { x: Math.round(cx * sx), y: Math.round(cy * sy), w: Math.round(cw * sx), h: Math.round(ch * sy), fullscreen: false };
}

function getTrackZOrder(trackId, tracks) {
  if (!tracks || !Array.isArray(tracks)) {
    const num = parseInt((trackId || '').replace(/\D/g, '') || '0');
    return num;
  }
  const pri = { text: 3, video: 2, image: 2, audio: 1 };
  const sorted = [...tracks].sort((a, b) => {
    return (pri[a.type] || 0) - (pri[b.type] || 0) || (a.order || 0) - (b.order || 0);
  });
  const idx = sorted.findIndex(t => t.id === trackId);
  return idx >= 0 ? idx : 0;
}

function escapeDrawText(text) {
  // For textfile approach - minimal escaping
  return text;
}

function writeTextFile(text, clipId) {
  const filePath = path.join(TEMP_DIR, 'text_' + clipId + '.txt');
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
}

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '50mb' }));

const FFMPEG = 'E:\\ffmpeg\\bin\\ffmpeg.exe';
const FONT_DIR = 'C:/Windows/Fonts';
const DEFAULT_FONT = FONT_DIR + '/malgun.ttf';  // 맑은 고딕 (Korean support)
const OUTPUT_DIR = path.join('E:\\2026\\flowcut', 'output');
const MEDIA_DIR = path.join('E:\\2026\\flowcut', 'media_cache');
const TEMP_DIR = path.join('E:\\2026\\flowcut', 'temp');

[OUTPUT_DIR, MEDIA_DIR, TEMP_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination: MEDIA_DIR,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'No file' });
  console.log('  Upload: ' + req.file.originalname + ' -> ' + req.file.path);
  res.json({ success: true, localPath: req.file.path, servePath: '/media/' + req.file.filename, fileName: req.file.filename, originalName: req.file.originalname, size: req.file.size });
});

app.use('/media', express.static(MEDIA_DIR));

let progressClients = [];
app.get('/api/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"status":"connected"}\n\n');
  progressClients.push(res);
  req.on('close', () => { progressClients = progressClients.filter(c => c !== res); });
});

function sendProgress(data) {
  progressClients.forEach(c => c.write('data: ' + JSON.stringify(data) + '\n\n'));
}

app.get('/api/health', (req, res) => { res.json({ ok: true, ffmpeg: FFMPEG, output: OUTPUT_DIR }); });
app.post('/api/export', async (req, res) => {
  const {
    inputFiles, projectWidth, projectHeight, fps, tracks,
    format = 'mp4', quality = 'medium',
    outputWidth, outputHeight,
    fileName = 'flowcut_export',
    includeAudio = true,
  } = req.body;

  const ow = outputWidth || projectWidth;
  const oh = outputHeight || projectHeight;
  const crf = { original: 16, high: 18, medium: 23, low: 28 }[quality] || 23;
  const ext = format === 'gif' ? 'gif' : format === 'webm' ? 'webm' : 'mp4';
  const outputPath = path.join(OUTPUT_DIR, fileName + '_' + Date.now() + '.' + ext);

  sendProgress({ status: 'starting', message: 'Export starting...' });

  try {
    // All visual clips (video + image), sorted by z-order then startFrame
    const visualClips = inputFiles
      .filter(f => (f.type === 'video' || f.type === 'image') && f.localPath && fs.existsSync(f.localPath))
      .sort((a, b) => {
        const aRect = getClipRect(a, projectWidth, projectHeight, ow, oh);
        const bRect = getClipRect(b, projectWidth, projectHeight, ow, oh);
        if (aRect.fullscreen && !bRect.fullscreen) return -1;
        if (!aRect.fullscreen && bRect.fullscreen) return 1;
        const az = getTrackZOrder(a.trackId, tracks);
        const bz = getTrackZOrder(b.trackId, tracks);
        if (az !== bz) return az - bz;
        return a.startFrame - b.startFrame;
      });

    // Text clips, sorted same way
    const textClips = inputFiles
      .filter(f => f.type === 'text')
      .sort((a, b) => {
        const az = getTrackZOrder(a.trackId, tracks);
        const bz = getTrackZOrder(b.trackId, tracks);
        if (az !== bz) return az - bz;
        return a.startFrame - b.startFrame;
      });

    // Audio clips
    const audioClips = inputFiles
      .filter(f => (f.type === 'audio' || f.type === 'video') && !f.muted && f.localPath && fs.existsSync(f.localPath))
      .sort((a, b) => a.startFrame - b.startFrame);

    if (visualClips.length === 0 && textClips.length === 0 && audioClips.length === 0) {
      sendProgress({ status: 'error', message: 'No clips to export' });
      return res.json({ success: false, error: 'No clips to export.' });
    }

    const maxFrame = inputFiles.reduce((mx, c) => Math.max(mx, c.startFrame + c.durationFrames), 0);
    const totalDurSec = (maxFrame / fps).toFixed(3);

    const args = ['-y', '-hide_banner'];
    const filterParts = [];
    let inputIdx = 0;
    const inputMap = new Map();

    // Input 0: black background
    args.push('-f', 'lavfi', '-i', 'color=c=black:s=' + ow + 'x' + oh + ':d=' + totalDurSec + ':r=' + fps);
    const baseIdx = inputIdx++;

    // Add visual clip inputs
    for (const clip of visualClips) {
      if (clip.type === 'image') {
        args.push('-loop', '1', '-t', (clip.durationFrames / fps).toFixed(3), '-i', clip.localPath);
      } else {
        args.push('-i', clip.localPath);
      }
      inputMap.set(clip.clipId + '_v', inputIdx);
      inputIdx++;
    }

    // Add audio-only inputs
    for (const clip of audioClips) {
      if (!inputMap.has(clip.clipId + '_v')) {
        args.push('-i', clip.localPath);
        inputMap.set(clip.clipId + '_a', inputIdx);
        inputIdx++;
      }
    }

    // --- VIDEO OVERLAY CHAIN ---
    let lastVideo = '[' + baseIdx + ':v]';
    let overlayCount = 0;

    for (const clip of visualClips) {
      const idx = inputMap.get(clip.clipId + '_v');
      const startSec = (clip.startFrame / fps).toFixed(3);
      const endSec = ((clip.startFrame + clip.durationFrames) / fps).toFixed(3);
      const rect = getClipRect(clip, projectWidth, projectHeight, ow, oh);

      const scaledLabel = 'sc' + overlayCount;
      let sf = '[' + idx + ':v]';
      if (rect.fullscreen) {
        sf += 'scale=' + ow + ':' + oh + ':flags=lanczos:force_original_aspect_ratio=decrease,pad=' + ow + ':' + oh + ':(ow-iw)/2:(oh-ih)/2:black';
      } else {
        sf += 'scale=' + rect.w + ':' + rect.h + ':flags=lanczos';
      }
      if (clip.type !== 'image' && clip.speed && clip.speed !== 1) {
        sf += ',setpts=' + (1/clip.speed).toFixed(4) + '*PTS';
      }
      // Opacity
      if (clip.opacity !== undefined && clip.opacity < 100) {
        const alpha = (clip.opacity / 100).toFixed(2);
        sf += ',format=rgba,colorchannelmixer=aa=' + alpha;
      }
      sf += '[' + scaledLabel + ']';
      filterParts.push(sf);

      const ovLabel = 'ov' + overlayCount;
      const ovX = rect.fullscreen ? 0 : rect.x;
      const ovY = rect.fullscreen ? 0 : rect.y;
      const SQ = String.fromCharCode(39);
      const overlayFilter = lastVideo + '[' + scaledLabel + ']overlay=' + ovX + ':' + ovY + ':enable=' + SQ + 'between(t,' + startSec + ',' + endSec + ')' + SQ + '[' + ovLabel + ']';
      filterParts.push(overlayFilter);

      lastVideo = '[' + ovLabel + ']';
      overlayCount++;
    }

    // --- TEXT OVERLAY (drawtext via textfile) ---
    for (const clip of textClips) {
      // === Pre-rendered text image (Canvas unified renderer) ===
      if (clip.renderedImagePath && fs.existsSync(clip.renderedImagePath)) {
        const startSec2 = (clip.startFrame / fps).toFixed(3);
        const endSec2 = ((clip.startFrame + clip.durationFrames) / fps).toFixed(3);
        console.log('[TEXT-IMG] Using pre-rendered PNG:', clip.renderedImagePath);
        
        const oW = ow || projectWidth;
        const oH = oh || projectHeight;
        const scX = oW / projectWidth;
        const scY = oH / projectHeight;
        const cw = Math.round((clip.clipWidth || clip.width || 800) * scX);
        const ch = Math.round((clip.clipHeight || clip.height || 200) * scY);
        const cx = Math.round((clip.x || 0) * scX);
        const cy = Math.round((clip.y || 0) * scY);
        
        // Add image input
        ffmpegArgs.push('-loop', '1', '-t', String(endSec2 - startSec2), '-i', clip.renderedImagePath);
        const imgInputIdx = inputIndex++;
        
        const tiLabel = 'ti' + overlayCount;
        const toLabel = 'to' + overlayCount;
        const lastLabel = overlayCount === 0 ? baseLabel : 'v' + (overlayCount - 1);
        
        filterParts.push('[' + imgInputIdx + ':v]scale=' + cw + ':' + ch + ',format=rgba[' + tiLabel + ']');
        filterParts.push('[' + lastLabel + '][' + tiLabel + "]overlay=" + cx + ":" + cy + ":enable='between(t," + startSec2 + "," + endSec2 + ")'[" + toLabel + "]");
        overlayCount++;
        continue; // skip drawtext for this clip
      }

      const startSec = (clip.startFrame / fps).toFixed(3);
      const endSec = ((clip.startFrame + clip.durationFrames) / fps).toFixed(3);

      const textContent = clip.text || clip.name || 'Text';
      const textFilePath = path.join(TEMP_DIR, 'text_' + clip.clipId + '.txt');
      fs.writeFileSync(textFilePath, textContent, 'utf8');

      const sx = ow / projectWidth, sy = oh / projectHeight;
      const tx = Math.round((clip.x || 0) * sx);
      const ty = Math.round((clip.y || 0) * sy);
      const clipW = Math.round((clip.clipWidth || 800) * sx);
      const clipH = Math.round((clip.clipHeight || 200) * sy);
      const fontSize = Math.round((clip.fontSize || 48) * sy);

      // Font resolution
      const isBold = clip.fontWeight === 'bold' || clip.fontWeight === '700';
      const fontPath = resolveFontPath(clip.fontFamily || 'sans-serif', isBold).replace(/:/g, '\\\\:');

      // Font color
      let fontColor = (clip.fontColor || '#ffffff').replace('#', '0x');

      // Build drawtext parts
      const dtParts = [];
      dtParts.push('fontfile=' + fontPath);
      const escapedPath = textFilePath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
      dtParts.push('textfile=' + escapedPath);
      dtParts.push('fontsize=' + fontSize);
      dtParts.push('fontcolor=' + fontColor);

      // X position with alignment
      const align = clip.textAlign || 'center';
      if (align === 'center' && clipW > 0) {
        dtParts.push('x=' + Math.round(tx + clipW/2) + '-text_w/2');
      } else if (align === 'right' && clipW > 0) {
        dtParts.push('x=' + Math.round(tx + clipW) + '-text_w');
      } else {
        dtParts.push('x=' + tx);
      }
      // Y: vertically center text within clip box
      if (clipH > 0) {
        dtParts.push('y=' + Math.round(ty + clipH/2) + '-text_h/2');
      } else {
        // Y: vertically center text within clip box
      if (clipH > 0) {
        dtParts.push('y=' + Math.round(ty + clipH/2) + '-text_h/2');
      } else {
        dtParts.push('y=' + ty);
      }
      }

      // Background box
      const bgOpacity = (clip.textBgOpacity || 0) / 100;
      if (bgOpacity > 0 && clip.textBgColor) {
        let bgHex = (clip.textBgColor || '#000000').replace('#', '0x');
        dtParts.push('box=1');
        dtParts.push('boxcolor=' + bgHex + '@' + bgOpacity.toFixed(2));
        dtParts.push('boxborderw=' + Math.max(6, Math.round(fontSize * 0.15)));
      }

      // Text outline (border)
      if (clip.borderWidth && clip.borderWidth > 0) {
        let bCol = (clip.borderColor || '#000000').replace('#', '0x');
        dtParts.push('borderw=' + Math.round(clip.borderWidth * sy));
        dtParts.push('bordercolor=' + bCol);
      }

      // Shadow
      if ((clip.shadowX && clip.shadowX !== 0) || (clip.shadowY && clip.shadowY !== 0)) {
        let sCol = (clip.shadowColor || '#000000').replace('#', '0x');
        dtParts.push('shadowcolor=' + sCol + '@0.7');
        dtParts.push('shadowx=' + Math.round((clip.shadowX || 0) * sx));
        dtParts.push('shadowy=' + Math.round((clip.shadowY || 2) * sy));
      }

      // Line spacing
      if (clip.lineHeight && clip.lineHeight !== 1.2) {
        dtParts.push('line_spacing=' + Math.round((clip.lineHeight - 1.0) * fontSize));
      }

      // Opacity (alpha)
      if (clip.opacity !== undefined && clip.opacity < 100) {
        dtParts.push('alpha=' + (clip.opacity / 100).toFixed(2));
      }

      // Enable time range
      dtParts.push("enable='between(t," + startSec + "," + endSec + ")'");

      const dtLabel = 'dt' + overlayCount;
      const dtFilter = lastVideo + 'drawtext=' + dtParts.join(':') + '[' + dtLabel + ']';
      filterParts.push(dtFilter);

      console.log('  [TEXT] "' + textContent.substring(0,30) + '" pos=(' + tx + ',' + ty + ') clipSize=' + clipW + 'x' + clipH + ' font=' + fontSize + 'px bg=' + (bgOpacity > 0 ? 'yes' : 'no') + ' border=' + ((clip.borderWidth||0) > 0 ? 'yes' : 'no'));
      console.log('  [TEXT] "' + textContent.substring(0,30) + '" pos=(' + tx + ',' + ty + ') clipSize=' + clipW + 'x' + clipH + ' font=' + fontSize + 'px bg=' + (bgOpacity > 0 ? 'yes' : 'no') + ' border=' + ((clip.borderWidth||0) > 0 ? 'yes' : 'no'));
      lastVideo = '[' + dtLabel + ']';
      overlayCount++;
    }

    // --- AUDIO MIX ---
    let audioLabel = '';
    const audioInputs = [];

    if (includeAudio && audioClips.length > 0) {
      for (let i = 0; i < audioClips.length; i++) {
        const clip = audioClips[i];
        const aIdx = inputMap.get(clip.clipId + '_v') || inputMap.get(clip.clipId + '_a');
        if (aIdx === undefined) continue;
        const durSec = (clip.durationFrames / fps).toFixed(3);
        const delayMs = Math.round(clip.startFrame / fps * 1000);
        const aLabel = 'a' + i;

        const afParts = [];
        const envFilter = clip.volumeEnvelope ? envelopeToVolumeFilter(clip.volumeEnvelope, parseFloat(durSec)) : null;
        if (envFilter) afParts.push(envFilter);
        else if (clip.volume !== undefined && clip.volume !== 100) afParts.push('volume=' + (clip.volume/100).toFixed(2));
        if (clip.speed && clip.speed !== 1) afParts.push('atempo=' + Math.max(0.5, Math.min(2, clip.speed)));
        if (clip.fadeIn > 0) afParts.push('afade=t=in:st=0:d=' + (clip.fadeIn/fps).toFixed(2));
        if (clip.fadeOut > 0) {
          const fadeStart = Math.max(0, parseFloat(durSec) - clip.fadeOut/fps);
          afParts.push('afade=t=out:st=' + fadeStart.toFixed(2) + ':d=' + (clip.fadeOut/fps).toFixed(2));
        }
        afParts.push('adelay=' + delayMs + '|' + delayMs);
        afParts.push('apad=whole_dur=' + totalDurSec);

        filterParts.push('[' + aIdx + ':a]' + afParts.join(',') + '[' + aLabel + ']');
        audioInputs.push('[' + aLabel + ']');
      }

      if (audioInputs.length === 1) {
        audioLabel = audioInputs[0].replace('[', '').replace(']', '');
      } else if (audioInputs.length > 1) {
        audioLabel = 'amixed';
        filterParts.push(audioInputs.join('') + 'amix=inputs=' + audioInputs.length + ':duration=longest:normalize=0[' + audioLabel + ']');
      }
    }

    // --- ASSEMBLE FFmpeg command ---
    const complexFilter = filterParts.join(';');
    if (complexFilter) {
      // Write filter to file to avoid shell quoting issues
      const filterFile = path.join(TEMP_DIR, 'filter_' + Date.now() + '.txt');
      fs.writeFileSync(filterFile, complexFilter, 'utf8');
      console.log('  Filter script: ' + filterFile);
      console.log('  Filter content: ' + complexFilter.substring(0, 500));
      args.push('-filter_complex_script', filterFile);
      args.push('-map', lastVideo);
      if (audioLabel) args.push('-map', '[' + audioLabel + ']');
      else args.push('-an');
    }

    args.push('-t', totalDurSec);

    if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
      if (audioLabel) args.push('-c:a', 'aac', '-b:a', '192k');
    } else if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0');
      if (audioLabel) args.push('-c:a', 'libopus', '-b:a', '128k');
    } else if (format === 'gif') {
      args.push('-an');
    }

    args.push(outputPath);

    console.log('  FFmpeg cmd (' + args.length + ' args):');
    console.log('  ' + args.join(' ').substring(0, 500));
    sendProgress({ status: 'encoding', progress: 5, message: 'Encoding ' + ow + 'x' + oh + ' ' + format.toUpperCase() + ' (' + visualClips.length + ' visual + ' + textClips.length + ' text)...' });

    const totalFrames = Math.round(parseFloat(totalDurSec) * fps);
    const ffProcess = spawn(FFMPEG, args, { env: { ...process.env, FONTCONFIG_PATH: '', FONTCONFIG_FILE: '' } });
    let stderrLog = '';
    let lastPct = 0;

    ffProcess.stderr.on('data', (data) => {
      const line = data.toString();
      stderrLog += line;
      const m = line.match(/frame=\s*(\d+)/);
      if (m) {
        const frame = parseInt(m[1]);
        const pct = totalFrames > 0 ? Math.min(99, Math.round((frame / totalFrames) * 100)) : 50;
        if (pct > lastPct) { lastPct = pct; sendProgress({ status: 'encoding', progress: pct, message: 'Encoding: ' + pct + '%' }); }
      }
    });

    await new Promise((resolve, reject) => {
      ffProcess.on('close', (code) => {
        if (code === 0) resolve();
        else { console.log('  FFmpeg stderr:', stderrLog.slice(-1000)); reject(new Error('FFmpeg exit code ' + code)); }
      });
      ffProcess.on('error', reject);
    });

    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / 1048576).toFixed(1);
    sendProgress({ status: 'complete', progress: 100, message: 'Complete! ' + sizeMB + 'MB', filePath: outputPath });
    console.log('  Done: ' + outputPath + ' (' + sizeMB + 'MB)');
    return res.json({ success: true, filePath: outputPath, sizeMB: parseFloat(sizeMB), resolution: ow + 'x' + oh });

  } catch (err) {
    console.log('  Export error:', err.message);
    sendProgress({ status: 'error', message: err.message });
    return res.json({ success: false, error: err.message });
  }
});

app.use('/output', express.static(OUTPUT_DIR));
app.get('/api/open-output', (req, res) => { exec('explorer "' + OUTPUT_DIR + '"'); res.json({ success: true }); });

const PORT = 3456;
app.listen(PORT, () => {
  console.log('');
  console.log('  FlowCut Export Server v3');
  console.log('  http://localhost:' + PORT);
  console.log('  FFmpeg: ' + FFMPEG);
  console.log('  Output: ' + OUTPUT_DIR);
  console.log('');
});
