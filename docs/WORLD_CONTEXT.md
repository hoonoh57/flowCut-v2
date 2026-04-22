# FlowCut World Context v2.0

## 0. Open Architecture

FlowCut은 특정 AI 엔진/하드웨어/클라우드에 종속되지 않습니다.
모든 AI 기능은 Provider Interface로 추상화됩니다.

| 기능 | 로컬 옵션 | 클라우드 옵션 |
|------|----------|-------------|
| 이미지 | ComfyUI (Flux/SDXL) | fal.ai, Replicate |
| 비디오 | ComfyUI (Wan2.2/LTX) | fal.ai, Runway, Kling |
| TTS | Edge TTS, XTTS-v2, Fish Speech | ElevenLabs |
| 보간 | ComfyUI RIFE/GMFSS | FFmpeg minterpolate |
| LLM | Ollama | OpenAI, Anthropic |
| 업스케일 | ComfyUI RealESRGAN | FFmpeg lanczos |

---

## 1. 문제: 영상 일관성 비용

전통 제작: 의상/소품 기록 수백장, 재촬영 하루 $50K+
AI 생성: 매 씬 독립 생성, 캐릭터 재기술 필요

| 도구 | 캐릭터 | 복장 | 장소 | 소품 | 시대 | 목소리 | 동작 | 체이닝 |
|------|--------|------|------|------|------|--------|------|--------|
| Runway Gen-4 | O | X | X | X | X | X | X | 수동 |
| Kling 3.0 | O | X | 부분 | X | X | X | O | 수동 |
| FlowCut WC | O | O | O | O | O | O | O | 자동 |

---

## 2. World Context 설계

FlowScript에 world 섹션 추가. 한번 정의하면 모든 씬에 자동 적용.

원칙:
1. 최소 노력 - LLM이 자동 생성
2. 점진적 복잡도 - 없으면 기존처럼 동작
3. 참조 이미지 우선 - 없으면 텍스트 폴백
4. 렌더러 독립 - Provider 비종속

world 섹션: visualStyle, era, genre, characters, locations, props, motionLibrary, continuity

---

## 3. 캐릭터 레지스트리

시드 고정으로 동일 프롬프트+시드 = 동일 이미지.
seed를 DB 등록하면 캐릭터 키 하나로 호출.
seed+1, seed+2로 정면/측면/전신 시트 자동 생성.
프롬프트 92% 단축 (1250자 -> 100자/5씬).

---

## 4. 목소리 시스템

캐릭터별 voice 설정:
- engine: auto (Provider 설정 따름)
- fallbackChain: [xtts-v2, fish-speech, edge-tts]
- sampleClip: 보이스 클로닝용 6초 샘플 (옵션)
- preset: Edge TTS 프리셋 (기본)

---

## 5. 모션 라이브러리

장르별 사전 등록: daily, dance, music, sports, action, emotion

- Level 1: 프롬프트 강화 (참조 영상 없이)
- Level 2: 참조 영상 기반 (Wan FunControl / Kling motion)
- Level 3: 모션 에이전트 (자동 시퀀스 조합)

---

## 6. 무한 비디오 체이닝

Stage 1: 키프레임 사전 생성 (시드 기반)
Stage 2: FLF2V/I2V/Extend 클립 생성 (Provider 능력에 따라)
Stage 3: 접합부 보정 (RIFE/FFmpeg 자동 선택)

| 등급 | 클립 생성 | 접합 보정 | 필요 환경 |
|------|----------|----------|-----------|
| S | FLF2V + IPAdapter + RIFE | 95%+ 일관성 | 로컬 GPU 12GB+ |
| A | FLF2V + 프롬프트 + RIFE | 85%+ | 로컬 GPU 6GB+ |
| B | I2V 체인 + minterpolate | 75%+ | 로컬 GPU 4GB+ |
| C | 클라우드 extend + xfade | 70%+ | GPU 불필요 |
| D | 독립 T2V + 크로스페이드 | 60%+ | CPU만 |

---

## 7. Provider Interface

- ProviderManager가 능력 감지하여 자동 전략 선택
- getProvider(type): 활성 Provider 반환
- selectChainStrategy(): 능력 기반 자동 선택
- diagnoseEnvironment(): GPU/VRAM/서비스 진단

---

## 8. 구현 일정

- Week 1: Provider Interface + World Context 코어
- Week 2: 캐릭터 레지스트리 + 목소리 + 프롬프트 지능
- Week 3: 무한 체이닝 + 모션 + 템플릿
- Week 4: 클라우드 Provider + 통합 테스트

---

## 9. 성공 지표

| 지표 | 목표 |
|------|------|
| 캐릭터 일관성 (5씬) | 80%+ |
| 체이닝 끊김 감지율 | 20% 미만 |
| Provider 전환 시 코드 변경 | 0줄 |
| 프롬프트 단축률 | 88%+ |
| GPU 없는 사용자 기능 이용률 | 100% |
| 연속 영상 최대 길이 | 60초+ |
