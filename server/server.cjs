const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');


// Convert volumeEnvelope to FFmpeg volume filter expression
function envelopeToVolumeFilter(envelope, durationSec) {
  if (!envelope || envelope.length < 2) return null;
  const sorted = [...envelope].sort((a, b) => a.position - b.position);
  // Build piecewise linear volume expression using 'if(between(t,...))'
  const parts = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const t0 = (a.position * durationSec).toFixed(3);
    const t1 = (b.position * durationSec).toFixed(3);
    const v0 = (a.volume / 100).toFixed(3);
    const v1 = (b.volume / 100).toFixed(3);
    const dt = (b.position - a.position) * durationSec;
    if (dt <= 0) continue;
    // Linear interpolation: v0 + (v1-v0) * (t-t0) / (t1-t0)
    const slope = ((b.volume - a.volume) / 100 / dt).toFixed(6);
    parts.push("if(between(t," + t0 + "," + t1 + ")," + v0 + "+" + slope + "*(t-" + t0 + "))");
  }
  if (parts.length === 0) return null;
  // Chain with default fallback
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

// File upload
const storage = multer.diskStorage({
  destination: MEDIA_DIR,
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
    const unique = Date.now() + '_' + safeName;
    cb(null, unique);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

// Upload media file — returns local path
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'No file' });
  const localPath = req.file.path;
  const servePath = `/media/${req.file.filename}`;
  console.log(`  Upload: ${req.file.originalname} -> ${localPath}`);
  res.json({
    success: true,
    localPath: localPath,
    servePath: servePath,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

// Serve media files (for browser preview)
app.use('/media', express.static(MEDIA_DIR));

// SSE progress
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
  progressClients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ffmpeg: FFMPEG, output: OUTPUT_DIR });
});

