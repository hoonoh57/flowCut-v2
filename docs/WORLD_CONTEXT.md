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

전통 제작: 의상/소품 기록 수백장, 재촬영 하루 50K+
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

## 4. 목소리: 캐릭터별 voice, fallbackChain [xtts-v2, fish-speech, edge-tts]

## 5. 모션 라이브러리: daily/dance/music/sports/action/emotion 장르별 사전등록

## 6. 무한 체이닝: 키프레임 사전생성 + FLF2V/I2V + RIFE/FFmpeg 접합 보정

등급: S(GPU12GB+) A(GPU6GB+) B(GPU4GB+) C(클라우드) D(CPU)

## 7. Provider Interface: ProviderManager가 능력 감지하여 자동 전략 선택

## 8. 일정: W1 Provider+Core, W2 캐릭터+목소리, W3 체이닝+모션, W4 클라우드+테스트

## 9. 목표: 일관성80%+, 끊김20%미만, Provider전환 코드0줄, 단축88%+, 영상60초+
