# FlowCut Coding Standards & Rules

## 최종 수정: 2026-04-21
## 이 문서는 모든 코드 생성/수정 시 반드시 참조해야 합니다.

---

## 1. 하드코딩 금지 (Zero Hardcoding Policy)

### 원칙
- 숫자 리터럴(1080, 1920, 30 등)을 코드에 직접 사용하지 않습니다.
- 모든 기본값은 **상수 파일** 또는 **설정 객체**에서 가져옵니다.
- 새 기능 추가 시 하드코딩된 값이 있으면 PR을 거부합니다.

### 프로젝트 크기 기본값
- **유일한 진실의 원천**: `src/types/project.ts` → `DEFAULT_PROJECT`
- 프리셋 매핑: `src/stores/slices/playbackSlice.ts` → `PRESET_SIZES`
- 다른 파일에서 기본 크기가 필요하면 반드시 위 두 곳에서 import합니다.

```typescript
// ✅ 올바른 방법
import { DEFAULT_PROJECT } from '../types/project';
const width = project.width || DEFAULT_PROJECT.width;

// ❌ 금지
const width = project.width || 1920;  // 하드코딩
```

### FPS 기본값
- `DEFAULT_PROJECT.fps` (현재 30)을 사용합니다.
- `30`을 직접 쓰지 않습니다.

### 폰트 기본값
- `DEFAULT_FONT_FAMILY = 'Malgun Gothic'` (상수로 정의)
- 폰트 경로는 `server.cjs`의 `FONT_MAP`에서만 관리합니다.

---

## 2. 값 우선순위 (Value Priority Chain)

모든 설정값은 다음 우선순위를 따릅니다:

1. **사용자 명시값** (FlowScript, UI 입력) → 최우선
2. **현재 프로젝트 설정** (editorStore) → 차순위
3. **DEFAULT_PROJECT 상수** → 폴백

```typescript
// 표준 패턴
const width = script.project?.width 
  || useEditorStore.getState().projectWidth 
  || DEFAULT_PROJECT.width;
```

---

## 3. AI 파이프라인 규칙

### 프롬프트 → 스크립트
- LLM에게 프로젝트 크기를 하드코딩하지 않습니다.
- 현재 editorStore의 projectWidth/Height를 시스템 프롬프트에 동적으로 전달합니다.

### VideoDirector
- `buildDirectorPlan()`은 반드시 외부에서 width/height를 받습니다.
- 내부에서 크기를 결정하지 않습니다.

### ScriptEngine (normalizeScript)
- 스크립트에 project.width/height가 있으면 그대로 사용합니다.
- 없으면 editorStore 값을 사용합니다.
- editorStore도 없으면 DEFAULT_PROJECT를 사용합니다.

### ComfyUI 워크플로우
- i2v 해상도는 GPU VRAM에 따라 결정합니다 (별도 설정).
- 최종 export 해상도와 i2v 생성 해상도는 다를 수 있습니다 (업스케일).

---

## 4. 파일 구조 규칙

### 상수/설정 파일
- `src/types/project.ts` — 프로젝트 기본값
- `src/stores/slices/playbackSlice.ts` — 비율 프리셋
- `src/config/` — 워크플로우 템플릿
- `server.cjs` 상단 — 서버 경로/설정

### import 규칙
- 같은 값이 여러 파일에 필요하면 상수를 만들어 export합니다.
- `../types/project`에서 import하는 것을 원칙으로 합니다.

---

## 5. 에러 처리 규칙

- 모든 fetch 호출에 try/catch + 의미 있는 에러 메시지
- FFmpeg 실패 시 로그에 명령어 전체를 출력합니다.
- ComfyUI 폴링 실패 시 타임아웃 값을 로그에 포함합니다.
- 클라이언트에 "unknown error"를 보내지 않습니다.

---

## 6. 커밋 규칙

- 커밋 메시지에 Phase 번호 포함
- 변경된 파일 목록과 주요 변경 내용 기술
- 하드코딩 제거 시 `[Standards]` 태그 사용

---

## 7. 하드코딩 체크리스트 (코드 리뷰용)

코드 작성/수정 후 다음을 확인합니다:

- [ ] 숫자 리터럴 1080, 1920, 1440, 2560, 1350이 코드에 없는가?
- [ ] 30 (fps)이 직접 사용되지 않는가?
- [ ] 프로젝트 크기는 DEFAULT_PROJECT 또는 editorStore에서 가져오는가?
- [ ] 새 기본값이 필요하면 project.ts에 추가했는가?
- [ ] UI 프리셋 값은 playbackSlice.ts의 PRESET_SIZES에서만 정의되는가?

---

## 하드코딩 위반 현황 (수정 대상)

### 수정 완료
- (이 패치에서 수정한 파일들이 여기에 추가됩니다)

### 허용된 하드코딩 (프리셋 정의)
- `playbackSlice.ts` PRESET_SIZES — 비율별 크기 정의 (이것이 원천)
- `ExportPanel.tsx` 해상도 옵션 — UI 표시용 (PRESET_SIZES 참조로 전환 권장)
- `ProjectPanel.tsx` 프리셋 목록 — UI 표시용 (PRESET_SIZES 참조로 전환 권장)
- `server.cjs` 스크립트 프리셋 — 서버측 템플릿 (별도 관리)

### 수정 필요
- `ScriptEngine.ts` line 31-35, 180, 183 — DEFAULT_PROJECT 사용으로 전환
- `VideoDirector.ts` line 59 — opts에서 받도록 전환
- `ClipInspector.tsx` line 112-113 — DEFAULT_PROJECT 사용
- `TextPanel.tsx` line 98-99, 171-172 — DEFAULT_PROJECT 사용
- `TrackLane.tsx` line 65-66 — DEFAULT_PROJECT 사용
- `clipFactory.ts` line 29-30 — DEFAULT_PROJECT 사용
- `useMediaImport.ts` line 41-42, 48 — DEFAULT_PROJECT 사용
- `PreviewCanvas.tsx` line 266 — DEFAULT_PROJECT 사용
- `clip.ts` line 76-77 — DEFAULT_PROJECT 사용
- `server.cjs` line 70 — projectWidth/Height 파라미터 사용
