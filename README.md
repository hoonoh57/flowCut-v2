# FlowCut

Browser-based video editor built with React + TypeScript + Vite.
Server-side export via FFmpeg.

## Features

- Multi-track timeline (video, audio, image, text)
- Drag-and-drop media import
- Real-time preview with canvas rendering
- Volume envelope editing (wavesurfer.js pattern)
- Fade in/out, effects, transitions
- FFmpeg-based export (mp4/webm/mov)
- Undo/redo command system
- Snap-to-grid and collision detection
- Keyboard shortcuts

## Tech Stack

- **Frontend**: React 18, TypeScript, Zustand, Vite
- **Backend**: Express.js (media server + FFmpeg export)
- **Export**: FFmpeg (local installation required)

## Prerequisites

- Node.js 18+
- FFmpeg installed and in PATH (or update server/server.cjs)

## Getting Started

npm install
npm run dev

Frontend: http://localhost:5173
Backend: http://localhost:3456

## Project Structure

src/components/ - React UI (export, layout, panels, preview, timeline)
src/engines/ - Core engines (FFmpeg, Render, Snap, Collision)
src/hooks/ - Custom hooks (media import, playback, shortcuts)
src/stores/ - Zustand store + command pattern (undo/redo)
src/types/ - TypeScript interfaces (Clip, Track, Media)
src/utils/ - Utilities (mediaResolver, clipFactory, uid)
server/ - Express backend (upload, export, media serving)
docs/ - Data flow documentation

## Key Architecture

- mediaResolver.ts: Centralized URL/path lookup
- clipFactory.ts: Centralized clip creation
- ClipEnvelope.tsx: Independent volume envelope (wavesurfer.js pattern)
- createDragHandler.ts: Document-level pointer tracking
- Command pattern: All mutations via commands for undo/redo

See docs/data-flow.md for the complete pipeline.

## License

MIT
