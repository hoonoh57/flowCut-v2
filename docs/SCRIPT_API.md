# FlowScript API Reference

FlowCut의 모든 기능은 FlowScript JSON을 통해 스크립트로 실행 가능해야 합니다.
이 문서는 현재 구현 상태와 미구현 액션을 정의합니다.

## 설계 원칙

1. **모든 기능은 스크립트로 실행 가능** — UI 전용 기능 금지
2. **AI가 자유롭게 조합 가능** — 액션 간 의존성 최소화
3. **값 우선순위** — 스크립트 지정값 > editorStore > DEFAULT_PROJECT
4. **멱등성** — 같은 스크립트를 두 번 실행해도 동일한 결과

## FlowScript 구조

```json
{
  "version": "1.0",
  "project": { "width": 1920, "height": 1080, "fps": 30, "aspectPreset": "16:9" },
  "media": [ { "id": "m1", "type": "image", "src": "ai://prompt", "workflow": "image-to-video" } ],
  "tracks": [ { "id": "v1", "name": "Video", "type": "video" } ],
  "clips": [ { "id": "c1", "trackId": "v1", "mediaId": "m1", "startFrame": 0, "durationFrames": 60 } ],
  "actions": [ { "action": "export", "format": "mp4", "quality": "high" } ]
}
```

---

## 구현 완료 액션 (13개)

### 편집 액션

| Action | 설명 | 필수 파라미터 | 상태 |
|--------|------|---------------|------|
| `split` | 클립을 특정 프레임에서 분할 | clipId, frame | ✅ 완료 |
| `splitAll` | 해당 프레임의 모든 클립 분할 | frame | ✅ 완료 |
| `delete` | 클립 삭제 | clipIds[] | ✅ 완료 |
| `rippleDelete` | 클립 삭제 + 뒤 클립 앞으로 이동 | clipIds[] | ✅ 완료 |
| `group` | 여러 클립을 그룹화 | clipIds[] | ✅ 완료 |
| `setVolume` | 클립 볼륨 설정 | clipId, volume (0-200) | ✅ 완료 |
| `setSpeed` | 클립 재생속도 설정 | clipId, speed (0.1-10) | ✅ 완료 |
| `move` | 클립을 다른 트랙/프레임으로 이동 | clipId, toTrack, toFrame | ✅ 완료 |

### 출력 액션

| Action | 설명 | 필수 파라미터 | 상태 |
|--------|------|---------------|------|
| `export` | 프로젝트 내보내기 | format (mp4/webm/gif), quality | ✅ 완료 |
| `upload` | 플랫폼 업로드 | platform | ⚠️ 플레이스홀더 |

### AI 액션

| Action | 설명 | 필수 파라미터 | 상태 |
|--------|------|---------------|------|
| `autoSubtitle` | 자동 자막 생성 | language | ⚠️ 플레이스홀더 |
| `addText` | 텍스트 클립 추가 | text, trackId, startFrame, durationFrames | ✅ 완료 |
| `addAudio` | 오디오 클립 추가 | mediaId, trackId, startFrame | ✅ 완료 |

### 유틸리티 액션

| Action | 설명 | 필수 파라미터 | 상태 |
|--------|------|---------------|------|
| `wait` | 지정 시간 대기 | seconds | ✅ 완료 |
| `log` | 로그 메시지 출력 | message | ✅ 완료 |

---

## 미구현 액션 (16개) — 구현 로드맵

### P0 — 인프라 필수 (AI 활용의 전제조건)

| Action | 설명 | 파라미터 | 우선순위 |
|--------|------|----------|----------|
| `addClip` | 클립 직접 추가 | type, trackId, mediaId, startFrame, durationFrames | P0 |
| `setClipProperty` | 클립 개별 속성 변경 | clipId, property, value | P0 |
| `addTrack` | 트랙 추가 | id, name, type (video/audio/text) | P0 |
| `removeTrack` | 트랙 삭제 | trackId | P0 |
| `setProject` | 프로젝트 설정 변경 | width, height, fps, aspectPreset | P0 |
| `trim` | 클립 트리밍 | clipId, startFrame, endFrame | P0 |
| `duplicate` | 클립 복제 | clipId, toFrame? | P0 |

### P1 — AI 생성 기능

| Action | 설명 | 파라미터 | 우선순위 |
|--------|------|----------|----------|
| `generateImage` | AI 이미지 생성 | prompt, width, height, workflow?, outputMediaId | P1 |
| `generateVideo` | AI 비디오 생성 (i2v) | imageMediaId, prompt, width, height, outputMediaId | P1 |
| `generateTTS` | 텍스트→음성 생성 | text, language, voice?, outputMediaId | P1 |
| `generateBGM` | AI 배경음악 생성 | mood, duration, genre?, outputMediaId | P1 |
| `upscale` | 해상도 업스케일 | mediaId, scale (2x/4x), outputMediaId | P1 |

