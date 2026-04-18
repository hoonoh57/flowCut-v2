import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { theme } from '../../styles/theme';
import { getClipLocalPath } from '../../utils/mediaResolver';

type ExportFormat = 'mp4' | 'webm' | 'gif';
type QualityLevel = 'original' | 'high' | 'medium' | 'low';

interface SizePreset { label: string; desc: string; width: number; height: number; key: string; }

const SIZE_PRESETS: SizePreset[] = [
  { key: 'hd', label: 'HD', desc: '1280x720', width: 1280, height: 720 },
  { key: 'fhd', label: 'Full HD', desc: '1920x1080', width: 1920, height: 1080 },
  { key: '2k', label: '2K', desc: '2560x1440', width: 2560, height: 1440 },
  { key: '4k', label: '4K', desc: '3840x2160', width: 3840, height: 2160 },
  { key: 'ig', label: 'Instagram', desc: '1080x1080', width: 1080, height: 1080 },
  { key: 'reel', label: 'Reels', desc: '1080x1920', width: 1080, height: 1920 },
];

const QUALITY_LABELS: Record<QualityLevel, string> = {
  original: '원본 품질 (최고, 큰 파일)',
  high: '고품질 (우수)',
  medium: '표준 (권장)',
  low: '경량 (작은 파일)',
};

const SERVER_URL = 'http://localhost:3456';

