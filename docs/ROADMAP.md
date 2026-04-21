# FlowCut Roadmap

## Competitive Landscape (April 2026)

| Category | FlowCut | CapCut | Descript | Runway Gen-4 | Kling 3.0 | Pika 2.2 | VideoGen |
|----------|---------|--------|----------|---------------|-----------|----------|----------|
| Approach | Prompt→AI Gen→NLE→Export | Timeline+Templates | Transcript editing | AI video gen only | AI video gen only | Creative effects | Prompt→Shorts auto |
| Timeline NLE | ✅ Multi-track | ✅ Strong | ✅ Text-based | ❌ | ❌ | ❌ | Limited |
| AI Video Gen | ✅ Local Wan2.2 | ❌ | ❌ | ✅ Cloud | ✅ Cloud | ✅ Cloud | ❌ (stock) |
| Prompt→Full Video | ✅ Auto | ❌ Manual | ❌ | Clip only | Clip only | Clip only | ✅ Auto |
| Cost | Free (local GPU) | Freemium | $29+/mo | $15-95/mo | $10-92/mo | $10-95/mo | Paid |
| Resolution | 480×832 (i2v) | 4K | 4K | 1080p | 1080p 48fps | 1080p | 1080p |
| Clip Duration | 2s (33f@16fps) | Unlimited | Unlimited | 16s | 15s | 10s | 60s+ |
| Audio | ❌ None | ✅ Full | ✅ Full | ❌ Silent | ✅ Native | ✅ SFX | ✅ TTS+BGM |
| Subtitles | ✅ Text overlay | ✅ Auto caption | ✅ Transcription | ❌ | ❌ | ❌ | ✅ Styled |
| Offline/Local | ✅ | Partial | ❌ | ❌ | ❌ | ❌ | ❌ |

### FlowCut Unique Position
- Only tool combining **AI generation + NLE editing + export** in one local app
- Zero subscription cost (GPU-only requirement)
- Full creative control via timeline + FlowScript

### Key Gaps vs. Competitors
- No audio (TTS/BGM) — every competitor except Runway has audio
- Low resolution (480p) — competitors offer 1080p-4K
- Short clips (2s) — competitors offer 10-60s
- No character consistency — Kling/Runway maintain character across shots

---

## Improvement Plan

### P0 — Immediate (Quality Gap Closure)

**Audio Pipeline**
- Integrate TTS (Edge TTS or Coqui TTS, local)
- Auto-timing narration placement per scene beat
- BGM library or AI music generation (MusicGen)
- Volume ducking: lower BGM during narration

**I2V Clip Duration**
- Increase from 33 frames (2s) to 81 frames (5s) at 16fps
- Apply frame interpolation (comfyui-frame-interpolation, already installed)
- Target: 5-8 seconds per scene clip

**Output Resolution**
- Current: 480×832 → Target: 720p minimum, 1080p ideal
- Add upscale node (RealESRGAN or similar) in ComfyUI workflow
- Dynamic resolution based on project aspect ratio

### P1 — Short-term (1-2 weeks)

**Crossfade Transitions**
- FFmpeg xfade filter: dissolve, wipe, slide between scenes
- Configurable per-beat transition in VideoDirector

**Timeline Thumbnails**
- Extract first frame from MP4 for timeline display
- Video clip indicator icon on track lane

**Dynamic I2V Dimensions**
- Pass project width/height to video-i2v.json workflow
- Maintain aspect ratio across all generation steps

**Preview Enhancement**
- Seek-to-frame for video clips in PreviewCanvas
- Playback sync between timeline cursor and video elements

### P2 — Mid-term (1 month)

**Character Consistency**
- Use IPAdapter (already installed) with reference face from first scene
- Propagate character reference across all scene generations

**Prompt Intelligence**
- Auto-enhance LLM prompts with camera angles, lighting, motion keywords
- Scene-type detection (landscape, portrait, action, dialogue)
- Negative prompt optimization per scene type

**Project Templates**
- YouTube Shorts (9:16, 30s, 15 scenes)
- Instagram Reels (9:16, 60s, 30 scenes)
- YouTube Video (16:9, 3min, chapters)
- Ad Creative (various ratios, 15/30/60s)
- Custom template builder

**Batch Export**
- Export same project in multiple aspect ratios
- A/B variant generation (different prompts, same structure)

### P3 — Long-term (3 months+)

**Cloud GPU Option**
- Optional cloud rendering for users without local GPU
- Hybrid: local editing + cloud generation

**Lip-sync / Avatar**
- Digital avatar integration (compete with HeyGen/Synthesia)
- Voice-driven face animation

**Real-time Collaboration**
- Multi-user project editing
- Shared asset library

**Plugin System**
- Custom ComfyUI workflow import
- Third-party effect plugins
- Community template marketplace

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| Phase 1-2 | 2026-04 | Core NLE editor |
| Phase 3.1 | 2026-04 | ComfyUI image generation |
| Phase 3.2 | 2026-04 | Wan2.2 i2v pipeline |
| Phase 3.3a | 2026-04 | WEBP→MP4 conversion attempt |
| Phase 3.3b | 2026-04 | VHS_VideoCombine MP4 direct output |
| Phase 3.3c | 2026-04 | Fix MP4 export (reclassify image→video) |
| Phase 3.4 | 2026-04 | Coding standards, zero hardcoding, Ken Burns, 15-scene template |
| Phase 3.4.1 | 2026-04 | Project load video auto-detection fix |


---

## Script Infrastructure Status

전체 기능의 스크립트화 현황. AI가 활용하려면 100% 완료 필요.

| 카테고리 | 구현 | 미구현 | 완료율 |
|----------|------|--------|--------|
| 편집 액션 | 8 | 7 (addClip, setClipProperty, addTrack, removeTrack, setProject, trim, duplicate) | 53% |
| AI 생성 | 2 (image, video) | 3 (TTS, BGM, upscale) | 40% |
| 출력/유틸 | 4 (export, wait, log, upload) | 3 (transition, save, undo) | 57% |
| **전체** | **14** | **13** | **52%** |

목표: **100% 스크립트 커버리지** 달성 후 카테고리 에이전트 구축

상세 명세: [docs/SCRIPT_API.md](SCRIPT_API.md)
