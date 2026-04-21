# FlowCut

AI-powered video editor — from prompt to final export in one app.

## What is FlowCut?

FlowCut is a browser-based multi-track video editor with an integrated AI pipeline.
Type a single prompt, and FlowCut generates scenes, images, videos, text overlays,
and exports a complete video — all locally on your GPU. No subscription, no cloud dependency.

## Pipeline

```
Prompt → LLM (Ollama) → VideoDirector (beat template)
      → ScriptEngine (FlowScript JSON)
      → ComfyUI (image generation)
      → Wan2.2 i2v + VHS_VideoCombine (MP4 video)
      → FFmpeg (Ken Burns + overlay + export)
```

## Features

- **Multi-track timeline**: video, audio, image, text tracks
- **AI video generation**: prompt → scene images → i2v animation (local Wan2.2)
- **Real-time preview**: canvas rendering with video/image/text clips
- **Volume envelope editing**: wavesurfer.js pattern
- **Effects**: fade in/out, Ken Burns zoom-pan, opacity
- **Export**: MP4/WebM/GIF via FFmpeg
- **Undo/Redo**: command pattern
- **Snap & collision**: grid snapping, clip collision detection
- **Keyboard shortcuts**: standard NLE shortcuts
- **Zero hardcoding**: all dimensions from DEFAULT_PROJECT constants
- **Aspect ratio support**: 16:9, 9:16, 1:1, 4:3, 4:5, 21:9

## Tech Stack

- **Frontend**: React 18, TypeScript, Zustand, Vite
- **Backend**: Express.js (media server + FFmpeg export)
- **AI Engine**: ComfyUI (Flux/SDXL image, Wan2.2 i2v, VHS MP4 output)
- **LLM**: Ollama (local, scene generation)
- **Export**: FFmpeg (local installation)

## Prerequisites

- Node.js 18+
- FFmpeg installed (or update path in server/server.cjs)
- ComfyUI with Video Helper Suite (for AI pipeline)
- Ollama (for LLM scene generation)
- GPU with 6GB+ VRAM (for Wan2.2 i2v)

## Getting Started

```bash
npm install
npm run dev          # Frontend: http://localhost:5173
node server/server.cjs  # Backend: http://localhost:3456
```

## Project Structure

```
src/
  components/     UI (export, layout, panels, preview, timeline)
  engines/        Core engines (FFmpeg, Render, Snap, Collision)
  hooks/          Custom hooks (media import, playback, shortcuts)
  scripting/      AI pipeline (ScriptEngine, VideoDirector, AIBridge)
  stores/         Zustand store + command pattern (undo/redo)
  types/          TypeScript interfaces (Clip, Track, Media, Project)
  utils/          Utilities (mediaResolver, clipFactory, ProjectManager)
server/           Express backend (upload, export, media serving, ComfyUI proxy)
docs/             Documentation
```

## Key Architecture

- **DEFAULT_PROJECT**: Single source of truth for dimensions (see CODING_STANDARDS.md)
- **VideoDirector**: Beat-based template system (hook → context → payoff → loop)
- **ScriptEngine**: Executes FlowScript JSON (media import → track creation → clip placement → actions)
- **ProjectManager**: Save/load with auto video-type detection on restore
- **mediaResolver.ts**: Centralized URL/path lookup
- **clipFactory.ts**: Centralized clip creation
- **Command pattern**: All mutations via commands for undo/redo

## Completed Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1-2 | Core NLE editor (timeline, preview, export) | ✅ Done |
| 3.1 | AI image generation (ComfyUI integration) | ✅ Done |
| 3.2 | Image-to-Video pipeline (Wan2.2 i2v) | ✅ Done |
| 3.3 | VHS MP4 output + export fix | ✅ Done |
| 3.4 | Coding standards + zero hardcoding + Ken Burns | ✅ Done |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full improvement plan.

## License

MIT