// Export
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
  const outputPath = path.join(OUTPUT_DIR, `${fileName}.${ext}`);

  sendProgress({ status: 'starting', message: 'Export starting...' });

  try {
    const videoClips = inputFiles.filter(f => f.type === 'video' && f.localPath && fs.existsSync(f.localPath));
    const audioClips = inputFiles.filter(f => (f.type === 'audio' || f.type === 'video') && !f.muted && f.localPath && fs.existsSync(f.localPath));

    if (videoClips.length === 0) {
      sendProgress({ status: 'error', message: 'No video files found on disk' });
      return res.json({ success: false, error: 'No video files found. Make sure files are uploaded.' });
    }

    // Single clip export (fast path)
    if (videoClips.length === 1) {
      const clip = videoClips[0];
      const startSec = ((clip.sourceStart || 0)).toFixed(3);
      const durSec = (clip.durationFrames / fps).toFixed(3);

      const args = ['-y', '-hide_banner'];

      // Input
      if (parseFloat(startSec) > 0) args.push('-ss', startSec);
      args.push('-i', clip.localPath);
      if (parseFloat(durSec) > 0) args.push('-t', durSec);

      // Add separate audio files
      const separateAudio = audioClips.filter(a => a.clipId !== clip.clipId);
      separateAudio.forEach(a => {
        args.push('-i', a.localPath);
      });

      // Video filters
      const vf = [];
      if (ow !== projectWidth || oh !== projectHeight || ow !== clip.width || oh !== clip.height) {
        vf.push(`scale=${ow}:${oh}:flags=lanczos:force_original_aspect_ratio=decrease`);
        vf.push(`pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:black`);
      }
      if (clip.speed && clip.speed !== 1) {
        vf.push(`setpts=${(1/clip.speed).toFixed(4)}*PTS`);
      }
      if (vf.length > 0) args.push('-vf', vf.join(','));

      // Audio
      if (format === 'gif') {
        args.push('-an');
      } else if (includeAudio && !clip.muted) {
        const af = [];
        // Volume: envelope takes priority over flat volume
        const envFilter = clip.volumeEnvelope ? envelopeToVolumeFilter(clip.volumeEnvelope, parseFloat(durSec)) : null;
        if (envFilter) {
          af.push(envFilter);
        } else if (clip.volume !== undefined && clip.volume !== 100) {
          af.push(`volume=${(clip.volume/100).toFixed(2)}`);
        }
        if (clip.speed && clip.speed !== 1) af.push(`atempo=${Math.max(0.5, Math.min(2, clip.speed))}`);
        if (clip.fadeIn > 0) af.push(`afade=t=in:st=0:d=${(clip.fadeIn/fps).toFixed(2)}`);
        if (clip.fadeOut > 0) {
          const fadeStart = Math.max(0, parseFloat(durSec) - clip.fadeOut/fps);
          af.push(`afade=t=out:st=${fadeStart.toFixed(2)}:d=${(clip.fadeOut/fps).toFixed(2)}`);
        }
        if (af.length > 0) args.push('-af', af.join(','));
      } else {
        args.push('-an');
      }

      // Codec
      if (format === 'mp4') {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf));
        args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart');
        if (includeAudio && !clip.muted && format !== 'gif') args.push('-c:a', 'aac', '-b:a', '192k');
      } else if (format === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0');
        if (includeAudio && !clip.muted) args.push('-c:a', 'libopus', '-b:a', '128k');
      } else if (format === 'gif') {
        // Override everything for GIF
        args.length = 0;
        args.push('-y', '-hide_banner');
        if (parseFloat(startSec) > 0) args.push('-ss', startSec);
        args.push('-i', clip.localPath);
        if (parseFloat(durSec) > 0) args.push('-t', durSec);
        const gifW = Math.min(ow, 640);
        args.push('-vf', `fps=${Math.min(fps,15)},scale=${gifW}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
      }

      args.push(outputPath);

      console.log(`  FFmpeg: ${args.join(' ').substring(0, 200)}...`);
      sendProgress({ status: 'encoding', progress: 5, message: `Encoding ${ow}x${oh} ${format.toUpperCase()}...` });

      const totalFrames = Math.round(parseFloat(durSec) * fps);
      const ffProcess = spawn(FFMPEG, args);
      let stderrLog = '';
      let lastPct = 0;

      ffProcess.stderr.on('data', (data) => {
        const line = data.toString();
        stderrLog += line;
        const frameMatch = line.match(/frame=\s*(\d+)/);
        if (frameMatch) {
          const frame = parseInt(frameMatch[1]);
          const pct = totalFrames > 0 ? Math.min(99, Math.round((frame / totalFrames) * 100)) : 50;
          if (pct > lastPct) {
            lastPct = pct;
            sendProgress({ status: 'encoding', progress: pct, message: `Encoding: ${pct}% (${frame}/${totalFrames}f)` });
          }
        }
      });

      await new Promise((resolve, reject) => {
        ffProcess.on('close', (code) => {
          if (code === 0) resolve();
          else {
            console.log('  FFmpeg stderr:', stderrLog.slice(-500));
            reject(new Error(`FFmpeg exit code ${code}`));
          }
        });
        ffProcess.on('error', reject);
      });

      const stats = fs.statSync(outputPath);
      const sizeMB = (stats.size / 1048576).toFixed(1);

      sendProgress({ status: 'complete', progress: 100, message: `Complete! ${sizeMB}MB`, filePath: outputPath });
      console.log(`  Done: ${outputPath} (${sizeMB}MB)`);

      return res.json({ success: true, filePath: outputPath, sizeMB: parseFloat(sizeMB), resolution: `${ow}x${oh}` });
    }

    // Multi-clip: concat approach
    if (videoClips.length > 1) {
      sendProgress({ status: 'encoding', progress: 5, message: `Multi-clip export (${videoClips.length} clips)...` });

      // Sort by startFrame
      const sorted = [...videoClips].sort((a, b) => a.startFrame - b.startFrame);
      const concatList = path.join(TEMP_DIR, 'concat.txt');
      const lines = sorted.map(c => `file '${c.localPath.replace(/\\/g, '/')}'`);
      fs.writeFileSync(concatList, lines.join('\n'), 'utf8');

      const args = ['-y', '-hide_banner', '-f', 'concat', '-safe', '0', '-i', concatList];
      const vf = [];
      if (ow !== projectWidth || oh !== projectHeight) {
        vf.push(`scale=${ow}:${oh}:flags=lanczos:force_original_aspect_ratio=decrease`);
        vf.push(`pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:black`);
      }
      if (vf.length > 0) args.push('-vf', vf.join(','));

      if (format === 'mp4') {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
        if (includeAudio) args.push('-c:a', 'aac', '-b:a', '192k');
        else args.push('-an');
      } else if (format === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0');
        if (includeAudio) args.push('-c:a', 'libopus', '-b:a', '128k');
        else args.push('-an');
      }
      args.push(outputPath);

      const ffProcess = spawn(FFMPEG, args);
      let lastPct2 = 0;
      ffProcess.stderr.on('data', (data) => {
        const line = data.toString();
        const m = line.match(/frame=\s*(\d+)/);
        if (m) {
          const pct = Math.min(99, parseInt(m[1]) % 100);
          if (pct > lastPct2) { lastPct2 = pct; sendProgress({ status: 'encoding', progress: pct, message: `Encoding: ${pct}%` }); }
        }
      });

      await new Promise((resolve, reject) => {
        ffProcess.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}`)));
        ffProcess.on('error', reject);
      });

      const stats = fs.statSync(outputPath);
      const sizeMB = (stats.size / 1048576).toFixed(1);
      sendProgress({ status: 'complete', progress: 100, message: `Complete! ${sizeMB}MB`, filePath: outputPath });
      return res.json({ success: true, filePath: outputPath, sizeMB: parseFloat(sizeMB), resolution: `${ow}x${oh}` });
    }

  } catch (err) {
    console.log('  Export error:', err.message);
    sendProgress({ status: 'error', message: err.message });
    return res.json({ success: false, error: err.message });
  }
});

// Serve output files
app.use('/output', express.static(OUTPUT_DIR));

// Open output folder
app.get('/api/open-output', (req, res) => {
  exec(`explorer "${OUTPUT_DIR}"`);
  res.json({ success: true });
});

const PORT = 3456;
app.listen(PORT, () => {
  console.log('');
  console.log('  FlowCut Export Server');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  FFmpeg: ${FFMPEG}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Media:  ${MEDIA_DIR}`);
  console.log('');
});