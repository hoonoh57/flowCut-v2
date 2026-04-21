const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

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
        sf += 'scale=' + ow + ':' + oh + ':flags=lanczos:force_original_aspect_ratio=decrease,pad=' + ow + ':' + oh + ':(ow-iw)/2:(oh-ih)/2:black';
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
      const overlayFilter = lastVideo + '[' + scaledLabel + ']overlay=' + ovX + ':' + ovY + ':enable=' + SQ + 'between(t,' + startSec + ',' + endSec + ')' + SQ + '[' + ovLabel + ']';
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
  const { workflowId, positive, negative, width, height, seed } = req.body;
  console.log('');
  console.log('========================================');
  console.log('[COMFY-GEN] START');
  console.log('[COMFY-GEN] workflowId:', workflowId);
  console.log('[COMFY-GEN] positive:', (positive || '').substring(0, 80));
  console.log('[COMFY-GEN] dimensions:', width, 'x', height);
  console.log('========================================');
  
  // Load workflow template
  const wfPath = path.join(__dirname, '..', 'src', 'config', 'workflows', workflowId + '.json');
  console.log('[COMFY-GEN] Workflow path:', wfPath);
  console.log('[COMFY-GEN] File exists:', fs.existsSync(wfPath));
  
  if (!fs.existsSync(wfPath)) {
    console.log('[COMFY-GEN] ERROR: Workflow not found');
    return res.json({ error: 'Workflow not found: ' + workflowId });
  }
  
  let template;
  try {
    template = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
    console.log('[COMFY-GEN] Template loaded, engine:', template.engine || 'comfyui');
  } catch (parseErr) {
    console.log('[COMFY-GEN] ERROR: Failed to parse workflow JSON:', parseErr.message);
    return res.json({ error: 'Invalid workflow JSON: ' + parseErr.message });
  }
  
  if (template.engine === 'canvas') {
    return res.json({ error: 'Canvas workflows handled client-side' });
  }
  
  // Deep clone workflow and fill params
  const workflow = JSON.parse(JSON.stringify(template.workflow));
  
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node.inputs) {
      for (const [key, val] of Object.entries(node.inputs)) {
        if (typeof val === 'string' && val === '{{positive}}') {
          node.inputs[key] = positive || 'beautiful image';
        }
        if (typeof val === 'string' && val === '{{negative}}') {
          node.inputs[key] = negative || 'blurry, ugly';
        }
      }
      if (node.class_type === 'EmptyLatentImage') {
        if (width) node.inputs.width = width;
        if (height) node.inputs.height = height;
      }
      if (node.class_type === 'Wan22ImageToVideoLatent') {
        if (width) node.inputs.width = width;
        if (height) node.inputs.height = height;
      }
      if (node.class_type === 'KSampler') {
        node.inputs.seed = seed || Math.floor(Math.random() * 1e15);
      }
      if (node.class_type === 'ModelSamplingSD3') {
        // keep default shift
      }
    }
  }
  
  console.log('[COMFY-GEN] Workflow nodes:', Object.keys(workflow));
  
  // Build the payload exactly as ComfyUI expects
  const payload = JSON.stringify({ prompt: workflow });
  console.log('[COMFY-GEN] Payload size:', payload.length, 'bytes');
  console.log('[COMFY-GEN] Payload preview:', payload.substring(0, 300));
  
  // === DEBUG: Save payload to file for comparison with PowerShell ===
  const debugPayloadPath = path.join(TEMP_DIR, 'comfy_debug_payload_' + Date.now() + '.json');
  fs.writeFileSync(debugPayloadPath, payload, 'utf8');
  console.log('[COMFY-GEN] Debug payload saved to:', debugPayloadPath);
  
  // Submit to ComfyUI using Node.js native fetch
  console.log('[COMFY-GEN] Submitting to http://127.0.0.1:8188/prompt ...');
  
  let queueData;
  try {
    const queueResp = await fetch('http://127.0.0.1:8188/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    
    console.log('[COMFY-GEN] Response status:', queueResp.status);
    console.log('[COMFY-GEN] Response headers:', JSON.stringify(Object.fromEntries(queueResp.headers.entries())));
    
    const queueText = await queueResp.text();
    console.log('[COMFY-GEN] Response body:', queueText.substring(0, 500));
    
    try {
      queueData = JSON.parse(queueText);
    } catch (jsonErr) {
      console.log('[COMFY-GEN] ERROR: Failed to parse ComfyUI response as JSON');
      return res.json({ error: 'Invalid response from ComfyUI', raw: queueText.substring(0, 300) });
    }
  } catch (fetchErr) {
    console.log('[COMFY-GEN] FETCH ERROR:', fetchErr.message);
    console.log('[COMFY-GEN] FETCH ERROR stack:', fetchErr.stack);
    console.log('[COMFY-GEN] Is ComfyUI running at http://127.0.0.1:8188 ?');
    return res.json({ error: 'Failed to connect to ComfyUI: ' + fetchErr.message });
  }
  
  if (queueData.error) {
    console.log('[COMFY-GEN] ComfyUI rejected the prompt:', JSON.stringify(queueData.error).substring(0, 500));
    if (queueData.node_errors) {
      console.log('[COMFY-GEN] Node errors:', JSON.stringify(queueData.node_errors).substring(0, 500));
    }
    return res.json({ error: 'ComfyUI rejected: ' + JSON.stringify(queueData.error).substring(0, 300) });
  }
  
  const promptId = queueData.prompt_id;
  if (!promptId) {
    console.log('[COMFY-GEN] ERROR: No prompt_id in response:', JSON.stringify(queueData));
    return res.json({ error: 'No prompt_id returned', data: queueData });
  }
  
  console.log('[COMFY-GEN] SUCCESS — prompt_id:', promptId);
  console.log('[COMFY-GEN] Now polling for completion (up to 180s)...');
  
  // Poll for completion
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 2000));
    
    try {
      const histResp = await fetch('http://127.0.0.1:8188/history/' + promptId);
      const histData = await histResp.json();
      const entry = histData[promptId];
      
      if (!entry) {
        if (i % 5 === 0) console.log('[COMFY-GEN] Polling... (' + (i * 2) + 's)');
        continue;
      }
      
      console.log('[COMFY-GEN] History entry found, checking outputs...');
      
      for (const [nodeId, output] of Object.entries(entry.outputs || {})) {
        if ((output.images && output.images.length > 0) || (output.gifs && output.gifs.length > 0)) {
          const img = (output.images && output.images[0]) || (output.gifs && output.gifs[0]);
          console.log('[COMFY-GEN] Image ready:', img.filename, 'from node', nodeId);
          
          // Download image
          const imgUrl = 'http://127.0.0.1:8188/view?filename=' + encodeURIComponent(img.filename) 
            + '&subfolder=' + encodeURIComponent(img.subfolder || '') 
            + '&type=' + (img.type || 'output');
          
          const imgResp = await fetch(imgUrl);
          const imgArrayBuffer = await imgResp.arrayBuffer();
          const imgBuffer = Buffer.from(imgArrayBuffer);
          
          const localName = 'ai_' + Date.now() + '_' + img.filename;
          const localPath = path.join(MEDIA_DIR, localName);
          fs.writeFileSync(localPath, imgBuffer);
          console.log('[COMFY-GEN] Saved to:', localPath, '(' + imgBuffer.length + ' bytes)');
          
          return res.json({ 
            success: true, 
            promptId,
            imageFilename: img.filename,
            localPath,
            servePath: '/media/' + localName,
            serverUrl: 'http://localhost:' + PORT + '/media/' + localName,
          });
        }
      }
    } catch (pollErr) {
      console.log('[COMFY-GEN] Poll error:', pollErr.message);
    }
  }
  
  console.log('[COMFY-GEN] TIMEOUT — no image after 180s');
  return res.json({ error: 'Generation timed out (600s)', promptId });
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
            frames: template.workflow['55']?.inputs?.length || 33
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

const PORT = 3456;
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