### P2 — 고급 편집

| Action | 설명 | 파라미터 | 우선순위 |
|--------|------|----------|----------|
| `transition` | 클립 간 전환 효과 | clipIdA, clipIdB, type (dissolve/wipe/slide), duration | P2 |
| `setCategory` | 카테고리 프리셋 적용 | category (education/anime/romance/action/wuxia/...) | P2 |
| `save` | 프로젝트 저장 | name, format (file/localStorage) | P2 |
| `undo` / `redo` | 실행취소/재실행 | count? | P2 |

---

## 서버 API 엔드포인트

### 구현 완료 (17개)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/upload` | 파일 업로드 |
| GET | `/api/progress` | SSE 진행률 |
| GET | `/api/health` | 서버 상태 |
| POST | `/api/export` | FFmpeg 내보내기 |
| GET | `/api/open-output` | 출력 폴더 열기 |
| POST | `/api/ai/generate-text` | LLM 텍스트 생성 |
| GET | `/api/ai/health` | Ollama 상태 |
| POST | `/api/script` | 스크립트 실행 (legacy) |
| POST | `/api/script/execute` | FlowScript 실행 |
| GET | `/api/script/templates` | 템플릿 목록 |
| POST | `/api/script/validate` | 스크립트 검증 |
| POST | `/api/comfyui/generate` | 이미지 생성 |
| POST | `/api/comfyui/generate-video` | i2v 비디오 생성 |
| POST | `/api/comfyui/prompt` | 프롬프트 전송 |
| GET | `/api/comfyui/history/:promptId` | 생성 이력 조회 |
| GET | `/api/comfyui/view` | 결과물 조회 |
| GET | `/api/comfyui/health` | ComfyUI 상태 |

### 미구현 (6개)

| Method | Endpoint | 설명 | 우선순위 |
|--------|----------|------|----------|
| POST | `/api/tts/generate` | TTS 음성 생성 | P1 |
| POST | `/api/bgm/generate` | AI BGM 생성 | P1 |
| POST | `/api/comfyui/upscale` | 업스케일 | P1 |
| POST | `/api/subtitle/generate` | STT 자막 생성 | P1 |
| POST | `/api/project/save` | 서버사이드 저장 | P2 |
| POST | `/api/project/load` | 서버사이드 로드 | P2 |

---

## Clip 속성 전체 목록

### 공통
```
id, type, trackId, name, startFrame, durationFrames,
sourceStart, sourceDuration, mediaId, previewUrl, src, localPath,
x, y, width, height, rotation, opacity,
brightness, contrast, saturation, blur,
volume, muted, speed, fadeIn, fadeOut, volumeEnvelope[]
```

### 텍스트 전용
```
text, fontSize, fontColor, fontFamily, textAlign,
fontWeight, fontStyle, textBgColor, textBgOpacity,
borderColor, borderWidth, shadowColor, shadowX, shadowY, lineHeight
```

---

## AI 활용 시나리오

### 시나리오 1: 카테고리 기반 자동 생성
```json
{ "actions": [
  { "action": "setCategory", "category": "wuxia" },
  { "action": "generateImage", "prompt": "...", "outputMediaId": "img_1" },
  { "action": "generateVideo", "imageMediaId": "img_1", "outputMediaId": "vid_1" },
  { "action": "addClip", "type": "video", "mediaId": "vid_1", "trackId": "v1" },
  { "action": "generateTTS", "text": "...", "outputMediaId": "tts_1" },
  { "action": "addAudio", "mediaId": "tts_1", "trackId": "a1" },
  { "action": "transition", "clipIdA": "c1", "clipIdB": "c2", "type": "dissolve" },
  { "action": "export", "format": "mp4" }
]}
```

### 시나리오 2: 다국어 배치 생성
```json
{ "actions": [
  { "action": "generateTTS", "text": "Welcome", "language": "en", "outputMediaId": "tts_en" },
  { "action": "generateTTS", "text": "환영합니다", "language": "ko", "outputMediaId": "tts_ko" },
  { "action": "export", "format": "mp4", "fileName": "video_en" },
  { "action": "setClipProperty", "clipId": "narr", "property": "mediaId", "value": "tts_ko" },
  { "action": "export", "format": "mp4", "fileName": "video_ko" }
]}
```