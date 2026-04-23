const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// === PROJECT DEFAULTS (mirrors src/types/project.ts) ===
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;

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


// === Crossfade Transition Support (Phase 3.6) ===
function buildXfadeFilter(clipA, clipB, transitionType, transitionDur, fps) {
  // xfade types: fade, dissolve, wipeleft, wiperight, wipeup, wipedown, slideleft, slideright
  const typeMap = {
    'dissolve': 'dissolve',
    'fade': 'fade',
    'wipe': 'wipeleft',
    'wipe-left': 'wipeleft',
    'wipe-right': 'wiperight',
    'slide': 'slideleft',
    'slide-left': 'slideleft',
    'slide-right': 'slideright',
    'slide-up': 'wipeup',
    'slide-down': 'wipedown',
  };
  const xfType = typeMap[transitionType] || 'dissolve';
  const durSec = (transitionDur || 15) / fps;
  const offsetSec = ((clipA.startFrame + clipA.durationFrames) / fps) - durSec;
  return { type: xfType, duration: durSec, offset: Math.max(0, offsetSec) };
}
function getClipRect(clip, pw, ph, ow, oh) {
  const sx = ow / pw, sy = oh / ph;
  const cx = clip.x || 0, cy = clip.y || 0;
  const cw = clip.clipWidth || pw, ch = clip.clipHeight || ph;
  const isDefault = cx === 0 && cy === 0 && (cw === pw || cw === DEFAULT_WIDTH) && (ch === ph || ch === DEFAULT_HEIGHT);
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
const DEFAULT_FONT = FONT_DIR + '/malgun.ttf';
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

// =========================================================================
// EXPORT ENDPOINT (unchanged — just removed node-fetch references)
// =========================================================================
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
    const visualClips = inputFiles
      .filter(f => {
        if (!((f.type === 'video' || f.type === 'image') && f.localPath && fs.existsSync(f.localPath))) return false;
        // Convert animated WEBP to MP4 for FFmpeg compatibility
        if (f.localPath && f.localPath.toLowerCase().endsWith('.webp')) {
          try {
            const buf = fs.readFileSync(f.localPath).slice(0, 64);
            if (buf.toString('ascii').includes('ANIM')) {
              const mp4Path = f.localPath.replace(/\.webp$/i, '_converted.mp4');
              if (!fs.existsSync(mp4Path)) {
                console.log('[EXPORT] Converting animated WEBP to MP4:', f.localPath);
                try {
                  require('child_process').execSync(
                    '"' + FFMPEG + '" -y -c:v libwebp_anim -i "' + f.localPath + '" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "' + mp4Path + '"',
                    { timeout: 60000 }
                  );
                  console.log('[EXPORT] Converted:', mp4Path);
                } catch (convErr) {
                  console.log('[EXPORT] WEBP anim conversion failed, trying image2 demuxer...');
                  try {
                    require('child_process').execSync(
                      '"' + FFMPEG + '" -y -f image2 -framerate 16 -i "' + f.localPath + '" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "' + mp4Path + '"',
                      { timeout: 60000 }
                    );
                    console.log('[EXPORT] Converted via image2:', mp4Path);
                  } catch (convErr2) {
                    console.log('[EXPORT] All WEBP conversion failed:', convErr2.message, '- skipping');
                    return false;
                  }
                }
              }
              f.localPath = mp4Path;
              f.type = 'video';
            }
          } catch(e) {}
        }
        return true;
      })
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

    const textClips = inputFiles
      .filter(f => f.type === 'text')
      .sort((a, b) => {
        const az = getTrackZOrder(a.trackId, tracks);
        const bz = getTrackZOrder(b.trackId, tracks);
        if (az !== bz) return az - bz;
        return a.startFrame - b.startFrame;
      });

    const audioClips = inputFiles
      .filter(f => {
        if (!((f.type === 'audio' || f.type === 'video') && !f.muted && f.localPath && fs.existsSync(f.localPath))) return false;
        const ext = (f.localPath || '').toLowerCase();
        if (ext.endsWith('.webm') || ext.endsWith('.webp') || ext.endsWith('.gif')) {
          try {
            const probe = require('child_process').execSync('E:/ffmpeg/bin/ffprobe.exe -hide_banner -show_streams "' + f.localPath + '"', { encoding: 'utf8', timeout: 5000 });
            if (!probe.includes('codec_type=audio')) {
              console.log('[EXPORT] Skipping audio (no audio stream):', f.localPath);
              return false;
            }
          } catch(e) { return false; }
        }
        return true;
      })
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

    args.push('-f', 'lavfi', '-i', 'color=c=black:s=' + ow + 'x' + oh + ':d=' + totalDurSec + ':r=' + fps);
    const baseIdx = inputIdx++;

    for (const clip of visualClips) {
      if (clip.type === 'image') {
        const extLow = (clip.localPath || '').toLowerCase();
        const isVideo = extLow.endsWith('.mp4') || extLow.endsWith('.webm') || extLow.endsWith('.mov') || extLow.endsWith('.avi') || extLow.endsWith('.mkv');
        const isAnimated = extLow.endsWith('.webp') || extLow.endsWith('.gif');
        if (isVideo) {
          // MP4/video file misclassified as image — treat as video
          args.push('-i', clip.localPath);
          clip.type = 'video';
          console.log('[EXPORT] Video file (reclassified from image):', clip.localPath);
        } else if (isAnimated) {
          args.push('-i', clip.localPath);
          console.log('[EXPORT] Animated file (no loop):', clip.localPath);
        } else {
          args.push('-loop', '1', '-t', (clip.durationFrames / fps).toFixed(3), '-i', clip.localPath);
        }
      } else {
        if (clip.sourceStart && clip.sourceStart > 0) {
          args.push('-ss', String(clip.sourceStart));
        }
        args.push('-i', clip.localPath);
      }
      inputMap.set(clip.clipId + '_v', inputIdx);
      inputIdx++;
    }

    for (const clip of audioClips) {
      if (!inputMap.has(clip.clipId + '_v')) {
        args.push('-i', clip.localPath);
        inputMap.set(clip.clipId + '_a', inputIdx);
        inputIdx++;
      }
    }

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
        sf += 'scale=' + Math.round(ow*1.1) + ':' + Math.round(oh*1.1) + ':flags=lanczos:force_original_aspect_ratio=decrease,pad=' + Math.round(ow*1.1) + ':' + Math.round(oh*1.1) + ':(ow-iw)/2:(oh-ih)/2:black';
        // Ken Burns: subtle zoom out
        const kbDur = (clip.durationFrames / fps).toFixed(3);
        sf += ',zoompan=z=\'min(zoom+0.0005,1.1)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=' + Math.round(clip.durationFrames) + ':s=' + ow + 'x' + oh + ':fps=' + fps;
      } else {
        sf += 'scale=' + rect.w + ':' + rect.h + ':flags=lanczos';
      }
      if (clip.type !== 'image' && clip.speed && clip.speed !== 1) {
        sf += ',setpts=' + (1/clip.speed).toFixed(4) + '*PTS';
      }
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

      // === Cross-fade support: check transitionIn ===
      let overlayFilter;
      const trIn = clip.transitionIn;
      if (trIn && trIn.type === 'dissolve' && trIn.duration > 0) {
        const fadeDurSec = (trIn.duration / fps).toFixed(3);
        const fadeStartSec = startSec;
        const fadeEndSec = (parseFloat(startSec) + parseFloat(fadeDurSec)).toFixed(3);
        // Add fade-in alpha to the scaled input
        const fadeScLabel = 'fsc' + overlayCount;
        filterParts.push('[' + scaledLabel + ']format=yuva420p,fade=t=in:st=' + fadeStartSec + ':d=' + fadeDurSec + ':alpha=1[' + fadeScLabel + ']');
        overlayFilter = lastVideo + '[' + fadeScLabel + ']overlay=' + ovX + ':' + ovY + ':format=auto:enable=' + SQ + 'between(t,' + startSec + ',' + endSec + ')' + SQ + '[' + ovLabel + ']';
        console.log('[EXPORT] Cross-fade dissolve: ' + fadeDurSec + 's at t=' + startSec);
      } else {
        overlayFilter = lastVideo + '[' + scaledLabel + ']overlay=' + ovX + ':' + ovY + ':enable=' + SQ + 'between(t,' + startSec + ',' + endSec + ')' + SQ + '[' + ovLabel + ']';
      }
      filterParts.push(overlayFilter);

      lastVideo = '[' + ovLabel + ']';
      overlayCount++;
    }

    for (const clip of textClips) {
      if (clip.renderedImagePath && fs.existsSync(clip.renderedImagePath)) {
        const startSec2 = (clip.startFrame / fps).toFixed(3);
        const endSec2 = ((clip.startFrame + clip.durationFrames) / fps).toFixed(3);
        console.log('[TEXT-IMG] Using pre-rendered PNG:', clip.renderedImagePath);
        
        const scX = ow / projectWidth;
        const scY = oh / projectHeight;
        const cw = Math.round((clip.clipWidth || clip.width || 800) * scX);
        const ch = Math.round((clip.clipHeight || clip.height || 200) * scY);
        const cx = Math.round((clip.x || 0) * scX);
        const cy = Math.round((clip.y || 0) * scY);
        
        args.push('-loop', '1', '-t', String(endSec2 - startSec2), '-i', clip.renderedImagePath);
        const imgInputIdx = inputIdx++;
        
        const tiLabel = 'ti' + overlayCount;
        const toLabel = 'to' + overlayCount;
        
        filterParts.push('[' + imgInputIdx + ':v]scale=' + cw + ':' + ch + ',format=rgba[' + tiLabel + ']');
        filterParts.push(lastVideo + '[' + tiLabel + "]overlay=" + cx + ":" + cy + ":enable='between(t," + startSec2 + "," + endSec2 + ")'[" + toLabel + "]");
        lastVideo = '[' + toLabel + ']';
        overlayCount++;
        continue;
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

      const isBold = clip.fontWeight === 'bold' || clip.fontWeight === '700';
      const fontPath = resolveFontPath(clip.fontFamily || 'sans-serif', isBold).replace(/:/g, '\\\\:');

      let fontColor = (clip.fontColor || '#ffffff').replace('#', '0x');

      const dtParts = [];
      dtParts.push('fontfile=' + fontPath);
      const escapedPath = textFilePath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
      dtParts.push('textfile=' + escapedPath);
      dtParts.push('fontsize=' + fontSize);
      dtParts.push('fontcolor=' + fontColor);

      const align = clip.textAlign || 'center';
      if (align === 'center' && clipW > 0) {
        dtParts.push('x=' + Math.round(tx + clipW/2) + '-text_w/2');
      } else if (align === 'right' && clipW > 0) {
        dtParts.push('x=' + Math.round(tx + clipW) + '-text_w');
      } else {
        dtParts.push('x=' + tx);
      }
      if (clipH > 0) {
        dtParts.push('y=' + Math.round(ty + clipH/2) + '-text_h/2');
      }

      const bgOpacity = (clip.textBgOpacity || 0) / 100;
      if (bgOpacity > 0 && clip.textBgColor) {
        let bgHex = (clip.textBgColor || '#000000').replace('#', '0x');
        dtParts.push('box=1');
        dtParts.push('boxcolor=' + bgHex + '@' + bgOpacity.toFixed(2));
        dtParts.push('boxborderw=' + Math.max(6, Math.round(fontSize * 0.15)));
      }

      if (clip.borderWidth && clip.borderWidth > 0) {
        let bCol = (clip.borderColor || '#000000').replace('#', '0x');
        dtParts.push('borderw=' + Math.round(clip.borderWidth * sy));
        dtParts.push('bordercolor=' + bCol);
      }

      if ((clip.shadowX && clip.shadowX !== 0) || (clip.shadowY && clip.shadowY !== 0)) {
        let sCol = (clip.shadowColor || '#000000').replace('#', '0x');
        dtParts.push('shadowcolor=' + sCol + '@0.7');
        dtParts.push('shadowx=' + Math.round((clip.shadowX || 0) * sx));
        dtParts.push('shadowy=' + Math.round((clip.shadowY || 2) * sy));
      }

      if (clip.lineHeight && clip.lineHeight !== 1.2) {
        dtParts.push('line_spacing=' + Math.round((clip.lineHeight - 1.0) * fontSize));
      }

      if (clip.opacity !== undefined && clip.opacity < 100) {
        dtParts.push('alpha=' + (clip.opacity / 100).toFixed(2));
      }

      dtParts.push("enable='between(t," + startSec + "," + endSec + ")'");

      const dtLabel = 'dt' + overlayCount;
      const dtFilter = lastVideo + 'drawtext=' + dtParts.join(':') + '[' + dtLabel + ']';
      filterParts.push(dtFilter);

      console.log('  [TEXT] "' + textContent.substring(0,30) + '" pos=(' + tx + ',' + ty + ') clipSize=' + clipW + 'x' + clipH + ' font=' + fontSize + 'px');
      lastVideo = '[' + dtLabel + ']';
      overlayCount++;
    }

    // --- AUDIO MIX (with volume ducking) ---
    let audioLabel = '';
    const audioInputs = [];

    // Detect narration intervals for BGM ducking
    const narrationIntervals = [];
    if (includeAudio && audioClips.length > 0) {
      for (const nc of audioClips) {
        // Narration clips: trackId contains 'narr' or clip name contains 'narr' or 'tts'
        const ncTrack = (tracks || []).find(t => t.id === nc.trackId);
        const ncTrackName = (ncTrack && ncTrack.name) ? ncTrack.name.toLowerCase() : '';
        const isNarration = ncTrackName.includes('narr') || ncTrackName.includes('나레이션') || ncTrackName.includes('tts')
          || (nc.trackId && nc.trackId.toLowerCase().includes('narr'))
          || (nc.text && (nc.text.toLowerCase().includes('narr') || nc.text.toLowerCase().includes('tts')));
        if (isNarration) {
          const nStart = (nc.startFrame / fps);
          const nEnd = nStart + (nc.durationFrames / fps);
          narrationIntervals.push({ start: nStart, end: nEnd });
        }
      }
      if (narrationIntervals.length > 0) {
        console.log('[EXPORT] Volume ducking: ' + narrationIntervals.length + ' narration intervals detected');
        narrationIntervals.forEach(iv => console.log('  Narration: ' + iv.start.toFixed(2) + 's - ' + iv.end.toFixed(2) + 's'));
      }
    }

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
        // Volume ducking: if this is a BGM clip and narration exists, reduce volume during narration
        const bgmTrack = (tracks || []).find(t => t.id === clip.trackId);
        const bgmTrackName = (bgmTrack && bgmTrack.name) ? bgmTrack.name.toLowerCase() : '';
        const isBGM = bgmTrackName.includes('bgm') || bgmTrackName.includes('music') || bgmTrackName.includes('배경')
          || (clip.trackId && (clip.trackId.toLowerCase().includes('bgm') || clip.trackId.toLowerCase().includes('music')))
          || (clip.text && (clip.text.toLowerCase().includes('bgm') || clip.text.toLowerCase().includes('music')));
        if (isBGM && narrationIntervals.length > 0) {
          const clipStartSec = clip.startFrame / fps;
          const duckLevel = 0.15; // BGM volume during narration (15%)
          const duckFade = 0.3;   // fade duration in seconds
          for (const iv of narrationIntervals) {
            // Relative times within this audio clip
            const relStart = Math.max(0, iv.start - clipStartSec);
            const relEnd = iv.end - clipStartSec;
            if (relEnd > 0 && relStart < parseFloat(durSec)) {
              const safeStart = Math.max(0, relStart - duckFade).toFixed(3);
              const safeEnd = Math.min(parseFloat(durSec), relEnd + duckFade).toFixed(3);
              afParts.push("volume=enable='between(t," + safeStart + "," + safeEnd + ")':volume=" + duckLevel);
              console.log('[EXPORT] Duck BGM clip ' + i + ': ' + safeStart + 's-' + safeEnd + 's -> ' + (duckLevel*100) + '%');
            }
          }
        }
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

    const complexFilter = filterParts.join(';');
    if (complexFilter) {
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
    sendProgress({ status: 'encoding', progress: 5, message: 'Encoding ' + ow + 'x' + oh + ' ' + format.toUpperCase() + '...' });

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


// =========================================================================
// AI Bridge Endpoints — NOW USING NATIVE FETCH (Node.js 22+)
// =========================================================================
app.post('/api/ai/generate-text', async (req, res) => {
  const { prompt, model, language } = req.body;
  const ollamaUrl = 'http://localhost:11434';
  const ollamaModel = model || 'gemma4:e4b';
  
  const systemPrompt = [
    'You are a video text/subtitle generation assistant.',
    'Generate text and suggest a preset ID from:',
    'basic-white, basic-boxed, basic-outline, subtitle-classic, subtitle-news,',
    'subtitle-minimal, subtitle-karaoke, title-big, title-neon, title-gold,',
    'trending-highlight, trending-gradient-pop, trending-glow, trending-fire,',
    'aesthetic-handwrite, aesthetic-vintage, aesthetic-minimal-modern,',
    'lower-simple, lower-news, anim-bounce, anim-wave, anim-typewriter, anim-slide.',
    'Respond in JSON: {"text": "...", "suggestedPreset": "..."}',
    language ? 'Language: ' + language : 'Language: Korean',
  ].join('\n');

  try {
    const resp = await fetch(ollamaUrl + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, prompt, system: systemPrompt, stream: false, options: { temperature: 0.7, num_predict: 500 } }),
      });

    const data = await resp.json();
    const responseText = data.response || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json({ success: true, text: parsed.text, suggestedPreset: parsed.suggestedPreset || 'basic-white' });
    }
    return res.json({ success: true, text: responseText.trim(), suggestedPreset: 'basic-white' });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

app.get('/api/ai/health', async (req, res) => {
  try {
    const resp = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    const data = await resp.json();
    res.json({ ollama: resp.ok, models: data.models?.map(m => m.name) || [] });
  } catch (err) {
    res.json({ ollama: false, error: err.message });
  }
});


// =========================================================================
// Script Automation API
// =========================================================================
app.post('/api/script', async (req, res) => {
  const { action, params } = req.body;
  console.log('[SCRIPT] Action:', action, 'Params:', JSON.stringify(params || {}).substring(0, 200));

  try {
    switch (action) {
      case 'addText': {
        const result = {
          success: true,
          action: 'addText',
          clip: {
            presetId: params.presetId || 'basic-white',
            text: params.text || 'Script Text',
            trackId: params.trackId || 't1',
            startFrame: params.startFrame || 0,
            x: params.x, y: params.y,
          },
          message: 'Clip data ready — apply via client store',
        };
        return res.json(result);
      }

      case 'listPresets': {
        const presetFile = path.join(__dirname, '..', 'src', 'presets', 'textPresets.ts');
        let content = '';
        try { content = fs.readFileSync(presetFile, 'utf8'); } catch { /* ignore */ }
        const ids = [];
        const re = /id: '([^']+)'/g;
        let m;
        while ((m = re.exec(content)) !== null) ids.push(m[1]);
        return res.json({ success: true, presets: ids });
      }

      case 'export': {
        return res.json({
          success: true,
          message: 'Use /api/export endpoint directly with full clip data',
          endpoint: 'POST /api/export',
        });
      }

      case 'aiGenerate': {
        const aiResp = await fetch('http://localhost:' + PORT + '/api/ai/generate-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: params.prompt, language: params.language }),
        });
        const aiData = await aiResp.json();
        return res.json({ success: true, action: 'aiGenerate', ...aiData });
      }

      case 'batchAddText': {
        const clips = (params.clips || []).map((c, i) => ({
          presetId: c.presetId || 'basic-white',
          text: c.text || 'Text ' + (i + 1),
          startFrame: c.startFrame || i * 150,
          x: c.x, y: c.y,
        }));
        return res.json({ success: true, action: 'batchAddText', clips, message: clips.length + ' clips prepared' });
      }

      case 'ping': {
        return res.json({ success: true, action: 'ping', server: 'FlowCut v3', timestamp: Date.now() });
      }

      default:
        return res.json({ success: false, error: 'Unknown action: ' + action, availableActions: ['addText', 'listPresets', 'export', 'aiGenerate', 'batchAddText', 'ping'] });
    }
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});


