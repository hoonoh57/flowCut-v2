const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const fs = require('fs');
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
    parts.push("if(between(t," + t0 + "," + t1 + ")," + v0 + "+" + slope + "*(t-" + t0 + "))");
  }
  if (parts.length === 0) return null;
  return "volume='" + parts.join("+") + "':eval=frame";
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
const FFPROBE = 'E:\\ffmpeg\\bin\\ffprobe.exe';
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
    const unique = Date.now() + '_' + safeName;
    cb(null, unique);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'No file' });
  const localPath = req.file.path;
  const servePath = '/media/' + req.file.filename;
  console.log('  Upload: ' + req.file.originalname + ' -> ' + localPath);
  res.json({ success: true, localPath, servePath, fileName: req.file.filename, originalName: req.file.originalname, size: req.file.size });
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

function getClipRect(clip, pw, ph, ow, oh) {
  // Scale from project coords to output coords
  const sx = ow / pw, sy = oh / ph;
  let cx = clip.x || 0, cy = clip.y || 0;
  let cw = clip.clipWidth || pw, ch = clip.clipHeight || ph;
  // Auto-fit: if x=0, y=0 and size differs from project, center-fit
  const isDefault = cx === 0 && cy === 0 && (cw === pw || cw === 1920) && (ch === ph || ch === 1080);
  if (isDefault && (clip.type === 'video' || clip.type === 'image')) {
    return { x: 0, y: 0, w: ow, h: oh, fullscreen: true };
  }
  // Custom position/size - scale to output
  return { x: Math.round(cx * sx), y: Math.round(cy * sy), w: Math.round(cw * sx), h: Math.round(ch * sy), fullscreen: false };
}
function sendProgress(data) {
  progressClients.forEach(c => c.write('data: ' + JSON.stringify(data) + '\n\n'));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ffmpeg: FFMPEG, output: OUTPUT_DIR });
});
app.post('/api/export', async (req, res) => {
  const {
    inputFiles, projectWidth, projectHeight, fps,
    format = 'mp4', quality = 'medium',
    outputWidth, outputHeight,
    fileName = 'flowcut_export',
    includeAudio = true,
  } = req.body;

  const ow = outputWidth || projectWidth;
  const oh = outputHeight || projectHeight;
  const crf = { original: 16, high: 18, medium: 23, low: 28 }[quality] || 23;
  const ext = format === 'gif' ? 'gif' : format === 'webm' ? 'webm' : 'mp4';

  // Always use timestamp to avoid stale cache
  const ts = Date.now();
  const outputPath = path.join(OUTPUT_DIR, fileName + '_' + ts + '.' + ext);

  sendProgress({ status: 'starting', message: 'Export starting...' });

  try {
    // Separate visual clips (video + image) and audio clips
    const visualClips = inputFiles
      .filter(f => (f.type === 'video' || f.type === 'image') && f.localPath && fs.existsSync(f.localPath))
      .sort((a, b) => {
        // Sort by track z-order: lower track number = background = overlay first
        // Then fullscreen clips before positioned clips (background first)
        // Then by startFrame
        const aRect = getClipRect(a, projectWidth, projectHeight, ow, oh);
        const bRect = getClipRect(b, projectWidth, projectHeight, ow, oh);
        // Fullscreen (background) clips go first
        if (aRect.fullscreen && !bRect.fullscreen) return -1;
        if (!aRect.fullscreen && bRect.fullscreen) return 1;
        // Then by track id number (lower = background)
        const aTrackNum = parseInt((a.trackId || '').replace(/\D/g, '') || '0');
        const bTrackNum = parseInt((b.trackId || '').replace(/\D/g, '') || '0');
        if (aTrackNum !== bTrackNum) return aTrackNum - bTrackNum;
        return a.startFrame - b.startFrame;
      });
    const audioClips = inputFiles
      .filter(f => (f.type === 'audio' || f.type === 'video') && !f.muted && f.localPath && fs.existsSync(f.localPath))
      .sort((a, b) => a.startFrame - b.startFrame);

    if (visualClips.length === 0 && audioClips.length === 0) {
      sendProgress({ status: 'error', message: 'No media files found on disk' });
      return res.json({ success: false, error: 'No media files found.' });
    }

    // Calculate total duration from all clips
    const maxFrame = inputFiles.reduce((mx, c) => Math.max(mx, c.startFrame + c.durationFrames), 0);
    const totalDurSec = (maxFrame / fps).toFixed(3);

    const args = ['-y', '-hide_banner'];
    const filterParts = [];
    let inputIdx = 0;
    const inputMap = new Map(); // clipId -> input index

    // --- Add inputs ---
    // 1) Black background as base canvas
    args.push('-f', 'lavfi', '-i', 'color=c=black:s=' + ow + 'x' + oh + ':d=' + totalDurSec + ':r=' + fps);
    const baseIdx = inputIdx++;

    // 2) Add each visual clip as input
    for (const clip of visualClips) {
      if (clip.type === 'image') {
        args.push('-loop', '1', '-t', (clip.durationFrames / fps).toFixed(3), '-i', clip.localPath);
      } else {
        args.push('-i', clip.localPath);
      }
      inputMap.set(clip.clipId + '_v', inputIdx);
      inputIdx++;
    }

    // 3) Add audio-only clips
    for (const clip of audioClips) {
      if (!inputMap.has(clip.clipId + '_v')) {
        args.push('-i', clip.localPath);
        inputMap.set(clip.clipId + '_a', inputIdx);
        inputIdx++;
      }
    }

    // --- Build complex filter ---
    let lastVideo = '[' + baseIdx + ':v]';
    let overlayCount = 0;

    for (const clip of visualClips) {
      const idx = inputMap.get(clip.clipId + '_v');
      const startSec = (clip.startFrame / fps).toFixed(3);
      const durSec = (clip.durationFrames / fps).toFixed(3);
      const endSec = ((clip.startFrame + clip.durationFrames) / fps).toFixed(3);

      // Scale input to clip's actual size and position
      const rect = getClipRect(clip, projectWidth, projectHeight, ow, oh);
      const scaledLabel = 'sc' + overlayCount;
      let scaleFilter = '[' + idx + ':v]';

      if (rect.fullscreen) {
        scaleFilter += 'scale=' + ow + ':' + oh + ':flags=lanczos:force_original_aspect_ratio=decrease,pad=' + ow + ':' + oh + ':(ow-iw)/2:(oh-ih)/2:black';
      } else {
        scaleFilter += 'scale=' + rect.w + ':' + rect.h + ':flags=lanczos';
      }
      if (clip.type !== 'image' && clip.speed && clip.speed !== 1) {
        scaleFilter += ',setpts=' + (1/clip.speed).toFixed(4) + '*PTS';
      }
      scaleFilter += '[' + scaledLabel + ']';
      filterParts.push(scaleFilter);

      // Overlay at clip position
      const ovLabel = 'ov' + overlayCount;
      const ovX = rect.fullscreen ? 0 : rect.x;
      const ovY = rect.fullscreen ? 0 : rect.y;
      const overlayFilter = lastVideo + "[" + scaledLabel + "]overlay=" + ovX + ":" + ovY + ":enable=" + String.fromCharCode(39) + "between(t," + startSec + "," + endSec + ")" + String.fromCharCode(39) + "[" + ovLabel + "]";
      filterParts.push(overlayFilter);

      lastVideo = '[' + ovLabel + ']';
      overlayCount++;
    }

    // --- Audio mix ---
    let audioFilter = '';
    let audioLabel = '';
    const audioInputs = [];

    if (includeAudio && audioClips.length > 0) {
      for (let i = 0; i < audioClips.length; i++) {
        const clip = audioClips[i];
        const aIdx = inputMap.get(clip.clipId + '_v') || inputMap.get(clip.clipId + '_a');
        if (aIdx === undefined) continue;
        const delaySec = (clip.startFrame / fps).toFixed(3);
        const delayMs = Math.round(clip.startFrame / fps * 1000);
        const durSec = (clip.durationFrames / fps).toFixed(3);
        const aLabel = 'a' + i;

        let af = '[' + aIdx + ':a]';
        const afParts = [];
        // Volume / envelope
        const envFilter = clip.volumeEnvelope ? envelopeToVolumeFilter(clip.volumeEnvelope, parseFloat(durSec)) : null;
        if (envFilter) {
          afParts.push(envFilter);
        } else if (clip.volume !== undefined && clip.volume !== 100) {
          afParts.push('volume=' + (clip.volume/100).toFixed(2));
        }
        if (clip.speed && clip.speed !== 1) {
          afParts.push('atempo=' + Math.max(0.5, Math.min(2, clip.speed)));
        }
        if (clip.fadeIn > 0) afParts.push('afade=t=in:st=0:d=' + (clip.fadeIn/fps).toFixed(2));
        if (clip.fadeOut > 0) {
          const fadeStart = Math.max(0, parseFloat(durSec) - clip.fadeOut/fps);
          afParts.push('afade=t=out:st=' + fadeStart.toFixed(2) + ':d=' + (clip.fadeOut/fps).toFixed(2));
        }
        // Delay to correct position
        afParts.push('adelay=' + delayMs + '|' + delayMs);
        afParts.push('apad=whole_dur=' + totalDurSec);

        af += afParts.join(',') + '[' + aLabel + ']';
        filterParts.push(af);
        audioInputs.push('[' + aLabel + ']');
      }

      if (audioInputs.length === 1) {
        audioLabel = audioInputs[0].replace('[', '').replace(']', '');
      } else if (audioInputs.length > 1) {
        audioLabel = 'amixed';
        filterParts.push(audioInputs.join('') + 'amix=inputs=' + audioInputs.length + ':duration=longest:normalize=0[' + audioLabel + ']');
      }
    }

    // --- Assemble ---
    const complexFilter = filterParts.join(';');
    if (complexFilter) {
      args.push('-filter_complex', complexFilter);
      args.push('-map', lastVideo);
      if (audioLabel) {
        args.push('-map', '[' + audioLabel + ']');
      } else if (!includeAudio || audioClips.length === 0) {
        args.push('-an');
      }
    }

    args.push('-t', totalDurSec);

    // Codec settings
    if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf));
      args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart');
      if (audioLabel) args.push('-c:a', 'aac', '-b:a', '192k');
    } else if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0');
      if (audioLabel) args.push('-c:a', 'libopus', '-b:a', '128k');
    } else if (format === 'gif') {
      args.push('-an');
    }

    args.push(outputPath);

    console.log('  FFmpeg args:', args.join(' ').substring(0, 300) + '...');
    sendProgress({ status: 'encoding', progress: 5, message: 'Encoding ' + ow + 'x' + oh + ' ' + format.toUpperCase() + '...' });

    const totalFrames = Math.round(parseFloat(totalDurSec) * fps);
    const ffProcess = spawn(FFMPEG, args);
    let stderrLog = '';
    let lastPct = 0;

    ffProcess.stderr.on('data', (data) => {
      const line = data.toString();
      stderrLog += line;
      const m = line.match(/frame=\s*(\d+)/);
      if (m) {
        const frame = parseInt(m[1]);
        const pct = totalFrames > 0 ? Math.min(99, Math.round((frame / totalFrames) * 100)) : 50;
        if (pct > lastPct) {
          lastPct = pct;
          sendProgress({ status: 'encoding', progress: pct, message: 'Encoding: ' + pct + '% (' + frame + '/' + totalFrames + 'f)' });
        }
      }
    });

    await new Promise((resolve, reject) => {
      ffProcess.on('close', (code) => {
        if (code === 0) resolve();
        else {
          console.log('  FFmpeg stderr:', stderrLog.slice(-800));
          reject(new Error('FFmpeg exit code ' + code));
        }
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

app.get('/api/open-output', (req, res) => {
  exec('explorer "' + OUTPUT_DIR + '"');
  res.json({ success: true });
});

const PORT = 3456;
app.listen(PORT, () => {
  console.log('');
  console.log('  FlowCut Export Server v2');
  console.log('  http://localhost:' + PORT);
  console.log('  FFmpeg: ' + FFMPEG);
  console.log('  Output: ' + OUTPUT_DIR);
  console.log('  Media:  ' + MEDIA_DIR);
  console.log('');
});
