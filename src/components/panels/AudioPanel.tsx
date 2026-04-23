import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { UpdateClipCommand } from '../../stores/commands/UpdateClipCommand';
import { AddClipCommand } from '../../stores/commands/AddClipCommand';
import { AddTrackCommand } from '../../stores/commands/AddTrackCommand';
import { createDefaultClip } from '../../types/clip';
import { uid } from '../../utils/uid';
import { findNextAvailableFrame } from '../../engines/CollisionEngine';
import { theme } from '../../styles/theme';
import type { VolumePoint } from '../../types/clip';
import type { Track } from '../../types/track';

/* ── Voice Presets ── */
const VOICE_PRESETS = [
  { id: 'ko-KR-SunHiNeural', label: '선희 (여, 한국어)', lang: 'ko' },
  { id: 'ko-KR-InJoonNeural', label: '인준 (남, 한국어)', lang: 'ko' },
  { id: 'ko-KR-HyunsuNeural', label: '현수 (남, 한국어)', lang: 'ko' },
  { id: 'en-US-JennyNeural', label: 'Jenny (F, English)', lang: 'en' },
  { id: 'en-US-GuyNeural', label: 'Guy (M, English)', lang: 'en' },
  { id: 'en-US-AriaNeural', label: 'Aria (F, English)', lang: 'en' },
  { id: 'ja-JP-NanamiNeural', label: 'Nanami (F, 日本語)', lang: 'ja' },
  { id: 'ja-JP-KeitaNeural', label: 'Keita (M, 日本語)', lang: 'ja' },
  { id: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao (F, 中文)', lang: 'zh' },
  { id: 'zh-CN-YunxiNeural', label: 'Yunxi (M, 中文)', lang: 'zh' },
];

const AUDIO_PRESETS = [
  { id: 'A01', name: 'Fade In', icon: '🔊', apply: { fadeIn: 30 } },
  { id: 'A02', name: 'Fade Out', icon: '🔉', apply: { fadeOut: 30 } },
  { id: 'A03', name: 'Fade Both', icon: '🔈', apply: { fadeIn: 20, fadeOut: 20 } },
  { id: 'A04', name: 'Mute', icon: '🔇', apply: { muted: true } },
  { id: 'A05', name: '50%', icon: '🔉', apply: { volume: 50 } },
  { id: 'A06', name: '150%', icon: '🔊', apply: { volume: 150 } },
  { id: 'A07', name: '200%', icon: '💥', apply: { volume: 200 } },
  { id: 'A08', name: '0.5x', icon: '🐢', apply: { speed: 0.5 } },
  { id: 'A09', name: '2x', icon: '⚡', apply: { speed: 2 } },
  { id: 'A10', name: 'Dramatic', icon: '🎭', apply: {
    volumeEnvelope: [{ position: 0, volume: 20 }, { position: 0.3, volume: 100 }, { position: 0.7, volume: 150 }, { position: 1, volume: 30 }]
  }},
  { id: 'A11', name: 'Swell', icon: '🌊', apply: {
    volumeEnvelope: [{ position: 0, volume: 10 }, { position: 0.5, volume: 60 }, { position: 0.85, volume: 150 }, { position: 1, volume: 100 }]
  }},
  { id: 'A12', name: 'Dip', icon: '🕳️', apply: {
    volumeEnvelope: [{ position: 0, volume: 100 }, { position: 0.35, volume: 20 }, { position: 0.65, volume: 20 }, { position: 1, volume: 100 }]
  }},
  { id: 'A13', name: 'Pulse', icon: '💓', apply: {
    volumeEnvelope: [{ position: 0, volume: 100 }, { position: 0.15, volume: 30 }, { position: 0.3, volume: 100 }, { position: 0.45, volume: 30 }, { position: 0.6, volume: 100 }, { position: 0.75, volume: 30 }, { position: 0.9, volume: 100 }, { position: 1, volume: 60 }]
  }},
];

export const AudioPanel: React.FC = () => {
  const selectedClipIds = useEditorStore(s => s.selectedClipIds);
  const clips = useEditorStore(s => s.clips);
  const dispatch = useEditorStore(s => s.dispatch);
  const tracks = useEditorStore(s => s.tracks);
  const fps = useEditorStore(s => s.fps);
  const addMediaItem = useEditorStore(s => s.addMediaItem);

  const selectedClip = clips.find(c => c.id === selectedClipIds[0]);
  const audioClips = clips.filter(c => c.type === 'audio' || c.type === 'video');
  const isMedia = selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'audio');

  /* ── TTS State ── */
  const [ttsText, setTtsText] = useState('');
  const [ttsVoice, setTtsVoice] = useState('ko-KR-SunHiNeural');
  const [ttsLang, setTtsLang] = useState('ko');
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsStatus, setTtsStatus] = useState('');
  const [ttsHealth, setTtsHealth] = useState<boolean | null>(null);

  /* ── BGM State ── */
  const [bgmPresets, setBgmPresets] = useState<any[]>([]);
  const [bgmSelected, setBgmSelected] = useState('ambient-calm');
  const [bgmDuration, setBgmDuration] = useState(15);
  const [bgmVolume, setBgmVolume] = useState(40);
  const [bgmDucking, setBgmDucking] = useState(true);
  const [bgmDuckLevel, setBgmDuckLevel] = useState(25);
  const [bgmLoading, setBgmLoading] = useState(false);
  const [bgmStatus, setBgmStatus] = useState('');

  /* ── Load BGM library on mount ── */
  useEffect(() => {
    fetch('http://localhost:3456/api/bgm/library')
      .then(r => r.json())
      .then(d => { if (d.success) setBgmPresets(d.items); })
      .catch(() => {});
  }, []);

  /* ── Auto-calc BGM duration from timeline ── */
  useEffect(() => {
    if (clips.length > 0) {
      const maxFrame = clips.reduce((mx, c) => Math.max(mx, c.startFrame + c.durationFrames), 0);
      const fps = 30;
      const totalSec = Math.ceil(maxFrame / fps);
      if (totalSec > 0) setBgmDuration(totalSec);
    }
  }, [clips]);

  /* ── Generate BGM ── */
  const handleGenerateBGM = async () => {
    setBgmLoading(true);
    setBgmStatus('BGM 생성 중...');
    try {
      const resp = await fetch('http://localhost:3456/api/bgm/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bgmId: bgmSelected, duration: bgmDuration, volume: bgmVolume,
          fadeIn: 2, fadeOut: 3,
          duckingEnabled: bgmDucking, duckingLevel: bgmDuckLevel,
        }),
      });
      const data = await resp.json();
      if (!data.success) { setBgmStatus('생성 실패: ' + (data.error || 'unknown')); setBgmLoading(false); return; }

      const mediaId = 'bgm_' + Date.now();
      const store = useEditorStore.getState();
      store.addMediaItem({
        id: mediaId, name: 'BGM: ' + (data.preset || bgmSelected),
        type: 'audio', url: data.serverUrl, localPath: data.localPath,
        duration: data.duration || bgmDuration, size: 0,
      });

      let bgmTrack = store.tracks.find(t => t.name?.includes('BGM') || (t.type === 'audio' && t.id === 'bgm1'));
      if (!bgmTrack) {
        const newTrack = {
          id: 'bgm1', name: 'BGM', type: 'audio' as const,
          order: 50, height: 50, color: '#a855f7',
          locked: false, visible: true, muted: false, solo: false,
        };
        store.dispatch(new AddTrackCommand(newTrack));
        bgmTrack = newTrack;
      }

      const clip = createDefaultClip({
        id: 'bgm_clip_' + Date.now(), name: 'BGM: ' + (data.preset || bgmSelected),
        type: 'audio', trackId: bgmTrack.id, startFrame: 0,
        durationFrames: Math.round((data.duration || bgmDuration) * 30),
        src: data.serverUrl, mediaId, localPath: data.localPath,
        volume: bgmDucking ? bgmDuckLevel : bgmVolume, muted: false, speed: 1,
      });
      store.dispatch(new AddClipCommand(clip, false));

      setBgmStatus('완료! ' + data.duration + '초 ' + (data.preset || '') + ' (' + (data.sizeMB || '?') + 'MB)');
    } catch (err: any) {
      setBgmStatus('서버 연결 실패: ' + err.message);
    }
    setBgmLoading(false);
  };

  /* ── Check TTS server health on mount ── */
  useEffect(() => {
    fetch('http://localhost:3456/api/health')
      .then(r => r.json())
      .then(d => setTtsHealth(d.ok === true))
      .catch(() => setTtsHealth(false));
  }, []);

  /* ── Sync language when voice changes ── */
  const handleVoiceChange = (voiceId: string) => {
    setTtsVoice(voiceId);
    const preset = VOICE_PRESETS.find(v => v.id === voiceId);
    if (preset) setTtsLang(preset.lang);
  };

  /* ── Generate TTS ── */
  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) { setTtsStatus('텍스트를 입력하세요'); return; }
    setTtsLoading(true);
    setTtsStatus('음성 생성 중...');
    try {
      const resp = await fetch('http://localhost:3456/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText, language: ttsLang, voice: ttsVoice }),
      });
      const data = await resp.json();
      if (!data.success) {
        setTtsStatus('생성 실패: ' + (data.error || 'unknown'));
        setTtsLoading(false);
        return;
      }

      /* Add to media library */
      const mediaId = 'tts_' + uid();
      const serverUrl = data.serverUrl || ('http://localhost:3456' + data.servePath);
      const duration = data.duration || 5;
      addMediaItem({
        id: mediaId,
        name: 'TTS: ' + ttsText.substring(0, 25) + (ttsText.length > 25 ? '...' : ''),
        type: 'audio',
        url: serverUrl,
        localPath: data.localPath || '',
        duration: duration,
        size: 0,
      });

      /* Ensure audio track exists */
      let audioTrack = tracks.find(t => t.type === 'audio');
      if (!audioTrack) {
        const newTrack: Track = {
          id: 'a1', name: '오디오 a1', type: 'audio', order: 100,
          height: 60, color: theme.colors.track.audio,
          locked: false, visible: true, muted: false, solo: false,
        };
        dispatch(new AddTrackCommand(newTrack));
        audioTrack = newTrack;
      }

      /* Add clip to timeline */
      const startFrame = findNextAvailableFrame(audioTrack.id, clips);
      const durationFrames = Math.round(duration * fps);
      const clip = createDefaultClip({
        id: uid(),
        name: 'TTS: ' + ttsText.substring(0, 20),
        type: 'audio',
        trackId: audioTrack.id,
        startFrame,
        durationFrames,
        src: serverUrl,
        mediaId,
        localPath: data.localPath || '',
        volume: 100,
        muted: false,
      });
      dispatch(new AddClipCommand(clip));

      setTtsStatus('생성 완료! ' + duration.toFixed(1) + '초 (' + (data.rate || '') + ')');
      setTtsText('');
    } catch (err: any) {
      setTtsStatus('서버 연결 실패: ' + err.message);
    }
    setTtsLoading(false);
  };

  const applyPreset = (preset: typeof AUDIO_PRESETS[0]) => {
    if (!selectedClip) return;
    dispatch(new UpdateClipCommand(selectedClip.id, preset.apply));
  };

  const resetEnvelope = () => {
    if (!selectedClip) return;
    dispatch(new UpdateClipCommand(selectedClip.id, {
      volumeEnvelope: [{ position: 0, volume: 100 }, { position: 1, volume: 100 }],
      fadeIn: 0, fadeOut: 0, volume: 100, muted: false, speed: 1,
    }));
  };

  const presetBtn = (active?: boolean): React.CSSProperties => ({
    padding: '6px 8px', borderRadius: 6, border: 'none',
    background: active ? theme.colors.accent.blue : theme.colors.bg.tertiary,
    color: active ? '#fff' : theme.colors.text.secondary,
    cursor: 'pointer', fontSize: 10, fontWeight: 600, textAlign: 'center' as const,
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, minWidth: 52,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ════════════ TTS 음성 생성 ════════════ */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
        borderRadius: 8, background: theme.colors.bg.elevated,
        border: '1px solid ' + theme.colors.accent.green + '44',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: theme.colors.accent.green, fontWeight: 700 }}>
            🎙️ TTS 음성 생성
          </div>
          <div style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 4,
            background: ttsHealth === true ? theme.colors.accent.green + '22' : ttsHealth === false ? theme.colors.accent.red + '22' : theme.colors.bg.tertiary,
            color: ttsHealth === true ? theme.colors.accent.green : ttsHealth === false ? theme.colors.accent.red : theme.colors.text.muted,
          }}>
            {ttsHealth === true ? '서버 연결됨' : ttsHealth === false ? '서버 미연결' : '확인 중...'}
          </div>
        </div>

        {/* Voice selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: theme.colors.text.muted, width: 36, flexShrink: 0 }}>보이스</span>
          <select value={ttsVoice} onChange={e => handleVoiceChange(e.target.value)} style={{
            flex: 1, padding: '4px 6px', fontSize: 11,
            background: theme.colors.bg.secondary, color: theme.colors.text.primary,
            border: '1px solid ' + theme.colors.border.default, borderRadius: 4, outline: 'none',
          }}>
            {VOICE_PRESETS.map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Text input */}
        <textarea
          value={ttsText}
          onChange={e => setTtsText(e.target.value)}
          placeholder="음성으로 변환할 텍스트를 입력하세요..."
          rows={3}
          style={{
            width: '100%', padding: 8, fontSize: 12, resize: 'vertical',
            background: theme.colors.bg.secondary, color: theme.colors.text.primary,
            border: '1px solid ' + theme.colors.border.default, borderRadius: 4,
            outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
            boxSizing: 'border-box',
          }}
        />

        {/* Character count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: theme.colors.text.muted }}>
            {ttsText.length}자 {ttsText.length > 200 ? '(자동 문장 분할)' : ''}
          </span>
          {ttsStatus && (
            <span style={{
              fontSize: 9, color: ttsStatus.includes('실패') || ttsStatus.includes('연결')
                ? theme.colors.accent.red
                : ttsStatus.includes('완료') ? theme.colors.accent.green : theme.colors.accent.amber,
            }}>
              {ttsStatus}
            </span>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerateTTS}
          disabled={ttsLoading || !ttsText.trim() || ttsHealth === false}
          style={{
            padding: '8px 0', borderRadius: 6, border: 'none', cursor: ttsLoading ? 'wait' : 'pointer',
            background: ttsLoading ? theme.colors.bg.tertiary : theme.colors.accent.green,
            color: '#fff', fontSize: 12, fontWeight: 700,
            opacity: (!ttsText.trim() || ttsHealth === false) ? 0.4 : 1,
            transition: 'background 0.2s',
          }}
        >
          {ttsLoading ? '생성 중...' : '🎙️ 음성 생성 → 타임라인에 추가'}
        </button>

        {/* Quick tip */}
        <div style={{ fontSize: 9, color: theme.colors.text.muted, lineHeight: 1.4 }}>
          💡 텍스트 입력 → 보이스 선택 → 생성 버튼 클릭. 200자 초과 시 자동으로 문장 단위 분할 생성됩니다.
        </div>
      </div>

      {/* ════════════ Selected clip controls (기존 코드) ════════════ */}
            {/* ════════════ BGM 배경음악 ════════════ */}
      <div style={{
        border: `1px solid ${theme.colors.accent.purple + '44'}`, borderRadius: 8, padding: 10,
        background: theme.colors.bg.secondary,
      }}>
        <div style={{ fontSize: 12, color: '#a855f7', fontWeight: 700, marginBottom: 8 }}>
          🎵 BGM 배경음악
        </div>

        {/* Preset selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <select value={bgmSelected} onChange={e => setBgmSelected(e.target.value)} style={{
            flex: 1, padding: '5px 8px', borderRadius: 4, border: `1px solid ${theme.colors.border.primary}`,
            background: theme.colors.bg.tertiary, color: theme.colors.text.primary, fontSize: 11,
          }}>
            {bgmPresets.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.genre}, {p.bpm}bpm)</option>
            ))}
            {bgmPresets.length === 0 && <option value="ambient-calm">서버 연결 대기...</option>}
          </select>
        </div>

        {/* Duration + Volume */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 9, color: theme.colors.text.muted }}>길이 {bgmDuration}초</span>
            <input type="range" min={5} max={180} value={bgmDuration}
              onChange={e => setBgmDuration(Number(e.target.value))}
              style={{ width: '100%', height: 4 }} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 9, color: theme.colors.text.muted }}>볼륨 {bgmVolume}%</span>
            <input type="range" min={5} max={100} value={bgmVolume}
              onChange={e => setBgmVolume(Number(e.target.value))}
              style={{ width: '100%', height: 4 }} />
          </div>
        </div>

        {/* Ducking toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: theme.colors.text.secondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={bgmDucking} onChange={e => setBgmDucking(e.target.checked)} />
            나레이션 중 자동 덕킹
          </label>
          {bgmDucking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: theme.colors.text.muted }}>{bgmDuckLevel}%</span>
              <input type="range" min={5} max={50} value={bgmDuckLevel}
                onChange={e => setBgmDuckLevel(Number(e.target.value))}
                style={{ width: 60, height: 3 }} />
            </div>
          )}
        </div>

        {/* Generate button */}
        <button onClick={handleGenerateBGM} disabled={bgmLoading}
          style={{
            width: '100%', padding: '8px 0', borderRadius: 6, border: 'none', cursor: bgmLoading ? 'wait' : 'pointer',
            background: bgmLoading ? theme.colors.bg.tertiary : '#a855f7',
            color: '#fff', fontSize: 11, fontWeight: 600,
          }}>
          {bgmLoading ? '생성 중...' : '🎵 BGM 생성 → 타임라인에 추가'}
        </button>

        {bgmStatus && (
          <div style={{
            fontSize: 9, marginTop: 4, textAlign: 'center',
            color: bgmStatus.includes('실패') || bgmStatus.includes('연결') ? theme.colors.accent.red
              : bgmStatus.includes('완료') ? '#a855f7' : theme.colors.accent.amber,
          }}>{bgmStatus}</div>
        )}

        <div style={{ fontSize: 9, color: theme.colors.text.muted, lineHeight: 1.4, marginTop: 4 }}>
          💡 타임라인 길이에 맞춰 자동 조절 · 덕킹: TTS/나레이션 구간 자동 볼륨 감소
        </div>
      </div>
      {isMedia && selectedClip && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: theme.colors.bg.elevated, border: `1px solid ${theme.colors.border.subtle}` }}>
          <div style={{ fontSize: 12, color: theme.colors.text.primary, fontWeight: 600 }}>{selectedClip.name}</div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>볼륨</span>
            <input type="range" min={0} max={200} value={selectedClip.volume}
              onChange={e => { const v = Number(e.target.value); const env = selectedClip.volumeEnvelope && selectedClip.volumeEnvelope.length >= 2 ? selectedClip.volumeEnvelope.map((p: VolumePoint, i: number) => (i === 0 || i === selectedClip.volumeEnvelope!.length - 1) ? { ...p, volume: v } : p) : [{ position: 0, volume: v }, { position: 1, volume: v }]; dispatch(new UpdateClipCommand(selectedClip.id, { volume: v, volumeEnvelope: env })); }}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.volume}%</span>
          </div>

          {/* Mute */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>뮤트</span>
            <button onClick={() => dispatch(new UpdateClipCommand(selectedClip.id, { muted: !selectedClip.muted }))} style={{
              padding: '4px 12px', borderRadius: 4, background: selectedClip.muted ? theme.colors.accent.red : theme.colors.bg.tertiary,
              color: selectedClip.muted ? '#fff' : theme.colors.text.secondary, border: `1px solid ${theme.colors.border.default}`, cursor: 'pointer', fontSize: 10,
            }}>
              {selectedClip.muted ? '🔇 해제' : '🔊 뮤트'}
            </button>
          </div>

          {/* Speed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>속도</span>
            <input type="range" min={0.25} max={4} step={0.25} value={selectedClip.speed}
              onChange={e => dispatch(new UpdateClipCommand(selectedClip.id, { speed: Number(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.speed}x</span>
          </div>

          {/* Fade In */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>Fade In</span>
            <input type="range" min={0} max={Math.floor(selectedClip.durationFrames * 0.4)} value={selectedClip.fadeIn}
              onChange={e => dispatch(new UpdateClipCommand(selectedClip.id, { fadeIn: Number(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.fadeIn}f</span>
          </div>

          {/* Fade Out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 50, fontSize: 10, color: theme.colors.text.muted }}>Fade Out</span>
            <input type="range" min={0} max={Math.floor(selectedClip.durationFrames * 0.4)} value={selectedClip.fadeOut}
              onChange={e => dispatch(new UpdateClipCommand(selectedClip.id, { fadeOut: Number(e.target.value) }))}
              style={{ flex: 1 }} />
            <span style={{ width: 35, fontSize: 10, color: theme.colors.text.secondary, textAlign: 'right' }}>{selectedClip.fadeOut}f</span>
          </div>

          {/* Envelope info */}
          <div style={{ fontSize: 9, color: theme.colors.text.muted, padding: '4px 0', borderTop: `1px solid ${theme.colors.border.subtle}` }}>
            팁: 클립 선택 후 파형 영역을 더블클릭하여 볼륨 포인트 추가, 드래그로 조절, 우클릭으로 삭제
          </div>

          {/* Reset */}
          <button onClick={resetEnvelope} style={{
            padding: '6px', borderRadius: 4, border: `1px solid ${theme.colors.border.default}`,
            background: theme.colors.bg.tertiary, color: theme.colors.text.secondary, cursor: 'pointer', fontSize: 10,
          }}>
            초기화
          </button>
        </div>
      )}

      {/* Audio Effect Presets */}
      <div style={{ fontSize: 11, color: theme.colors.text.secondary, fontWeight: 600 }}>오디오 프리셋</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {AUDIO_PRESETS.map(p => (
          <button key={p.id} onClick={() => applyPreset(p)} disabled={!isMedia}
            style={{ ...presetBtn(), opacity: isMedia ? 1 : 0.4 }}>
            <span style={{ fontSize: 16 }}>{p.icon}</span>
            <span>{p.name}</span>
            <span style={{ fontSize: 8, color: theme.colors.text.muted }}>{p.id}</span>
          </button>
        ))}
      </div>

      {/* Mixer */}
      <div style={{ fontSize: 11, color: theme.colors.text.secondary, fontWeight: 600, marginTop: 4 }}>믹서</div>
      {audioClips.length === 0 && (
        <div style={{ color: theme.colors.text.muted, fontSize: 10, textAlign: 'center', paddingTop: 10 }}>오디오/비디오 클립이 없습니다</div>
      )}
      {audioClips.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, background: theme.colors.bg.tertiary }}>
          <span style={{ fontSize: 9, color: c.type === 'audio' ? theme.colors.track.audio : theme.colors.track.video, width: 10 }}>{'●'}</span>
          <span style={{ flex: 1, fontSize: 10, color: theme.colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
          <input type="range" min={0} max={200} value={c.volume}
            onChange={e => dispatch(new UpdateClipCommand(c.id, { volume: Number(e.target.value) }))}
            style={{ width: 50 }} />
          <span style={{ fontSize: 9, color: theme.colors.text.muted, width: 28, textAlign: 'right' }}>{c.volume}%</span>
          <button onClick={() => dispatch(new UpdateClipCommand(c.id, { muted: !c.muted }))} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: c.muted ? theme.colors.accent.red : theme.colors.text.muted,
          }}>{c.muted ? '🔇' : '🔊'}</button>
        </div>
      ))}

      {!isMedia && selectedClipIds.length > 0 && (
        <div style={{ fontSize: 10, color: theme.colors.text.muted, textAlign: 'center', paddingTop: 10 }}>
          비디오 또는 오디오 클립을 선택하세요
        </div>
      )}
    </div>
  );
};