// =========================================================================
// ComfyUI Direct Generate — FIXED: Node.js native fetch, robust error handling
// =========================================================================
app.post('/api/comfyui/generate', async (req, res) => {
  const { workflowId, positive, negative, width, height, seed, characterRefs } = req.body;
  console.log('');
  console.log('========================================');
  console.log('[COMFY-GEN] START');
  console.log('[COMFY-GEN] workflowId:', workflowId);
  console.log('[COMFY-GEN] positive:', (positive || '').substring(0, 80));
  console.log('[COMFY-GEN] dimensions:', width, 'x', height);
  console.log('[COMFY-GEN] seed:', seed || 'random');
  console.log('[COMFY-GEN] characterRefs:', JSON.stringify(characterRefs || []));
  console.log('========================================');

  // --- A1: IPAdapter workflow selection ---
  let effectiveWorkflowId = workflowId || 'background-scene';
  let faceRefName = null;
  const COMFY_INPUT_DIR = 'E:/WuxiaStudio/engine/ComfyUI/ComfyUI/input';

  if (characterRefs && Array.isArray(characterRefs) && characterRefs.length > 0) {
    for (const ref of characterRefs) {
      if (!ref || typeof ref !== 'string') continue;
      let checkPath = ref;
      if (ref.startsWith('http')) {
        const fn = ref.split('/').pop();
        checkPath = path.join(MEDIA_DIR, fn);
      }
      if (fs.existsSync(checkPath)) {
        try {
          const refBaseName = 'flowcut_faceref_' + path.basename(checkPath);
          const comfyRefPath = path.join(COMFY_INPUT_DIR, refBaseName);
          if (!fs.existsSync(COMFY_INPUT_DIR)) fs.mkdirSync(COMFY_INPUT_DIR, { recursive: true });
          fs.copyFileSync(checkPath, comfyRefPath);
          faceRefName = refBaseName;
          console.log('[COMFY-GEN] Face ref copied:', comfyRefPath);
          break;
        } catch (cpErr) {
          console.log('[COMFY-GEN] Face ref copy failed:', cpErr.message);
        }
      }
    }
    if (faceRefName) {
      const ipaWfPath = path.join(__dirname, '..', 'src', 'config', 'workflows', 'background-scene-ipadapter.json');
      if (fs.existsSync(ipaWfPath)) {
        effectiveWorkflowId = 'background-scene-ipadapter';
        console.log('[COMFY-GEN] IPAdapter workflow selected');
      } else {
        console.log('[COMFY-GEN] IPAdapter workflow file not found, seed-only mode');
        faceRefName = null;
      }
    } else {
      console.log('[COMFY-GEN] No valid face ref image found, seed-only mode');
    }
  }

  // --- Load workflow template ---
  const wfPath = path.join(__dirname, '..', 'src', 'config', 'workflows', effectiveWorkflowId + '.json');
  console.log('[COMFY-GEN] Workflow:', effectiveWorkflowId, '| exists:', fs.existsSync(wfPath));
  if (!fs.existsSync(wfPath)) return res.json({ error: 'Workflow not found: ' + effectiveWorkflowId });

  let template;
  try { template = JSON.parse(fs.readFileSync(wfPath, 'utf8')); }
  catch (parseErr) { return res.json({ error: 'Invalid workflow JSON: ' + parseErr.message }); }
  if (template.engine === 'canvas') return res.json({ error: 'Canvas workflows handled client-side' });

  // --- Fill workflow params ---
  const workflow = JSON.parse(JSON.stringify(template.workflow));
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node.inputs) continue;
    for (const [key, val] of Object.entries(node.inputs)) {
      if (typeof val === 'string' && val === '{{positive}}') node.inputs[key] = positive || 'beautiful image';
      if (typeof val === 'string' && val === '{{negative}}') node.inputs[key] = negative || 'blurry, ugly, deformed';
      if (typeof val === 'string' && val === '{{face_ref}}') {
        node.inputs[key] = faceRefName || 'example.png';
        console.log('[COMFY-GEN] Injected face_ref:', node.inputs[key]);
      }
    }
    if (node.class_type === 'EmptyLatentImage') {
      if (width) node.inputs.width = width;
      if (height) node.inputs.height = height;
    }
    if (node.class_type === 'KSampler') {
      node.inputs.seed = seed || Math.floor(Math.random() * 1e15);
    }
  }

  // --- Submit to ComfyUI ---
  const payload = JSON.stringify({ prompt: workflow });
  const debugPath = path.join(TEMP_DIR, 'comfy_debug_' + Date.now() + '.json');
  fs.writeFileSync(debugPath, payload, 'utf8');
  console.log('[COMFY-GEN] Payload:', payload.length, 'bytes | debug:', debugPath);

  let queueData;
  try {
    const queueResp = await fetch('http://127.0.0.1:8188/prompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
    });
    const queueText = await queueResp.text();
    console.log('[COMFY-GEN] Response status:', queueResp.status);
    try { queueData = JSON.parse(queueText); }
    catch (jsonErr) { return res.json({ error: 'Invalid ComfyUI response', raw: queueText.substring(0, 300) }); }
  } catch (fetchErr) {
    return res.json({ error: 'Cannot connect to ComfyUI: ' + fetchErr.message });
  }

  // --- A1: IPAdapter fallback ---
  if (queueData.error && effectiveWorkflowId === 'background-scene-ipadapter') {
    console.log('[COMFY-GEN] IPAdapter failed, falling back to seed-only...');
    console.log('[COMFY-GEN] IPAdapter error:', JSON.stringify(queueData.error).substring(0, 300));
    try {
      const fbWfPath = path.join(__dirname, '..', 'src', 'config', 'workflows', (workflowId || 'background-scene') + '.json');
      const fbTemplate = JSON.parse(fs.readFileSync(fbWfPath, 'utf8'));
      const fbWorkflow = JSON.parse(JSON.stringify(fbTemplate.workflow));
      for (const [nid, nd] of Object.entries(fbWorkflow)) {
        if (!nd.inputs) continue;
        for (const [k, v] of Object.entries(nd.inputs)) {
          if (typeof v === 'string' && v === '{{positive}}') nd.inputs[k] = positive || 'beautiful image';
          if (typeof v === 'string' && v === '{{negative}}') nd.inputs[k] = negative || 'blurry, ugly';
        }
        if (nd.class_type === 'EmptyLatentImage') { if (width) nd.inputs.width = width; if (height) nd.inputs.height = height; }
        if (nd.class_type === 'KSampler') { nd.inputs.seed = seed || Math.floor(Math.random() * 1e15); }
      }
      const fbResp = await fetch('http://127.0.0.1:8188/prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fbWorkflow }),
      });
      queueData = await fbResp.json();
      effectiveWorkflowId = workflowId || 'background-scene';
      console.log('[COMFY-GEN] Fallback prompt_id:', queueData.prompt_id);
    } catch (fbErr) {
      return res.json({ error: 'Both IPAdapter and fallback failed: ' + fbErr.message });
    }
  }

  if (queueData.error) return res.json({ error: 'ComfyUI rejected: ' + JSON.stringify(queueData.error).substring(0, 300) });

  const promptId = queueData.prompt_id;
  if (!promptId) return res.json({ error: 'No prompt_id', data: queueData });
  console.log('[COMFY-GEN] prompt_id:', promptId, '| polling...');

  // --- Poll for result ---
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const histResp = await fetch('http://127.0.0.1:8188/history/' + promptId);
      const histData = await histResp.json();
      const entry = histData[promptId];
      if (!entry) { if (i % 5 === 0) console.log('[COMFY-GEN] Polling... (' + (i*2) + 's)'); continue; }

      for (const [nodeId, output] of Object.entries(entry.outputs || {})) {
        const imgList = output.images || output.gifs;
        if (imgList && imgList.length > 0) {
          const img = imgList[0];
          console.log('[COMFY-GEN] Image ready:', img.filename, 'from node', nodeId);
          const imgUrl = 'http://127.0.0.1:8188/view?filename=' + encodeURIComponent(img.filename)
            + '&subfolder=' + encodeURIComponent(img.subfolder || '')
            + '&type=' + (img.type || 'output');
          const imgResp = await fetch(imgUrl);
          const imgBuf = Buffer.from(await imgResp.arrayBuffer());
          const localName = 'ai_' + Date.now() + '_' + img.filename;
          const localPath = path.join(MEDIA_DIR, localName);
          fs.writeFileSync(localPath, imgBuf);
          console.log('[COMFY-GEN] Saved:', localPath, '(' + imgBuf.length + ' bytes)');
          return res.json({
            success: true, promptId, imageFilename: img.filename,
            localPath, servePath: '/media/' + localName,
            serverUrl: 'http://localhost:' + PORT + '/media/' + localName,
            usedIPAdapter: effectiveWorkflowId === 'background-scene-ipadapter',
          });
        }
      }
    } catch (pollErr) { console.log('[COMFY-GEN] Poll error:', pollErr.message); }
  }
  console.log('[COMFY-GEN] TIMEOUT after 600s');
  return res.json({ error: 'Generation timed out' });
});