export const ExportPanel: React.FC = () => {
  const clips = useEditorStore(s => s.clips);
  const mediaItems = useEditorStore(s => s.mediaItems);
  const fps = useEditorStore(s => s.fps);
  const pw = useEditorStore(s => s.projectWidth);
  const ph = useEditorStore(s => s.projectHeight);
  const isExporting = useEditorStore(s => s.isExporting);
  const exportProgress = useEditorStore(s => s.exportProgress);
  const exportLog = useEditorStore(s => s.exportLog);
  const setIsExporting = useEditorStore(s => s.setIsExporting);
  const setExportProgress = useEditorStore(s => s.setExportProgress);
  const addExportLog = useEditorStore(s => s.addExportLog);
  const clearExportLog = useEditorStore(s => s.clearExportLog);

  const [sizeMode, setSizeMode] = useState<'original' | 'preset' | 'custom'>('original');
  const [selectedPreset, setSelectedPreset] = useState('fhd');
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [lockRatio, setLockRatio] = useState(true);
  const [quality, setQuality] = useState<QualityLevel>('medium');
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [fileName, setFileName] = useState('flowcut_export');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [serverOnline, setServerOnline] = useState(false);
  const [resultPath, setResultPath] = useState('');

  const maxFrame = clips.reduce((mx, c) => Math.max(mx, c.startFrame + c.durationFrames), 0);
  const durationSec = maxFrame / fps;

  // Check server
  useEffect(() => {
    fetch(`${SERVER_URL}/api/progress`, { method: 'GET', signal: AbortSignal.timeout(2000) })
      .then(() => setServerOnline(true))
      .catch(() => setServerOnline(false));
  }, []);

  const getOutputSize = () => {
    if (sizeMode === 'original') return { w: pw, h: ph };
    if (sizeMode === 'preset') {
      const p = SIZE_PRESETS.find(s => s.key === selectedPreset);
      return p ? { w: p.width, h: p.height } : { w: pw, h: ph };
    }
    return { w: customW, h: customH };
  };

  const outputSize = getOutputSize();
  const isUpscale = outputSize.w !== pw || outputSize.h !== ph;
  const handleCustomW = (v: number) => { setCustomW(v); if (lockRatio && pw > 0) setCustomH(Math.round(v * (ph / pw))); };
  const handleCustomH = (v: number) => { setCustomH(v); if (lockRatio && ph > 0) setCustomW(Math.round(v * (pw / ph))); };
  const audioClipCount = clips.filter(c => (c.type === 'video' || c.type === 'audio') && !c.muted).length;

  // Local FFmpeg export
  const startLocalExport = async () => {
    if (maxFrame === 0) return;
    clearExportLog(); setIsExporting(true); setExportProgress(0); setResultPath('');
    const out = getOutputSize();

    addExportLog('=== 로컬 FFmpeg 내보내기 ===');
    addExportLog(`출력: ${out.w}x${out.h} | ${fps}fps | ${format.toUpperCase()}`);

    // Listen for SSE progress
    const evtSource = new EventSource(`${SERVER_URL}/api/progress`);
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.progress !== undefined) setExportProgress(data.progress);
        if (data.message) { setStatusMsg(data.message); addExportLog(data.message); }
        if (data.status === 'complete') {
          setExportProgress(100);
          if (data.filePath) setResultPath(data.filePath);
          evtSource.close();
        }
        if (data.status === 'error') { evtSource.close(); }
      } catch {}
    };

    try {
      // Build input file info - find local paths from src (blob URLs won't work, need original paths)
      const inputFiles = clips
        .filter(c => c.type === 'video' || c.type === 'audio' || c.type === 'image')
        .map(c => ({
          clipId: c.id,
          type: c.type,
          localPath: getClipLocalPath(c, mediaItems),
          startFrame: c.startFrame,
          durationFrames: c.durationFrames,
          volume: c.volume,
          speed: c.speed,
          muted: c.muted,
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
          volumeEnvelope: c.volumeEnvelope || null,
          x: c.x,
          y: c.y,
          clipWidth: c.width,
          clipHeight: c.height,
          opacity: c.opacity,
          trackId: c.trackId,
        }));

      const resp = await fetch(`${SERVER_URL}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputFiles,
          projectWidth: pw,
          projectHeight: ph,
          fps,
          format,
          quality,
          outputWidth: out.w,
          outputHeight: out.h,
          fileName,
          includeAudio,
        }),
      });

      const result = await resp.json();
      if (result.success) {
        addExportLog(`=== 완료! ${result.sizeMB}MB (${result.resolution}) ===`);
        addExportLog(`파일: ${result.filePath}`);
        setStatusMsg(`완료! ${result.sizeMB}MB`);
        setResultPath(result.filePath);
      } else {
        addExportLog(`오류: ${result.error}`);
        setStatusMsg('오류 발생');
      }
    } catch (err: any) {
      addExportLog(`서버 연결 실패: ${err.message}`);
      setStatusMsg('서버 연결 실패');
    }

    evtSource.close();
    setIsExporting(false);
  };

  const openOutputFolder = () => {
    fetch(`${SERVER_URL}/api/open-output`).catch(() => {});
  };

  // Styles
  const card: React.CSSProperties = { padding: 10, borderRadius: 6, background: theme.colors.bg.elevated, marginBottom: 2 };
  const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: theme.colors.text.primary, marginBottom: 8 };
  const radioLbl = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
    background: active ? theme.colors.accent.blue + '20' : 'transparent',
    border: active ? `1px solid ${theme.colors.accent.blue}` : '1px solid transparent',
    fontSize: 12, color: active ? theme.colors.accent.blue : theme.colors.text.secondary,
  });
  const presetBtn = (a: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 6, border: 'none',
    background: a ? theme.colors.accent.blue : theme.colors.bg.tertiary,
    color: a ? '#fff' : theme.colors.text.secondary, cursor: 'pointer', fontSize: 11, fontWeight: 600,
  });
  const inp: React.CSSProperties = {
    padding: '5px 8px', borderRadius: 6, background: theme.colors.bg.tertiary,
    color: theme.colors.text.primary, border: `1px solid ${theme.colors.border.default}`, fontSize: 12, outline: 'none', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 2px' }}>
      {/* Info */}
      <div style={{ fontSize: 10, color: theme.colors.text.muted, padding: '6px 0', borderBottom: `1px solid ${theme.colors.border.subtle}` }}>
        {pw}x{ph} | {fps}fps | {durationSec.toFixed(1)}s | {maxFrame}f
      </div>

      {/* Server status */}
      <div style={{
        padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: serverOnline ? '#10b98115' : '#ef444415',
        color: serverOnline ? '#10b981' : '#ef4444',
        border: `1px solid ${serverOnline ? '#10b98140' : '#ef444440'}`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: serverOnline ? '#10b981' : '#ef4444' }} />
        {serverOnline ? '로컬 FFmpeg 서버 연결됨 (초고속)' : '서버 미연결 — node server/server.js 실행 필요'}
      </div>

      {/* SIZE */}
      <div style={card}>
        <div style={secTitle}>📐 출력 사이즈</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={radioLbl(sizeMode === 'original')}>
            <input type="radio" name="sz" checked={sizeMode === 'original'} onChange={() => setSizeMode('original')} />
            <div><div style={{ fontWeight: 600 }}>원본 크기</div><div style={{ fontSize: 10, color: theme.colors.text.muted }}>{pw}x{ph}</div></div>
          </label>
          <label style={radioLbl(sizeMode === 'preset')}>
            <input type="radio" name="sz" checked={sizeMode === 'preset'} onChange={() => setSizeMode('preset')} />
            <div style={{ fontWeight: 600 }}>프리셋 사이즈</div>
          </label>
          {sizeMode === 'preset' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 24, paddingBottom: 4 }}>
              {SIZE_PRESETS.map(p => (
                <button key={p.key} onClick={() => setSelectedPreset(p.key)} style={presetBtn(selectedPreset === p.key)}>
                  <div>{p.label}</div><div style={{ fontSize: 9, opacity: 0.7 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          )}
          <label style={radioLbl(sizeMode === 'custom')}>
            <input type="radio" name="sz" checked={sizeMode === 'custom'} onChange={() => setSizeMode('custom')} />
            <div style={{ fontWeight: 600 }}>자유 크기</div>
          </label>
          {sizeMode === 'custom' && (
            <div style={{ paddingLeft: 24, display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 4 }}>
              <input type="number" value={customW} onChange={e => handleCustomW(Number(e.target.value))} style={{ ...inp, width: 70 }} />
              <span style={{ color: theme.colors.text.muted }}>x</span>
              <input type="number" value={customH} onChange={e => handleCustomH(Number(e.target.value))} style={{ ...inp, width: 70 }} />
              <button onClick={() => setLockRatio(!lockRatio)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: lockRatio ? theme.colors.accent.blue : theme.colors.text.muted }}>
                {lockRatio ? '🔗' : '🔓'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* QUALITY */}
      <div style={card}>
        <div style={secTitle}>🎨 품질</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['original', 'high', 'medium', 'low'] as QualityLevel[]).map(q => (
            <label key={q} style={radioLbl(quality === q)}>
              <input type="radio" name="q" checked={quality === q} onChange={() => setQuality(q)} />
              <span>{QUALITY_LABELS[q]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* FORMAT */}
      <div style={card}>
        <div style={secTitle}>📦 포맷</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['mp4', 'MP4'], ['webm', 'WebM'], ['gif', 'GIF']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFormat(k)} style={presetBtn(format === k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* AUDIO */}
      {format !== 'gif' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={secTitle}>🔊 오디오</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: theme.colors.text.secondary }}>
              <input type="checkbox" checked={includeAudio} onChange={e => setIncludeAudio(e.target.checked)} />
              포함 ({audioClipCount}개 클립)
            </label>
          </div>
        </div>
      )}

      {/* FILENAME */}
      <div style={card}>
        <div style={secTitle}>📝 파일명</div>
        <input value={fileName} onChange={e => setFileName(e.target.value)} style={inp} />
      </div>

      {/* Summary */}
      <div style={{
        padding: '8px 10px', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 600,
        background: isUpscale ? theme.colors.accent.blue + '15' : theme.colors.bg.tertiary,
        color: isUpscale ? theme.colors.accent.blue : theme.colors.text.secondary,
      }}>
        {isUpscale ? `${pw}x${ph} → ${outputSize.w}x${outputSize.h} (Lanczos 업스케일)` : `${pw}x${ph} (원본 크기)`}
        {includeAudio && format !== 'gif' && audioClipCount > 0 && ' + 오디오'}
      </div>

      {/* EXPORT BUTTON */}
      {!isExporting ? (
        <button onClick={startLocalExport} disabled={maxFrame === 0 || !serverOnline} style={{
          padding: 14, borderRadius: 8, border: 'none',
          background: (maxFrame === 0 || !serverOnline) ? theme.colors.bg.elevated : `linear-gradient(135deg, #10b981, #059669)`,
          color: '#fff', cursor: (maxFrame === 0 || !serverOnline) ? 'not-allowed' : 'pointer',
          fontSize: 14, fontWeight: 700, opacity: (maxFrame === 0 || !serverOnline) ? 0.5 : 1,
        }}>
          ⚡ 로컬 FFmpeg 내보내기
        </button>
      ) : (
        <button onClick={() => setIsExporting(false)} style={{
          padding: 14, borderRadius: 8, border: 'none', background: theme.colors.accent.red,
          color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
        }}>
          ⛔ 취소
        </button>
      )}

      {/* PROGRESS */}
      {(isExporting || exportProgress > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ width: '100%', height: 10, borderRadius: 5, background: theme.colors.bg.elevated, overflow: 'hidden' }}>
            <div style={{
              width: `${exportProgress}%`, height: '100%', borderRadius: 5,
              background: exportProgress === 100 ? '#10b981' : `linear-gradient(90deg, #10b981, #059669)`,
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: theme.colors.text.secondary, textAlign: 'center' }}>{statusMsg} ({exportProgress}%)</div>
        </div>
      )}

      {/* Result */}
      {resultPath && (
        <div style={{ padding: 8, borderRadius: 6, background: '#10b98115', border: '1px solid #10b98140' }}>
          <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginBottom: 4 }}>✅ 내보내기 완료</div>
          <div style={{ fontSize: 10, color: theme.colors.text.secondary, wordBreak: 'break-all' }}>{resultPath}</div>
          <button onClick={openOutputFolder} style={{
            marginTop: 6, padding: '6px 12px', borderRadius: 4, border: 'none',
            background: theme.colors.bg.tertiary, color: theme.colors.text.primary,
            cursor: 'pointer', fontSize: 11,
          }}>
            📁 출력 폴더 열기
          </button>
        </div>
      )}

      {/* LOG */}
      {exportLog.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: 'auto', padding: 8, borderRadius: 6, background: theme.colors.bg.tertiary, fontSize: 10, lineHeight: 1.6, fontFamily: 'monospace' }}>
          {exportLog.map((l, i) => (
            <div key={i} style={{ color: l.includes('완료') || l.includes('✓') ? '#10b981' : l.includes('오류') ? '#ef4444' : theme.colors.text.secondary }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
};