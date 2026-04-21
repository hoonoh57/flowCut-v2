# FlowCut Data Flow

## Overview

FlowCut has two primary data flows:
1. **Manual editing** — user imports media, places clips on timeline, exports
2. **AI pipeline** — user types prompt, system generates everything automatically

## Manual Editing Flow

```
User drops media → mediaResolver → editorStore.addMediaItem()
                                  → clipFactory.createClip()
                                  → editorStore.addClip()
User edits timeline → Command pattern → editorStore (Zustand)
User exports → /api/export → FFmpeg → output MP4/WebM/GIF
```

## AI Pipeline Flow

```
1. User prompt
   └→ AIBridge.generateScenes(prompt)
      └→ Ollama LLM → 15 scene descriptions

2. Scene planning
   └→ VideoDirector.buildDirectorPlan(scenes, opts)
      └→ scenicTemplate() → DirectorPlan (beats with timing)
      └→ planToFlowScript() → FlowScript JSON

3. Script execution (ScriptEngine.execute)
   ├→ setupProject() → set dimensions, fps from script or DEFAULT_PROJECT
   ├→ importMedia() → for each media item:
   │   ├→ POST /api/comfyui/generate-image → ComfyUI → PNG
   │   └→ POST /api/comfyui/generate-video → ComfyUI Wan2.2 i2v → VHS → MP4
   │       └→ mediaIdMap: original_id → original_id_video
   ├→ createTracks() → video + text tracks
   ├→ createClips() → place clips on timeline
   │   └→ auto-reclassify: _video mediaId or .mp4 src → type: "video"
   └→ executeActions() → auto-subtitle, export

4. Export
   └→ POST /api/export
      └→ FFmpeg command:
          ├→ black background (project dimensions, duration, fps)
          ├→ video inputs (MP4 from i2v, no -loop)
          ├→ image inputs (PNG with -loop 1)
          ├→ filter_complex: scale, pad, overlay, zoompan (Ken Burns)
          ├→ text overlays (pre-rendered PNG)
          └→ output MP4 (H.264)
```

## Project Save/Load Flow

```
Save: editorStore → ProjectManager.saveProjectToFile/LocalStorage()
      → serialize clips, tracks, media, project settings → JSON

Load: JSON → ProjectManager.restoreProject()
      → restore media items
      → restore clips (auto-detect video: _video suffix or .mp4 extension)
      → restore tracks, project settings
```

## Key Constants

- DEFAULT_PROJECT (src/types/project.ts): width 1920, height 1080, fps 30
- Value priority: FlowScript specified > editorStore > DEFAULT_PROJECT
- See CODING_STANDARDS.md for rules