// =========================================================================
// Image-to-Video 2-Stage Pipeline
// =========================================================================
app.post('/api/comfyui/generate-video', async (req, res) => {
  const { imageLocalPath, positive, negative, width, height, length, steps } = req.body;
  console.log('');
  console.log('========================================');
  console.log('[I2V] START - Image to Video');
  console.log('[I2V] Source image:', imageLocalPath);
  console.log('[I2V] Prompt:', (positive || '').substring(0, 80));
  console.log('[I2V] Dimensions:', width || 480, 'x', height || 832);
  console.log('========================================');

  // Verify source image exists
  if (!imageLocalPath || !fs.existsSync(imageLocalPath)) {
    console.log('[I2V] ERROR: Source image not found:', imageLocalPath);
    return res.json({ error: 'Source image not found: ' + imageLocalPath });
  }

  // Copy image to ComfyUI input folder so LoadImage can find it
  const comfyInputDir = 'E:/WuxiaStudio/engine/ComfyUI/ComfyUI/input';
  if (!fs.existsSync(comfyInputDir)) fs.mkdirSync(comfyInputDir, { recursive: true });
  const imgFileName = 'flowcut_i2v_' + Date.now() + path.extname(imageLocalPath);
  const comfyImagePath = path.join(comfyInputDir, imgFileName);
  fs.copyFileSync(imageLocalPath, comfyImagePath);
  console.log('[I2V] Copied to ComfyUI input:', comfyImagePath);

  // Load i2v workflow
  const wfPath = path.join(__dirname, '..', 'src', 'config', 'workflows', 'video-i2v.json');
  if (!fs.existsSync(wfPath)) {
    return res.json({ error: 'video-i2v.json workflow not found' });
  }
  const template = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const workflow = JSON.parse(JSON.stringify(template.workflow));

  // Fill parameters
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node.inputs) {
      for (const [key, val] of Object.entries(node.inputs)) {
        if (val === '{{positive}}') node.inputs[key] = positive || 'gentle camera motion, cinematic';
        if (val === '{{negative}}') node.inputs[key] = negative || 'blurry, overexposed, static, worst quality, text, watermark';
        if (val === '{{start_image}}') node.inputs[key] = imgFileName;
      }
      if (node.class_type === 'Wan22ImageToVideoLatent') {
        if (width) node.inputs.width = width;
        if (height) node.inputs.height = height;
        if (length) node.inputs.length = length;
      }
      if (node.class_type === 'KSampler') {
        node.inputs.seed = Math.floor(Math.random() * 1e15);
        if (steps) node.inputs.steps = steps;
      }
    }
  }

  // Submit to ComfyUI
  const payload = JSON.stringify({ prompt: workflow });
  console.log('[I2V] Submitting to ComfyUI...');

  let queueData;
  try {
    const queueResp = await fetch('http://127.0.0.1:8188/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    queueData = await queueResp.json();
  } catch (err) {
    console.log('[I2V] ComfyUI connection error:', err.message);
    return res.json({ error: 'ComfyUI connection failed: ' + err.message });
  }

  if (queueData.error) {
    console.log('[I2V] ComfyUI rejected:', JSON.stringify(queueData.error).substring(0, 300));
    return res.json({ error: 'ComfyUI rejected: ' + JSON.stringify(queueData.error).substring(0, 300) });
  }

  const promptId = queueData.prompt_id;
  if (!promptId) return res.json({ error: 'No prompt_id returned' });
  console.log('[I2V] prompt_id:', promptId);
  console.log('[I2V] Polling for video completion (up to 300s)...');

  // Poll for completion (video takes longer than image)
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const histResp = await fetch('http://127.0.0.1:8188/history/' + promptId);
      const histData = await histResp.json();
      const entry = histData[promptId];
      if (!entry) {
        if (i % 10 === 0) console.log('[I2V] Polling... (' + (i * 2) + 's)');
        continue;
      }

      for (const [nodeId, output] of Object.entries(entry.outputs || {})) {
        const items = output.images || output.gifs || [];
        if (items.length > 0) {
          const item = items[0];
          console.log('[I2V] Output ready:', item.filename, 'from node', nodeId);

          const imgUrl = 'http://127.0.0.1:8188/view?filename=' + encodeURIComponent(item.filename)
            + '&subfolder=' + encodeURIComponent(item.subfolder || '')
            + '&type=' + (item.type || 'output');

          const resp = await fetch(imgUrl);
          const buffer = Buffer.from(await resp.arrayBuffer());

          const ext = path.extname(item.filename) || '.webp';
          const localName = 'ai_video_' + Date.now() + '_' + item.filename;
          const localPath = path.join(MEDIA_DIR, localName);
          fs.writeFileSync(localPath, buffer);
          console.log('[I2V] Saved:', localPath, '(' + buffer.length + ' bytes)');

          // Clean up temp image from ComfyUI input
          try { fs.unlinkSync(comfyImagePath); } catch(e) {}

          return res.json({
            success: true,
            promptId,
            localPath,
            servePath: '/media/' + localName,
            serverUrl: 'http://localhost:' + PORT + '/media/' + localName,
            outputType: 'video',
            fps: 16,
            frames: template.workflow['55']?.inputs?.length || 81
          });
        }
      }
    } catch (pollErr) {
      console.log('[I2V] Poll error:', pollErr.message);
    }
  }

  console.log('[I2V] TIMEOUT - no video after 300s');
  return res.json({ error: 'Video generation timed out (300s)', promptId });
});

// =========================================================================
// ComfyUI Proxy — FIXED: Native fetch
// =========================================================================
app.post('/api/comfyui/prompt', async (req, res) => {
  try {
    const payload = JSON.stringify(req.body);
    console.log('[COMFY-PROXY] Forwarding prompt, payload size:', payload.length);
    
    const resp = await fetch('http://127.0.0.1:8188/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    
    const text = await resp.text();
    console.log('[COMFY-PROXY] ComfyUI response status:', resp.status);
    console.log('[COMFY-PROXY] ComfyUI response:', text.substring(0, 500));
    
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      res.json({ error: 'Invalid JSON from ComfyUI', raw: text.substring(0, 200) });
    }
  } catch (err) {
    console.log('[COMFY-PROXY] Error:', err.message);
    res.json({ error: err.message });
  }
});

app.get('/api/comfyui/history/:promptId', async (req, res) => {
  try {
    const resp = await fetch('http://127.0.0.1:8188/history/' + req.params.promptId);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get('/api/comfyui/view', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const resp = await fetch('http://127.0.0.1:8188/view?' + qs);
    const buffer = Buffer.from(await resp.arrayBuffer());
    res.set('Content-Type', resp.headers.get('content-type') || 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/comfyui/health', async (req, res) => {
  try {
    const resp = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(3000) });
    const data = await resp.json();
    res.json({ online: true, ...data });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// Serve workflow templates
app.use('/config/workflows', express.static(path.join(__dirname, '..', 'src', 'config', 'workflows')));


// =========================================================================
// FlowScript Execution API
// =========================================================================
app.post('/api/script/execute', async (req, res) => {
  const { script } = req.body;
  console.log('[FLOWSCRIPT] Execute request');
  if (!script || !script.version || !script.clips) return res.json({ success: false, error: 'Invalid FlowScript' });
  const log = ['[Server] FlowScript v' + script.version, '[Server] ' + script.project.width + 'x' + script.project.height + ' @ ' + script.project.fps + 'fps', '[Server] Clips: ' + script.clips.length, '[Server] Actions: ' + (script.actions || []).length];
  const errors = [];
  for (const act of (script.actions || [])) {
    if (act.action === 'export') log.push('[Server] Export delegated to /api/export');
    if (act.action === 'upload') log.push('[Server] Upload to ' + act.platform + ' (OAuth needed)');
  }
  res.json({ success: errors.length === 0, log, errors });
});

app.get('/api/script/templates', (req, res) => {
  res.json({ success: true, templates: [
    { id: 'youtube-shorts', name: 'YouTube Shorts (9:16)', script: { version: '1.0', project: { width: 1080, height: 1920, fps: 30, aspectPreset: '9:16' }, tracks: [{ id: 'v1', name: 'Video', type: 'video' }, { id: 't1', name: 'Text', type: 'text' }], clips: [{ type: 'text', trackId: 't1', startFrame: 0, durationFrames: 90, text: 'Title Here' }], actions: [{ action: 'export', format: 'mp4' }] } },
    { id: 'slideshow', name: 'Photo Slideshow (16:9)', script: { version: '1.0', project: { width: 1920, height: 1080, fps: 30 }, tracks: [{ id: 'v1', name: 'Video', type: 'video' }], clips: [], actions: [] } },
    { id: 'ai-video', name: 'AI Generated Video', script: { version: '1.0', project: { width: 1024, height: 1024, fps: 30 }, media: [{ id: 'ai1', type: 'image', src: 'ai://beautiful sunset', aiWorkflow: 'flux-schnell' }], tracks: [{ id: 'v1', name: 'Video', type: 'video' }], clips: [{ type: 'image', mediaId: 'ai1', trackId: 'v1', startFrame: 0, durationFrames: 150 }], actions: [{ action: 'export', format: 'mp4' }] } },
  ] });
});

app.post('/api/script/validate', (req, res) => {
  const { script } = req.body;
  const errors = [];
  if (!script) errors.push('No script');
  else {
    if (script.version !== '1.0') errors.push('version must be 1.0');
    if (!script.project) errors.push('project required');
    else { if (!script.project.width || !script.project.height) errors.push('project.width/height required'); if (!script.project.fps) errors.push('project.fps required'); }
    if (!Array.isArray(script.clips)) errors.push('clips must be array');
    else script.clips.forEach(function(c, i) { if (!c.type) errors.push('clips[' + i + '].type required'); if (c.startFrame === undefined) errors.push('clips[' + i + '].startFrame required'); if (!c.durationFrames) errors.push('clips[' + i + '].durationFrames required'); });
  }
  res.json({ valid: errors.length === 0, errors: errors });
});




// =========================================================================
// Character Registry API — Phase P2-W2
// =========================================================================
const REGISTRY_PATH = path.join(MEDIA_DIR, '..', 'storage', 'characters.json');

function loadCharacterDB() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (e) { console.log('[Registry] Load error:', e.message); }
  return { version: '1.0', characters: {} };
}

function saveCharacterDB(db) {
  const dir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(db, null, 2), 'utf8');
}

app.post('/api/registry/character', (req, res) => {
  const { key, name, seed, prompt, model, voice, motion } = req.body;
  if (!key || !name) return res.json({ success: false, error: 'key and name required' });
  const db = loadCharacterDB();
  db.characters[key] = {
    key, name, created: new Date().toISOString(),
    generation: { model: model || 'DreamShaperXL_Turbo_v2', seed: seed || Math.floor(Math.random() * 1e12), prompt: prompt || '', negative: 'blurry, ugly, deformed', width: 1024, height: 1024 },
    sheets: {}, wardrobeSheets: {},
    voice: voice || { engine: 'edge-tts', preset: 'ko-KR-SunHiNeural', language: 'ko' },
    motion: motion || { style: 'natural', defaultPose: 'relaxed' },
  };
  saveCharacterDB(db);
  console.log('[Registry] Character registered:', key, 'seed:', db.characters[key].generation.seed);
  res.json({ success: true, character: db.characters[key] });
});

app.get('/api/registry/character/:key', (req, res) => {
  const db = loadCharacterDB();
  const char = db.characters[req.params.key];
  if (!char) return res.json({ success: false, error: 'Not found: ' + req.params.key });
  res.json({ success: true, character: char });
});

app.get('/api/registry/characters', (req, res) => {
  const db = loadCharacterDB();
  res.json({ success: true, characters: Object.values(db.characters) });
});

app.delete('/api/registry/character/:key', (req, res) => {
  const db = loadCharacterDB();
  if (!db.characters[req.params.key]) return res.json({ success: false, error: 'Not found' });
  delete db.characters[req.params.key];
  saveCharacterDB(db);
  res.json({ success: true });
});

// =========================================================================
// TTS (Text-to-Speech) via Edge TTS — Phase 3.5
// =========================================================================
// =========================================================================
// A3: TTS Generate — sentence splitting, speed control, voice presets
// =========================================================================

// Voice presets with recommended speed/pitch settings
const VOICE_PRESETS = {
  'ko': { voice: 'ko-KR-SunHiNeural', rate: '+0%', pitch: '+0Hz', label: 'Korean Female (SunHi)' },
  'ko-male': { voice: 'ko-KR-InJoonNeural', rate: '+0%', pitch: '+0Hz', label: 'Korean Male (InJoon)' },
  'ko-child': { voice: 'ko-KR-SunHiNeural', rate: '+10%', pitch: '+20Hz', label: 'Korean Child' },
  'ko-elder': { voice: 'ko-KR-InJoonNeural', rate: '-10%', pitch: '-10Hz', label: 'Korean Elder' },
  'ko-narrator': { voice: 'ko-KR-SunHiNeural', rate: '-5%', pitch: '-5Hz', label: 'Korean Narrator' },
  'en': { voice: 'en-US-JennyNeural', rate: '+0%', pitch: '+0Hz', label: 'English Female (Jenny)' },
  'en-male': { voice: 'en-US-GuyNeural', rate: '+0%', pitch: '+0Hz', label: 'English Male (Guy)' },
  'en-narrator': { voice: 'en-US-AriaNeural', rate: '-5%', pitch: '-5Hz', label: 'English Narrator (Aria)' },
  'ja': { voice: 'ja-JP-NanamiNeural', rate: '+0%', pitch: '+0Hz', label: 'Japanese Female (Nanami)' },
  'ja-male': { voice: 'ja-JP-KeitaNeural', rate: '+0%', pitch: '+0Hz', label: 'Japanese Male (Keita)' },
  'zh': { voice: 'zh-CN-XiaoxiaoNeural', rate: '+0%', pitch: '+0Hz', label: 'Chinese Female (Xiaoxiao)' },
  'zh-male': { voice: 'zh-CN-YunjianNeural', rate: '+0%', pitch: '+0Hz', label: 'Chinese Male (Yunjian)' },
};

// Split text into sentences for reliable TTS
function splitSentences(text) {
  // Split on sentence-ending punctuation (Korean, English, Japanese, Chinese)
  const parts = text.split(/(?<=[.!?。！？\n])\s*/g).filter(s => s.trim().length > 0);
  if (parts.length === 0) return [text];
  // Merge very short fragments (< 10 chars) with previous
  const merged = [];
  for (const p of parts) {
    if (merged.length > 0 && p.trim().length < 10) {
      merged[merged.length - 1] += ' ' + p.trim();
    } else {
      merged.push(p.trim());
    }
  }
  return merged;
}

// Generate TTS for a single chunk
async function generateTTSChunk(text, voiceName, rate, pitch, outPath) {
  const ttsTextFile = path.join(TEMP_DIR, 'tts_chunk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.txt');
  fs.writeFileSync(ttsTextFile, text, 'utf8');
  const args = ['--voice', voiceName, '--file', ttsTextFile, '--write-media', outPath];
  if (rate && rate !== '+0%') args.push('--rate', rate);
  if (pitch && pitch !== '+0Hz') args.push('--pitch', pitch);
  return new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', args, { shell: true });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      try { fs.unlinkSync(ttsTextFile); } catch(e) {}
      if (code === 0 && fs.existsSync(outPath)) resolve();
      else reject(new Error('edge-tts chunk failed (code ' + code + '): ' + stderr.slice(-200)));
    });
    proc.on('error', reject);
  });
}

// Get audio duration via ffprobe
function getAudioDuration(filePath) {
  try {
    const probe = require('child_process').execSync(
      '"E:/ffmpeg/bin/ffprobe.exe" -v quiet -show_entries format=duration -of csv=p=0 "' + filePath + '"',
      { encoding: 'utf8', timeout: 10000 }
    );
    return parseFloat(probe.trim()) || 0;
  } catch (e) { return 0; }
}

// Concat multiple audio files via FFmpeg
async function concatAudioFiles(files, outPath) {
  const listFile = path.join(TEMP_DIR, 'concat_' + Date.now() + '.txt');
  const listContent = files.map(f => "file '" + f.replace(/\\/g, '/') + "'").join('\n');
  fs.writeFileSync(listFile, listContent, 'utf8');
  return new Promise((resolve, reject) => {
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath];
    const proc = spawn(FFMPEG, args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      try { fs.unlinkSync(listFile); } catch(e) {}
      files.forEach(f => { try { fs.unlinkSync(f); } catch(e) {} });
      if (code === 0 && fs.existsSync(outPath)) resolve();
      else reject(new Error('Concat failed: ' + stderr.slice(-200)));
    });
    proc.on('error', reject);
  });
}

// Adjust audio speed to fit target duration via FFmpeg atempo
async function adjustAudioSpeed(inputPath, targetDuration, outPath) {
  const currentDur = getAudioDuration(inputPath);
  if (currentDur <= 0 || targetDuration <= 0) return false;
  const ratio = currentDur / targetDuration;
  // atempo range: 0.5 - 2.0
  if (ratio < 0.6 || ratio > 1.8) return false; // too extreme, skip
  if (Math.abs(ratio - 1.0) < 0.05) return false; // close enough
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputPath, '-af', 'atempo=' + ratio.toFixed(4), '-c:a', 'libmp3lame', '-q:a', '2', outPath];
    const proc = spawn(FFMPEG, args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(outPath)) resolve(true);
      else resolve(false);
    });
    proc.on('error', () => resolve(false));
  });
}

// =========================================================================
// BGM Generation & Library (B3)
// =========================================================================
const BGM_LIBRARY = [
  { id: 'ambient-calm', name: 'Calm Ambient', mood: 'calm', genre: 'ambient', bpm: 70, key: 'C', description: 'Peaceful ambient pad', tags: 'ambient, calm, peaceful, piano, soft, slow, relaxing, atmospheric' },
  { id: 'ambient-warm', name: 'Warm Sunset', mood: 'warm', genre: 'ambient', bpm: 80, key: 'G', description: 'Warm atmospheric tone', tags: 'ambient, warm, sunset, acoustic guitar, soft, mellow, golden hour, gentle' },
  { id: 'cinematic-epic', name: 'Epic Rise', mood: 'epic', genre: 'cinematic', bpm: 120, key: 'D', description: 'Building cinematic tension', tags: 'cinematic, epic, orchestral, drums, building, powerful, dramatic, strings, brass' },
  { id: 'cinematic-emotional', name: 'Emotional Journey', mood: 'emotional', genre: 'cinematic', bpm: 90, key: 'Am', description: 'Emotional piano-like tone', tags: 'cinematic, emotional, piano, strings, sad, beautiful, heartfelt, slow' },
  { id: 'upbeat-pop', name: 'Upbeat Energy', mood: 'upbeat', genre: 'pop', bpm: 128, key: 'E', description: 'Energetic upbeat rhythm', tags: 'pop, upbeat, energetic, drums, bass, synthesizer, fast, happy, dance' },
  { id: 'lofi-chill', name: 'Lo-fi Chill', mood: 'chill', genre: 'lofi', bpm: 85, key: 'F', description: 'Relaxed lo-fi beat', tags: 'lofi, chill, hip-hop, vinyl, piano, relaxed, study, beats, mellow' },
  { id: 'dark-tension', name: 'Dark Tension', mood: 'tense', genre: 'cinematic', bpm: 100, key: 'Dm', description: 'Suspenseful dark tone', tags: 'dark, tense, suspense, cinematic, horror, drone, low, ominous, thriller' },
  { id: 'nature-peaceful', name: 'Nature Peace', mood: 'peaceful', genre: 'ambient', bpm: 60, key: 'C', description: 'Nature-inspired calm', tags: 'nature, peaceful, ambient, flute, birds, gentle, meditation, slow, healing' },
  { id: 'corporate-bright', name: 'Corporate Bright', mood: 'bright', genre: 'corporate', bpm: 110, key: 'G', description: 'Clean corporate background', tags: 'corporate, bright, clean, piano, acoustic, professional, motivational, uplifting' },
  { id: 'travel-adventure', name: 'Adventure', mood: 'adventurous', genre: 'world', bpm: 115, key: 'A', description: 'Travel adventure vibe', tags: 'adventure, travel, world music, drums, guitar, energetic, exploration, cinematic' },
];

// Frequency map for musical keys
const KEY_FREQ = { 'C': 261.63, 'D': 293.66, 'E': 329.63, 'F': 349.23, 'G': 392.00, 'A': 440.00, 'Am': 440.00, 'Dm': 293.66 };

app.get('/api/bgm/library', (req, res) => {
  res.json({ success: true, items: BGM_LIBRARY });
});

app.post('/api/bgm/generate', async (req, res) => {
  const { bgmId, mood, duration, volume, fadeIn, fadeOut, tags, lyrics, duckingEnabled, duckingLevel, outputName } = req.body;
  const durSec = Math.min(duration || 30, 120); // ACE-Step max ~120s
  const fadeInSec = fadeIn || 2;
  const fadeOutSec = fadeOut || 3;
  const vol = (volume || 50) / 100;

  console.log('');
  console.log('========================================');
  console.log('[BGM] START - ACE-Step');
  console.log('[BGM] bgmId:', bgmId, '| mood:', mood, '| duration:', durSec + 's');
  console.log('========================================');

  let preset = BGM_LIBRARY.find(b => b.id === bgmId);
  if (!preset && mood) preset = BGM_LIBRARY.find(b => b.mood === mood);
  if (!preset) preset = BGM_LIBRARY[0];

  const bgmTags = tags || preset.tags || 'ambient, calm, instrumental';
  const bgmLyrics = lyrics || '[instrumental]';

  // Load ACE-Step workflow
  const wfPath = path.join(__dirname, '..', 'src', 'config', 'workflows', 'bgm-ace-step.json');
  if (!fs.existsSync(wfPath)) {
    console.log('[BGM] ACE-Step workflow not found, falling back to FFmpeg');
    return bgmFallbackFFmpeg(req, res, preset, durSec, vol, fadeInSec, fadeOutSec, outputName);
  }

  const template = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  const workflow = JSON.parse(JSON.stringify(template.workflow));

  // Fill parameters
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node.inputs) continue;
    for (const [key, val] of Object.entries(node.inputs)) {
      if (val === '{{tags}}') node.inputs[key] = bgmTags;
      if (val === '{{lyrics}}') node.inputs[key] = bgmLyrics;
      if (val === '{{duration}}') node.inputs[key] = durSec;
    }
    if (node.class_type === 'KSampler') {
      node.inputs.seed = Math.floor(Math.random() * 1e15);
    }
  }

  console.log('[BGM] Tags:', bgmTags.substring(0, 80));
  console.log('[BGM] Lyrics:', bgmLyrics.substring(0, 60));
  console.log('[BGM] Duration:', durSec + 's');

  // Submit to ComfyUI
  const payload = JSON.stringify({ prompt: workflow });
  let queueData;
  try {
    const queueResp = await fetch('http://127.0.0.1:8188/prompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
    });
    queueData = await queueResp.json();
  } catch (err) {
    console.log('[BGM] ComfyUI connection error:', err.message, '— falling back to FFmpeg');
    return bgmFallbackFFmpeg(req, res, preset, durSec, vol, fadeInSec, fadeOutSec, outputName);
  }

  if (queueData.error) {
    console.log('[BGM] ComfyUI error:', JSON.stringify(queueData.error).substring(0, 300));
    return bgmFallbackFFmpeg(req, res, preset, durSec, vol, fadeInSec, fadeOutSec, outputName);
  }

  const promptId = queueData.prompt_id;
  if (!promptId) {
    console.log('[BGM] No prompt_id');
    return bgmFallbackFFmpeg(req, res, preset, durSec, vol, fadeInSec, fadeOutSec, outputName);
  }

  console.log('[BGM] prompt_id:', promptId, '| polling...');

  // Poll for result
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (i % 10 === 0) console.log('[BGM] Polling... (' + (i * 2) + 's)');
    try {
      const histResp = await fetch('http://127.0.0.1:8188/history/' + promptId);
      const histData = await histResp.json();
      const result = histData[promptId];
      if (!result) continue;
      if (result.status?.status_str === 'error') {
        console.log('[BGM] Generation error — falling back');
        return bgmFallbackFFmpeg(req, res, preset, durSec, vol, fadeInSec, fadeOutSec, outputName);
      }
      const outputs = result.outputs;
      if (!outputs) continue;

      // Find audio output from SaveAudioMP3 (node 59)
      for (const [nodeId, nodeOut] of Object.entries(outputs)) {
        const audios = nodeOut.audio || nodeOut.gifs || [];
        for (const audio of audios) {
          const fn = audio.filename;
          const subfolder = audio.subfolder || '';
          console.log('[BGM] Audio ready:', fn, 'subfolder:', subfolder);

          // Download from ComfyUI
          const viewUrl = 'http://127.0.0.1:8188/view?' +
            'filename=' + encodeURIComponent(fn) +
            '&subfolder=' + encodeURIComponent(subfolder) +
            '&type=output';
          const dlResp = await fetch(viewUrl);
          if (!dlResp.ok) {
            console.log('[BGM] Download failed:', dlResp.status);
            continue;
          }
          const buffer = Buffer.from(await dlResp.arrayBuffer());
          const outName = outputName || ('bgm_' + Date.now() + '.mp3');
          const outPath = path.join(MEDIA_DIR, outName);

          // Apply fade in/out and volume via FFmpeg
          const tempRaw = path.join(TEMP_DIR, 'bgm_raw_' + Date.now() + path.extname(fn));
          fs.writeFileSync(tempRaw, buffer);

          const fadeFilter = 'afade=t=in:st=0:d=' + fadeInSec +
            ',afade=t=out:st=' + Math.max(0, durSec - fadeOutSec) + ':d=' + fadeOutSec +
            ',volume=' + vol.toFixed(2);

          try {
            await new Promise((resolve, reject) => {
              const proc = spawn(FFMPEG, [
                '-y', '-hide_banner', '-i', tempRaw,
                '-af', fadeFilter,
                '-ar', '44100', '-ac', '2',
                '-c:a', 'libmp3lame', '-b:a', '192k',
                '-t', String(durSec), outPath
              ]);
              let stderr = '';
              proc.stderr.on('data', d => stderr += d);
              proc.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg exit ' + code)));
              proc.on('error', reject);
            });
            try { fs.unlinkSync(tempRaw); } catch {}
          } catch (ffErr) {
            // If FFmpeg post-process fails, just copy the raw file
            console.log('[BGM] FFmpeg post-process failed:', ffErr.message);
            fs.copyFileSync(tempRaw, outPath);
            try { fs.unlinkSync(tempRaw); } catch {}
          }

          const stats = fs.statSync(outPath);
          const sizeMB = (stats.size / 1048576).toFixed(2);
          console.log('[BGM] Done:', outPath, '(' + sizeMB + 'MB)');

          return res.json({
            success: true, localPath: outPath,
            serverUrl: 'http://localhost:3456/media/' + outName,
            fileName: outName, duration: durSec, preset: preset.name,
            mood: preset.mood, genre: preset.genre, sizeMB: parseFloat(sizeMB),
            source: 'ace-step',
            duckingEnabled: duckingEnabled || false, duckingLevel: duckingLevel || 30,
          });
        }
      }
    } catch (pollErr) {
      console.log('[BGM] Poll error:', pollErr.message);
    }
  }

  console.log('[BGM] Timeout — falling back to FFmpeg');
  return bgmFallbackFFmpeg(req, res, preset, durSec, vol, fadeInSec, fadeOutSec, outputName);
});

// FFmpeg fallback for when ComfyUI/ACE-Step is unavailable
async function bgmFallbackFFmpeg(req, res, preset, durSec, vol, fadeInSec, fadeOutSec, outputName) {
  const outName = outputName || ('bgm_' + Date.now() + '.mp3');
  const outPath = path.join(MEDIA_DIR, outName);
  const baseFreq = { 'C':261.63,'D':293.66,'E':329.63,'F':349.23,'G':392,'A':440,'Am':440,'Dm':293.66 }[preset.key] || 261.63;

  const filterComplex = [
    'sine=frequency=' + baseFreq + ':sample_rate=44100:duration=' + durSec + '[s1]',
    'sine=frequency=' + (baseFreq * 1.5) + ':sample_rate=44100:duration=' + durSec + '[s2]',
    'anoisesrc=d=' + durSec + ':c=pink:a=0.03:r=44100[noise]',
    '[s1]volume=0.3[v1]', '[s2]volume=0.15[v2]',
    '[v1][v2][noise]amix=inputs=3:duration=longest:normalize=0[mixed]',
    '[mixed]lowpass=f=800,highpass=f=80,tremolo=f=0.1:d=0.3[trem]',
    '[trem]afade=t=in:st=0:d=' + fadeInSec + ',afade=t=out:st=' + (durSec - fadeOutSec) + ':d=' + fadeOutSec + ',volume=' + vol + '[out]',
  ].join(';');

  console.log('[BGM-FALLBACK] Generating sine-based BGM...');
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG, ['-y','-hide_banner','-filter_complex',filterComplex,'-map','[out]','-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','192k','-t',String(durSec),outPath]);
      let err = '';
      proc.stderr.on('data', d => err += d);
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('exit ' + code)));
      proc.on('error', reject);
    });
    const stats = fs.statSync(outPath);
    return res.json({
      success: true, localPath: outPath,
      serverUrl: 'http://localhost:3456/media/' + outName,
      fileName: outName, duration: durSec, preset: preset.name,
      mood: preset.mood, genre: preset.genre, sizeMB: parseFloat((stats.size/1048576).toFixed(2)),
      source: 'ffmpeg-fallback',
      duckingEnabled: req.body.duckingEnabled || false, duckingLevel: req.body.duckingLevel || 30,
    });
  } catch (err) {
    return res.json({ success: false, error: 'Fallback failed: ' + err.message });
  }
}
app.get('/api/bgm/moods', (req, res) => {
  const moods = [...new Set(BGM_LIBRARY.map(b => b.mood))];
  const genres = [...new Set(BGM_LIBRARY.map(b => b.genre))];
  res.json({ success: true, moods, genres });
});



app.post('/api/tts/generate', async (req, res) => {
  const { text, language, voice, outputName, rate, pitch, targetDuration, splitMode } = req.body;
  if (!text) return res.json({ success: false, error: 'No text provided' });

  // Resolve voice preset
  const preset = VOICE_PRESETS[voice] || VOICE_PRESETS[language || 'ko'] || VOICE_PRESETS['ko'];
  const selectedVoice = (voice && voice.includes('Neural')) ? voice : preset.voice;
  const selectedRate = rate || preset.rate;
  const selectedPitch = pitch || preset.pitch;
  const outName = outputName || ('tts_' + Date.now() + '.mp3');
  const outPath = path.join(MEDIA_DIR, outName);

  console.log('[TTS] text:', text.substring(0, 80), '| voice:', selectedVoice, '| rate:', selectedRate, '| pitch:', selectedPitch);

  try {
    const shouldSplit = splitMode !== false && text.length > 200;

    if (shouldSplit) {
      // A3: Sentence-level splitting for long text
      const sentences = splitSentences(text);
      console.log('[TTS] Split into', sentences.length, 'chunks');
      const chunkFiles = [];

      for (let i = 0; i < sentences.length; i++) {
        const chunkPath = path.join(TEMP_DIR, 'tts_part_' + Date.now() + '_' + i + '.mp3');
        await generateTTSChunk(sentences[i], selectedVoice, selectedRate, selectedPitch, chunkPath);
        chunkFiles.push(chunkPath);
        console.log('[TTS] Chunk', (i+1) + '/' + sentences.length, ':', sentences[i].substring(0, 40));
      }

      if (chunkFiles.length === 1) {
        fs.renameSync(chunkFiles[0], outPath);
      } else {
        await concatAudioFiles(chunkFiles, outPath);
      }
    } else {
      // Short text — single generation
      await generateTTSChunk(text, selectedVoice, selectedRate, selectedPitch, outPath);
    }

    // Get final duration
    let duration = getAudioDuration(outPath);
    if (duration <= 0) duration = 5;

    // A3: Adjust speed to match target scene duration if specified
    let adjusted = false;
    if (targetDuration && targetDuration > 0 && Math.abs(duration - targetDuration) > 0.5) {
      const adjustedPath = path.join(MEDIA_DIR, 'adj_' + outName);
      const result = await adjustAudioSpeed(outPath, targetDuration, adjustedPath);
      if (result) {
        fs.unlinkSync(outPath);
        fs.renameSync(adjustedPath, outPath);
        const newDur = getAudioDuration(outPath);
        console.log('[TTS] Speed adjusted:', duration.toFixed(1) + 's ->', newDur.toFixed(1) + 's (target:', targetDuration.toFixed(1) + 's)');
        duration = newDur > 0 ? newDur : duration;
        adjusted = true;
      }
    }

    console.log('[TTS] Success:', outPath, '(' + duration.toFixed(1) + 's)', adjusted ? '[speed-adjusted]' : '');
    res.json({
      success: true,
      localPath: outPath,
      servePath: '/media/' + outName,
      serverUrl: 'http://localhost:' + PORT + '/media/' + outName,
      duration,
      voice: selectedVoice,
      rate: selectedRate,
      pitch: selectedPitch,
      speedAdjusted: adjusted,
    });
  } catch (err) {
    console.log('[TTS] Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Voice presets list endpoint
app.get('/api/tts/voices', (req, res) => {
  res.json({ success: true, presets: VOICE_PRESETS });
});


// =========================================================================
// Upscale via ComfyUI RealESRGAN — Phase 3.5
// =========================================================================
app.post('/api/comfyui/upscale', async (req, res) => {
  const { imageLocalPath, scale, outputName, method } = req.body;
  if (!imageLocalPath || !fs.existsSync(imageLocalPath)) {
    return res.json({ success: false, error: 'Image not found: ' + imageLocalPath });
  }

  const scaleFactor = scale || 4;
  const useAI = method !== 'lanczos';
  const outName = outputName || ('upscaled_' + Date.now() + '.png');
  const outPath = path.join(MEDIA_DIR, outName);
  const COMFY_INPUT_DIR = 'E:/WuxiaStudio/engine/ComfyUI/ComfyUI/input';

  console.log('[UPSCALE] input:', imageLocalPath, 'scale:', scaleFactor, 'method:', useAI ? 'AI (4x-UltraSharp)' : 'FFmpeg lanczos');

  if (useAI) {
    try {
      // Copy image to ComfyUI input
      const inputName = 'flowcut_upscale_' + Date.now() + '_' + path.basename(imageLocalPath);
      const comfyInputPath = path.join(COMFY_INPUT_DIR, inputName);
      fs.copyFileSync(imageLocalPath, comfyInputPath);
      console.log('[UPSCALE] Copied to ComfyUI input:', comfyInputPath);

      // Load upscale workflow
      const wfPath = path.join(__dirname, '..', 'src', 'config', 'workflows', 'upscale-image.json');
      const template = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
      const workflow = JSON.parse(JSON.stringify(template.workflow));

      // Inject input image name
      for (const [nodeId, node] of Object.entries(workflow)) {
        if (node.inputs) {
          for (const [key, val] of Object.entries(node.inputs)) {
            if (typeof val === 'string' && val === '{{input_image}}') {
              node.inputs[key] = inputName;
            }
          }
          // Select model based on scale
          if (node.class_type === 'UpscaleModelLoader') {
            node.inputs.model_name = scaleFactor >= 4 ? '4x-UltraSharp.pth' : '2xLexicaRRDBNet_Sharp.pth';
            console.log('[UPSCALE] Model:', node.inputs.model_name);
          }
        }
      }

      // Submit to ComfyUI
      const payload = JSON.stringify({ prompt: workflow });
      const queueResp = await fetch('http://127.0.0.1:8188/prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
      });
      const queueData = await queueResp.json();

      if (queueData.error) {
        console.log('[UPSCALE] ComfyUI rejected, falling back to FFmpeg:', JSON.stringify(queueData.error).substring(0, 200));
        throw new Error('ComfyUI_FALLBACK');
      }

      const promptId = queueData.prompt_id;
      if (!promptId) throw new Error('No prompt_id');
      console.log('[UPSCALE] ComfyUI prompt_id:', promptId);

      // Poll for result
      for (let i = 0; i < 150; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const histResp = await fetch('http://127.0.0.1:8188/history/' + promptId);
          const histData = await histResp.json();
          const entry = histData[promptId];
          if (!entry) { if (i % 5 === 0) console.log('[UPSCALE] Polling... (' + (i*2) + 's)'); continue; }

          for (const [nodeId, output] of Object.entries(entry.outputs || {})) {
            const imgList = output.images || output.gifs;
            if (imgList && imgList.length > 0) {
              const img = imgList[0];
              const imgUrl = 'http://127.0.0.1:8188/view?filename=' + encodeURIComponent(img.filename)
                + '&subfolder=' + encodeURIComponent(img.subfolder || '')
                + '&type=' + (img.type || 'output');
              const imgResp = await fetch(imgUrl);
              const imgBuf = Buffer.from(await imgResp.arrayBuffer());
              fs.writeFileSync(outPath, imgBuf);
              console.log('[UPSCALE] AI upscale done:', outPath, '(' + imgBuf.length + ' bytes)');
              return res.json({
                success: true, localPath: outPath,
                servePath: '/media/' + outName,
                serverUrl: 'http://localhost:' + PORT + '/media/' + outName,
                scale: scaleFactor, method: 'ai-4xUltraSharp',
              });
            }
          }
        } catch (pollErr) { console.log('[UPSCALE] Poll error:', pollErr.message); }
      }
      throw new Error('AI upscale timed out');

    } catch (aiErr) {
      if (aiErr.message !== 'ComfyUI_FALLBACK') console.log('[UPSCALE] AI failed:', aiErr.message);
      console.log('[UPSCALE] Falling back to FFmpeg lanczos...');
    }
  }

  // FFmpeg lanczos fallback (or explicit lanczos method)
  try {
    await new Promise((resolve, reject) => {
      const args = ['-y', '-i', imageLocalPath, '-vf', 'scale=iw*' + scaleFactor + ':ih*' + scaleFactor + ':flags=lanczos', '-q:v', '2', outPath];
      const proc = spawn(FFMPEG, args);
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => { if (code === 0 && fs.existsSync(outPath)) resolve(); else reject(new Error('FFmpeg failed: ' + stderr.slice(-200))); });
      proc.on('error', reject);
    });
    console.log('[UPSCALE] FFmpeg done:', outPath);
    res.json({
      success: true, localPath: outPath,
      servePath: '/media/' + outName,
      serverUrl: 'http://localhost:' + PORT + '/media/' + outName,
      scale: scaleFactor, method: 'ffmpeg-lanczos',
    });
  } catch (ffErr) {
    console.log('[UPSCALE] FFmpeg error:', ffErr.message);
    res.json({ success: false, error: ffErr.message });
  }
});


// =========================================================================
// A2: Frame Interpolation — 16fps → 30fps+ via FFmpeg minterpolate
// =========================================================================
app.post('/api/interpolate', async (req, res) => {
  const { videoLocalPath, targetFps, method, outputName } = req.body;
  if (!videoLocalPath || !fs.existsSync(videoLocalPath)) {
    return res.json({ success: false, error: 'Video not found: ' + videoLocalPath });
  }

  const fps = targetFps || 30;
  const interpMethod = method || 'mci';
  const outName = outputName || ('interp_' + fps + 'fps_' + Date.now() + '.mp4');
  const outPath = path.join(MEDIA_DIR, outName);

  console.log('[INTERP] input:', videoLocalPath, 'target:', fps + 'fps', 'method:', interpMethod);

  try {
    await new Promise((resolve, reject) => {
      const args = [
        '-y', '-i', videoLocalPath,
        '-vf', 'minterpolate=fps=' + fps + ':mi_mode=' + interpMethod + ':mc_mode=aobmc:me_mode=bidir:vsbmc=1',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-an', outPath
      ];
      console.log('[INTERP] FFmpeg args:', args.join(' ').substring(0, 300));
      const proc = spawn(FFMPEG, args);
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outPath)) {
          resolve();
        } else {
          console.log('[INTERP] stderr:', stderr.slice(-500));
          reject(new Error('Interpolation failed (code ' + code + '): ' + stderr.slice(-200)));
        }
      });
      proc.on('error', reject);
    });

    // Get output info
    const stats = fs.statSync(outPath);
    console.log('[INTERP] Done:', outPath, '(' + (stats.size / 1048576).toFixed(1) + ' MB)');

    res.json({
      success: true,
      localPath: outPath,
      servePath: '/media/' + outName,
      serverUrl: 'http://localhost:' + PORT + '/media/' + outName,
      targetFps: fps,
      method: 'minterpolate-' + interpMethod,
      sizeMB: parseFloat((stats.size / 1048576).toFixed(1)),
    });
  } catch (err) {
    console.log('[INTERP] Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// =========================================================================
// A2: Video Enhance Pipeline — upscale + interpolate in one call
// =========================================================================
app.post('/api/enhance-video', async (req, res) => {
  const { videoLocalPath, targetFps, upscaleScale, upscaleMethod } = req.body;
  if (!videoLocalPath || !fs.existsSync(videoLocalPath)) {
    return res.json({ success: false, error: 'Video not found: ' + videoLocalPath });
  }

  const fps = targetFps || 30;
  const scale = upscaleScale || 2;
  const outName = 'enhanced_' + Date.now() + '.mp4';
  const outPath = path.join(MEDIA_DIR, outName);

  console.log('[ENHANCE] input:', videoLocalPath, 'target:', fps + 'fps', 'upscale:', scale + 'x');

  try {
    // Single FFmpeg pass: upscale + interpolate together
    const scaleFilter = 'scale=iw*' + scale + ':ih*' + scale + ':flags=lanczos';
    const interpFilter = 'minterpolate=fps=' + fps + ':mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1';
    const filterChain = scaleFilter + ',' + interpFilter;

    await new Promise((resolve, reject) => {
      const args = [
        '-y', '-i', videoLocalPath,
        '-vf', filterChain,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-an', outPath
      ];
      console.log('[ENHANCE] FFmpeg filter:', filterChain);
      const proc = spawn(FFMPEG, args);
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outPath)) resolve();
        else reject(new Error('Enhance failed (code ' + code + '): ' + stderr.slice(-200)));
      });
      proc.on('error', reject);
    });

    const stats = fs.statSync(outPath);
    console.log('[ENHANCE] Done:', outPath, '(' + (stats.size / 1048576).toFixed(1) + ' MB)');

    res.json({
      success: true,
      localPath: outPath,
      servePath: '/media/' + outName,
      serverUrl: 'http://localhost:' + PORT + '/media/' + outName,
      targetFps: fps, upscaleScale: scale,
      sizeMB: parseFloat((stats.size / 1048576).toFixed(1)),
    });
  } catch (err) {
    console.log('[ENHANCE] Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});
const PORT = 3456;

// ═══════════════════════════════════════════════════
// B1: Extract last frame from video for chain generation
// ═══════════════════════════════════════════════════
app.post('/api/extract-last-frame', async (req, res) => {
  const { videoLocalPath, outputName } = req.body;
  console.log('[CHAIN] Extract last frame from:', videoLocalPath);
  if (!videoLocalPath || !fs.existsSync(videoLocalPath)) {
    return res.json({ success: false, error: 'Video not found: ' + videoLocalPath });
  }
  const outName = outputName || ('lastframe_' + Date.now() + '.png');
  const outPath = path.join(MEDIA_DIR, outName);
  try {
    // Get video duration first
    const durResult = require('child_process').execSync(
      '"E:/ffmpeg/bin/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "' + videoLocalPath + '"',
      { encoding: 'utf8', timeout: 10000 }
    ).trim();
    const duration = parseFloat(durResult) || 5;
    const seekTo = Math.max(0, duration - 0.05);
    // Extract last frame
    const args = [
      '-y', '-ss', String(seekTo), '-i', videoLocalPath,
      '-vframes', '1', '-q:v', '2', outPath
    ];
    await new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG, args);
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outPath)) resolve(true);
        else reject(new Error('FFmpeg exit ' + code + ': ' + stderr.slice(-200)));
      });
      proc.on('error', reject);
    });
    const stats = fs.statSync(outPath);
    console.log('[CHAIN] Last frame extracted:', outPath, '(' + (stats.size / 1024).toFixed(1) + 'KB)');
    // Also copy to ComfyUI input for i2v
    const comfyInputDir = 'E:/WuxiaStudio/engine/ComfyUI/ComfyUI/input';
    const comfyName = 'flowcut_chain_' + outName;
    const comfyPath = path.join(comfyInputDir, comfyName);
    try {
      if (!fs.existsSync(comfyInputDir)) fs.mkdirSync(comfyInputDir, { recursive: true });
      fs.copyFileSync(outPath, comfyPath);
      console.log('[CHAIN] Copied to ComfyUI input:', comfyPath);
    } catch (cpErr) { console.log('[CHAIN] ComfyUI copy failed:', cpErr.message); }
    res.json({
      success: true,
      localPath: outPath,
      servePath: '/media/' + outName,
      serverUrl: 'http://localhost:' + PORT + '/media/' + outName,
      comfyInputName: comfyName,
      duration: duration,
      sizeMB: (stats.size / 1048576).toFixed(2),
    });
  } catch (err) {
    console.log('[CHAIN] Extract error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('  FlowCut Export Server v3.1 (native fetch)');
  console.log('  http://localhost:' + PORT);
  console.log('  FFmpeg: ' + FFMPEG);
  console.log('  Output: ' + OUTPUT_DIR);
  console.log('  Node.js: ' + process.version);
  console.log('  Native fetch: ' + (typeof fetch === 'function' ? 'YES' : 'NO'));
  console.log('  Node.js: ' + process.version);
  console.log('  Native fetch: ' + (typeof fetch !== 'undefined' ? 'YES' : 'NO'));
  console.log('');
});