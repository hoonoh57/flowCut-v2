import type { FlowScript, FlowScriptAction, FlowScriptClip, FlowScriptMedia, FlowScriptTrack } from "./flowscript.schema";
import { DEFAULT_PROJECT } from '../types/project';
import { useEditorStore } from "../stores/editorStore";
import { createDefaultClip } from "../types/clip";
import { uid } from "../utils/uid";
import { AddClipCommand } from "../stores/commands/AddClipCommand";
import { DeleteClipCommand } from "../stores/commands/DeleteClipCommand";
import { SplitClipCommand } from "../stores/commands/SplitClipCommand";
import { AddTrackCommand } from "../stores/commands/AddTrackCommand";
import type { Track } from "../types/track";

export interface ScriptResult {
  success: boolean;
  log: string[];
  errors: string[];
  clipIds: string[];
  duration: number;
}


function normalizeScript(script: any): any {
  // Unwrap if nested in { flowScript: { ... } }
  if (script.flowScript && !script.version) script = script.flowScript;

  const fps = script.project?.fps || 30;
  const totalFrames = fps * 30;

  // Fix project resolution
  if (!script.project) script.project = {};
  if (!script.project.width && script.project.resolution) {
    const parts = script.project.resolution.split("x");
    script.project.width = parseInt(parts[0]) || DEFAULT_PROJECT.width;
    script.project.height = parseInt(parts[1]) || DEFAULT_PROJECT.height;
  }
  if (!script.project.width) script.project.width = DEFAULT_PROJECT.width;
  if (!script.project.height) script.project.height = DEFAULT_PROJECT.height;
  if (!script.project.fps) script.project.fps = 30;
  const pw = script.project.width;
  const ph = script.project.height;

  // Fix media: normalize id, src, type
  if (script.media && Array.isArray(script.media)) {
    for (const m of script.media) {
      if (!m.id && m.mediaId) m.id = m.mediaId;
      if (!m.src && m.prompt) m.src = m.prompt.startsWith("ai://") ? m.prompt : "ai://" + m.prompt;
      if (!m.src && m.aiPrompt) m.src = "ai://" + m.aiPrompt;
      if (!m.type) m.type = "image";
      if (!m.aiWorkflow && m.src && m.src.startsWith("ai://")) m.aiWorkflow = "background-scene";
      // Remove audio that tries AI generation
      if (m.type === "audio" && m.src && m.src.startsWith("ai://")) m._skip = true;
    }
    script.media = script.media.filter((m: any) => !m._skip);
  }

  // Extract clips from nested tracks[].clips[] if top-level clips is missing/empty
  if ((!script.clips || script.clips.length === 0) && script.tracks) {
    script.clips = [];
    for (const track of script.tracks) {
      if (track.clips && Array.isArray(track.clips)) {
        const trackType = track.type || "video";
        const trackId = track.id || (trackType === "video" ? "v1" : trackType === "text" ? "t1" : "a1");
        if (!track.id) track.id = trackId;
        for (const clip of track.clips) {
          // Determine clip type
          let clipType = clip.type || trackType;
          if (clipType === "video" && clip.text) clipType = "text";
          if (clipType === "video" && clip.mediaId) {
            const media = (script.media || []).find((m: any) => m.id === clip.mediaId);
            if (media && media.type === "image") clipType = "image";
          }

          // Normalize frame numbers
          let startFrame = clip.startFrame ?? clip.start ?? 0;
          let durationFrames = clip.durationFrames ?? clip.duration ?? 0;
          if (!durationFrames && clip.endFrame != null) durationFrames = clip.endFrame - startFrame;
          if (!durationFrames && clip.end != null) durationFrames = clip.end - startFrame;
          if (!durationFrames) durationFrames = 225;

          script.clips.push({
            ...clip,
            type: clipType,
            trackId: trackId,
            startFrame: startFrame,
            durationFrames: durationFrames,
            width: clip.width || (clipType === "text" ? pw : pw),
            height: clip.height || (clipType === "text" ? 200 : ph),
            textStyle: clip.textStyle || (clip.fontSize ? { fontSize: clip.fontSize, fontColor: clip.color || clip.fontColor || "#ffffff" } : undefined),
          });
        }
        // Remove clips from track object
        delete track.clips;
      }
    }
  }

  // Ensure tracks have id fields
  if (script.tracks) {
    let vi = 1, ai = 1, ti = 1;
    for (const t of script.tracks) {
      if (!t.id) {
        t.id = t.type === "video" ? "v" + (vi++) : t.type === "audio" ? "a" + (ai++) : "t" + (ti++);
      }
    }
  }

  // Fix clip types based on media
  const imgIds = new Set((script.media || []).filter((m: any) => m.type === "image").map((m: any) => m.id));
  const validMediaIds = new Set((script.media || []).map((m: any) => m.id));
  if (script.clips) {
    for (const c of script.clips) {
      if (c.type === "video" && c.mediaId && imgIds.has(c.mediaId)) c.type = "image";
      if (c.type === "audio" && c.mediaId && !validMediaIds.has(c.mediaId)) c._skip = true;
      if (!c.width) c.width = c.type === "text" ? pw : pw;
      if (!c.height) c.height = c.type === "text" ? 200 : ph;
    }
    script.clips = script.clips.filter((c: any) => !c._skip);
  }

  // If still too few image clips, expand
  const imageMedia = (script.media || []).filter((m: any) => m.type === "image" && m.src?.startsWith("ai://"));
  const imageClips = (script.clips || []).filter((c: any) => c.type === "image");
  if (imageMedia.length >= 2 && imageClips.length <= 1) {
    // Create clips from media that aren't referenced
    const usedIds = new Set(imageClips.map((c: any) => c.mediaId));
    const vTrack = (script.tracks || []).find((t: any) => t.type === "video")?.id || "v1";
    let nextStart = imageClips.length > 0 ? Math.max(...imageClips.map((c: any) => c.startFrame + c.durationFrames)) : 0;
    const framesEach = Math.floor(totalFrames / imageMedia.length);
    
    // Redistribute all image clips evenly
    script.clips = script.clips.filter((c: any) => c.type !== "image");
    for (let i = 0; i < imageMedia.length; i++) {
      script.clips.push({
        type: "image", mediaId: imageMedia[i].id, trackId: vTrack,
        startFrame: i * framesEach, durationFrames: framesEach,
        width: pw, height: ph, fadeIn: 10, fadeOut: 10
      });
    }
  }

  return script;
}

export class ScriptEngine {
  private log: string[] = [];
  private errors: string[] = [];
  private clipIdMap: Map<string, string> = new Map();
  private mediaIdMap: Map<string, string> = new Map();

  async execute(script: FlowScript): Promise<ScriptResult> {
    const start = Date.now();
    this.log = []; this.errors = []; this.clipIdMap = new Map();
    script = normalizeScript(script) as FlowScript;
    this.log.push("[Normalize] Script expanded: " + (script.media?.length || 0) + " media, " + (script.clips?.length || 0) + " clips");
    this.log.push("[ScriptEngine] Starting FlowScript v" + script.version);
    try {
      this.log.push("[DEBUG] script keys: " + Object.keys(script).join(", "));
      this.log.push("[DEBUG] media: " + (script.media ? "array(" + (Array.isArray(script.media) ? script.media.length : typeof script.media) + ")" : "undefined"));
      this.log.push("[DEBUG] tracks: " + (script.tracks ? "array(" + (Array.isArray(script.tracks) ? script.tracks.length : typeof script.tracks) + ")" : "undefined"));
      this.log.push("[DEBUG] clips: " + (script.clips ? "array(" + (Array.isArray(script.clips) ? script.clips.length : typeof script.clips) + ")" : "undefined"));
      this.log.push("[DEBUG] actions: " + (script.actions ? "array(" + (Array.isArray(script.actions) ? script.actions.length : typeof script.actions) + ")" : "undefined"));
      try { this.setupProject(script); this.log.push("[DEBUG] setupProject OK"); } catch(e: any) { this.errors.push("[setupProject] " + e.message); return { success: false, log: this.log, errors: this.errors, clipIds: [], duration: Date.now() - start }; }
      try { if (script.media && Array.isArray(script.media)) { this.log.push("[DEBUG] importing " + script.media.length + " media..."); await this.importMedia(script.media); this.log.push("[DEBUG] importMedia OK"); } } catch(e: any) { this.errors.push("[importMedia] " + e.message + " | stack: " + (e.stack || "").split("\n")[1]); }
      try { if (script.tracks && Array.isArray(script.tracks)) { this.log.push("[DEBUG] creating " + script.tracks.length + " tracks..."); this.createTracks(script.tracks); this.log.push("[DEBUG] createTracks OK"); } } catch(e: any) { this.errors.push("[createTracks] " + e.message + " | stack: " + (e.stack || "").split("\n")[1]); }
      try { this.log.push("[DEBUG] creating " + (script.clips ? script.clips.length : 0) + " clips..."); this.createClips(script.clips || []); this.log.push("[DEBUG] createClips OK"); } catch(e: any) { this.errors.push("[createClips] " + e.message + " | stack: " + (e.stack || "").split("\n")[1]); }
      try { if (script.actions && Array.isArray(script.actions)) { this.log.push("[DEBUG] executing " + script.actions.length + " actions..."); await this.executeActions(script.actions); this.log.push("[DEBUG] executeActions OK"); } } catch(e: any) { this.errors.push("[executeActions] " + e.message + " | stack: " + (e.stack || "").split("\n")[1]); }
      this.log.push("[ScriptEngine] Complete (" + (Date.now() - start) + "ms)");
    } catch (err: any) { this.errors.push("[ScriptEngine] Fatal: " + err.message); }
    return { success: this.errors.length === 0, log: this.log, errors: this.errors, clipIds: Array.from(this.clipIdMap.values()).length > 0 ? Array.from(this.clipIdMap.values()) : useEditorStore.getState().clips.map(c => c.id), duration: Date.now() - start };
  }

  private setupProject(script: FlowScript) {
    const store = useEditorStore.getState();
    const project = script.project;
    this.log.push("[DEBUG] project: " + JSON.stringify(project));
    const validPresets = ["16:9", "9:16", "1:1", "4:5", "21:9"];
    if (project.aspectPreset && validPresets.includes(project.aspectPreset)) {
      this.log.push("[DEBUG] setAspectPreset: " + project.aspectPreset);
      store.setAspectPreset(project.aspectPreset as any);
    } else {
      this.log.push("[DEBUG] setProjectSize: " + project.width + "x" + project.height);
      store.setProjectSize(project.width || DEFAULT_PROJECT.width, project.height || DEFAULT_PROJECT.height);
    }
    if (project.fps) store.setFps(project.fps);
    this.log.push("[Project] " + (project.width || DEFAULT_PROJECT.width) + "x" + (project.height || DEFAULT_PROJECT.height) + " @ " + (project.fps || 30) + "fps");
  }

  private async importMedia(mediaList: FlowScriptMedia[]) {
    if (!mediaList || !Array.isArray(mediaList)) return;
    for (const media of mediaList) {
      if (!media.id && (media as any).mediaId) media.id = (media as any).mediaId;
      if (!media.id) media.id = "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      if (media.src.startsWith("ai://")) {
        this.log.push("[Media] AI generation: " + media.id);
        try {
          const resp = await fetch("http://localhost:3456/api/comfyui/generate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflowId: (media.aiWorkflow === "image-to-video" || media.aiWorkflow === "video-i2v") ? "background-scene" : (media.aiWorkflow || "background-scene"), positive: media.aiPrompt || media.src.replace("ai://", ""), width: 1024, height: 1024 }),
          });
          const data = await resp.json();
          if (data.success) {
            useEditorStore.getState().addMediaItem({ id: media.id, name: media.name || "AI Generated", type: media.type || "image", url: data.serverUrl && data.serverUrl.startsWith("http") ? data.serverUrl : "http://localhost:3456/media/" + (data.localPath || data.serverUrl || "").split(/[\\/]/).pop(), localPath: data.localPath || data.serverUrl, duration: media.duration || 5, width: 1024, height: 1024, size: 0 });
            this.mediaIdMap.set(media.id, media.id);
            if ((media as any).mediaId && (media as any).mediaId !== media.id) this.mediaIdMap.set((media as any).mediaId, media.id);
            
            // Phase 3.3: Image-to-Video conversion
            if (media.aiWorkflow === "image-to-video" || media.aiWorkflow === "video-i2v") {
              this.log.push("[Media] Starting Image-to-Video conversion...");
              try {
                const i2vResp = await fetch("http://localhost:3456/api/comfyui/generate-video", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    imageLocalPath: data.localPath,
                    positive: (media.aiPrompt || media.src.replace("ai://", "")) + ", gentle camera motion, cinematic, smooth animation",
                    width: 480, height: 832, length: 33, steps: 25
                  })
                });
                const i2vData = await i2vResp.json();
                if (i2vData.success) {
                  useEditorStore.getState().addMediaItem({
                    id: media.id + "_video",
                    name: (media.name || "AI Video") + " (video)",
                    type: "video",
                    url: i2vData.serverUrl,
                    localPath: i2vData.localPath,
                    duration: (i2vData.frames || 33) / (i2vData.fps || 16),
                    width: 480, height: 832, size: 0
                  });
                  this.mediaIdMap.set(media.id, media.id + "_video");
                  this.log.push("[Media] I2V complete: " + i2vData.localPath);
                } else {
                  this.log.push("[Media] I2V failed: " + (i2vData.error || "unknown") + " - using image fallback");
                }
              } catch (i2vErr: any) {
                this.log.push("[Media] I2V error: " + i2vErr.message + " - using image fallback");
              }
            }

            this.log.push("[Media] AI generated: " + data.localPath + " | url: " + (data.serverUrl && data.serverUrl.startsWith("http") ? data.serverUrl : "http://localhost:3456/media/" + (data.localPath || "").split(/[\\/]/).pop()));
          } else { this.errors.push("[Media] AI failed: " + (data.error || "unknown")); }
        } catch (err: any) { this.errors.push("[Media] AI error: " + err.message); }
      } else {
        const store = useEditorStore.getState();
        if (!store.mediaItems.find(m => m.id === media.id)) {
          store.addMediaItem({ id: media.id, name: media.name || "Media", type: media.type, url: media.src.startsWith("http") ? media.src : "http://localhost:3456/media/" + media.src, localPath: media.src, duration: media.duration || 5, size: 0 });
        }
        this.log.push("[Media] Imported: " + media.id);
      }
    }
  }

  private createTracks(trackList: FlowScriptTrack[]) {
    const store = useEditorStore.getState();
    const existingIds = new Set(store.tracks.map(t => t.id));
    if (!trackList || !Array.isArray(trackList)) return;
    for (const t of trackList) {
      if (existingIds.has(t.id)) continue;
      const track: Track = { id: t.id, name: t.name || (t.type === "video" ? "비디오" : t.type === "audio" ? "오디오" : "텍스트") + " " + t.id, type: t.type, order: t.type === "video" ? 500 : t.type === "text" ? 600 : 100, height: t.height || (t.type === "video" ? 80 : t.type === "audio" ? 60 : 40), color: t.type === "video" ? "#3b82f6" : t.type === "audio" ? "#22c55e" : "#f59e0b", locked: t.locked || false, visible: t.visible !== false, muted: t.muted || false, solo: t.solo || false };
      store.dispatch(new AddTrackCommand(track));
      this.log.push("[Track] Created: " + t.id + " (" + t.type + ")");
    }
  }

  private createClips(clipList: FlowScriptClip[]) {
    // Auto-create tracks for clips that reference non-existent tracks
    const existingTrackIds = new Set(useEditorStore.getState().tracks.map(t => t.id));
    const neededTracks = new Map<string, string>(); // trackId -> type
    for (const sc of (clipList || [])) {
      const tid = sc.trackId;
      if (tid && !existingTrackIds.has(tid) && !neededTracks.has(tid)) {
        const clipType = sc.type === "image" ? "video" : sc.type || "video";
        neededTracks.set(tid, clipType);
      }
    }
    for (const [tid, ttype] of neededTracks) {
      const trackType = ttype === "image" ? "video" : ttype;
      const track: Track = {
        id: tid,
        name: (trackType === "video" ? String.fromCharCode(48708, 46356, 50724) : trackType === "audio" ? String.fromCharCode(50724, 46356, 50724) : String.fromCharCode(53581, 49828, 53944)) + " " + tid,
        type: trackType as any,
        order: trackType === "video" ? 500 : trackType === "text" ? 600 : 100,
        height: trackType === "video" ? 80 : trackType === "audio" ? 60 : 40,
        color: trackType === "video" ? "#3b82f6" : trackType === "audio" ? "#22c55e" : "#f59e0b",
        locked: false, visible: true, muted: false, solo: false
      };
      useEditorStore.getState().dispatch(new AddTrackCommand(track));
      this.log.push("[Track] Auto-created: " + tid + " (" + trackType + ") for orphan clips");
      existingTrackIds.add(tid);
    }
    const store = useEditorStore.getState();
    if (!clipList || !Array.isArray(clipList)) return;
    for (const sc of clipList) {
      const actualId = sc.id || uid();
      if (sc.id) this.clipIdMap.set(sc.id, actualId);
      let trackId = sc.trackId;
      if (!trackId) {
        const tracks = useEditorStore.getState().tracks;
        const tt = tracks.filter(t => t.type === (sc.type === "image" ? "video" : sc.type));
        trackId = tt.length > 0 ? tt[0].id : "v1";
      }
      let src = "", localPath = "", mediaId = sc.mediaId || "";
      // Try to resolve mediaId from the mediaIdMap (handles AI script mediaId mismatch)
      if (mediaId) { const mapped = this.mediaIdMap.get(mediaId); if (mapped && mapped !== mediaId) { this.log.push("[Clip] mediaId mapped: " + mediaId + " -> " + mapped); mediaId = mapped; } }
      // If still not found, try matching by index (first media for first clip, etc.)
      if (mediaId && !useEditorStore.getState().mediaItems.find(m => m.id === mediaId)) {
        const allMedia = useEditorStore.getState().mediaItems;
        const mediaType = sc.type === "text" ? null : sc.type === "audio" ? "audio" : "image";
        if (mediaType) {
          const candidates = allMedia.filter(m => mediaType === "image" ? (m.type === "image" || m.type === "video") : m.type === mediaType);
          if (candidates.length > 0) {
            // Pick next unused media of matching type
          const usedMediaIds = new Set();
          for (const c of useEditorStore.getState().clips) { if (c.mediaId) usedMediaIds.add(c.mediaId); }
          const unused = candidates.filter(m => !usedMediaIds.has(m.id));
          mediaId = (unused.length > 0 ? unused[0] : candidates[0]).id;
          this.log.push("[Clip] mediaId resolved by type match: " + mediaId);
          }
        }
      }
      // If no mediaId at all but clip needs media, try to auto-assign
      if (!mediaId && sc.type !== "text") {
        const allMedia = useEditorStore.getState().mediaItems;
        const mediaType = sc.type === "audio" ? "audio" : null;
        const candidates = mediaType ? allMedia.filter(m => m.type === mediaType) : allMedia.filter(m => m.type === "image" || m.type === "video");
        if (candidates.length > 0) {
          // Use a counter based on how many clips of this type we've already created
          const usedCount = Array.from(this.clipIdMap.values()).length;
          const idx = Math.min(usedCount, candidates.length - 1);
          mediaId = candidates[idx].id;
          this.log.push("[Clip] mediaId auto-assigned: " + mediaId);
        }
      }
      if (mediaId) {
        const media = useEditorStore.getState().mediaItems.find(m => m.id === mediaId);
        if (media) { src = media.url || ""; localPath = media.localPath || ""; if (!src && localPath) { const fn = localPath.split(/[\\/]/).pop() || ""; src = "http://localhost:3456/media/" + fn; } }
      }
      const clip = createDefaultClip({ id: actualId, name: sc.text || (sc.type + " clip"), type: (() => { const ext = (src || localPath || "").split(".").pop()?.toLowerCase(); if (sc.type === "video" && ext && ["png","jpg","jpeg","webp","bmp","gif"].includes(ext)) return "image"; return sc.type === "image" ? "image" : sc.type; })(), trackId, startFrame: sc.startFrame, durationFrames: sc.durationFrames, src, mediaId, localPath, x: sc.x || 0, y: sc.y || 0, width: sc.width || useEditorStore.getState().projectWidth || 1920, height: sc.height || useEditorStore.getState().projectHeight || 1080, rotation: sc.rotation || 0, opacity: sc.opacity ?? 100, volume: sc.volume ?? 100, muted: sc.muted || false, speed: sc.speed || 1, fadeIn: sc.fadeIn || 0, fadeOut: sc.fadeOut || 0, groupId: sc.groupId, sourceStart: sc.sourceStart || 0, sourceDuration: sc.sourceDuration, text: sc.text, fontFamily: sc.textStyle?.fontFamily, fontSize: sc.textStyle?.fontSize, fontColor: sc.textStyle?.fontColor, fontWeight: sc.textStyle?.fontWeight, textAlign: sc.textStyle?.textAlign, textBgColor: sc.textStyle?.backgroundColor, textBgOpacity: sc.textStyle?.backgroundOpacity, borderWidth: sc.textStyle?.borderWidth, borderColor: sc.textStyle?.borderColor, shadowX: sc.textStyle?.shadowX, shadowY: sc.textStyle?.shadowY, shadowColor: sc.textStyle?.shadowColor, lineHeight: sc.textStyle?.lineHeight });
      if (sc.keyframes) (clip as any).keyframes = sc.keyframes;
      if (sc.effects) (clip as any).scriptEffects = sc.effects;
      const ripple = useEditorStore.getState().rippleMode;
      store.dispatch(new AddClipCommand(clip, ripple));
      this.log.push("[Clip] " + actualId + " @ frame " + sc.startFrame + " (" + sc.type + ") src=" + (src || "none").substring(0, 60));
    }
  }

  private async executeActions(actions: FlowScriptAction[]) {
    if (!actions || !Array.isArray(actions)) return;
    for (const act of actions) {
      switch (act.action || (act as any).type) {
        case "split": {
          const cid = this.resolveClipId(act.clipId);
          useEditorStore.getState().dispatch(new SplitClipCommand(cid, act.frame));
          this.log.push("[Action] Split " + cid + " at frame " + act.frame); break;
        }
        case "splitAll": {
          const clips = useEditorStore.getState().clips.filter(c => c.startFrame < act.frame && c.startFrame + c.durationFrames > act.frame);
          for (const c of clips) useEditorStore.getState().dispatch(new SplitClipCommand(c.id, act.frame));
          this.log.push("[Action] SplitAll at frame " + act.frame); break;
        }
        case "delete": {
          for (const id of act.clipIds) useEditorStore.getState().dispatch(new DeleteClipCommand(this.resolveClipId(id), false));
          this.log.push("[Action] Delete " + act.clipIds.length + " clips"); break;
        }
        case "rippleDelete": {
          for (const id of act.clipIds) useEditorStore.getState().dispatch(new DeleteClipCommand(this.resolveClipId(id), true));
          this.log.push("[Action] RippleDelete " + act.clipIds.length + " clips"); break;
        }
        case "group": {
          const gid = uid();
          const resolved = act.clipIds.map(id => this.resolveClipId(id));
          const clips = useEditorStore.getState().clips.map(c => resolved.includes(c.id) ? { ...c, groupId: gid } : c);
          useEditorStore.setState({ clips });
          this.log.push("[Action] Group " + act.clipIds.length + " clips"); break;
        }
        case "setVolume": {
          const cid = this.resolveClipId(act.clipId);
          const clips = useEditorStore.getState().clips.map(c => c.id === cid ? { ...c, volume: act.volume } : c);
          useEditorStore.setState({ clips });
          this.log.push("[Action] SetVolume " + cid + " -> " + act.volume); break;
        }
        case "setSpeed": {
          const cid2 = this.resolveClipId(act.clipId);
          const clips2 = useEditorStore.getState().clips.map(c => c.id === cid2 ? { ...c, speed: act.speed } : c);
          useEditorStore.setState({ clips: clips2 });
          this.log.push("[Action] SetSpeed " + cid2 + " -> " + act.speed); break;
        }
        case "move": {
          const cid3 = this.resolveClipId(act.clipId);
          const clips3 = useEditorStore.getState().clips.map(c => c.id === cid3 ? { ...c, trackId: act.toTrack, startFrame: act.toFrame } : c);
          useEditorStore.setState({ clips: clips3 });
          this.log.push("[Action] Move " + cid3); break;
        }
        case "export": {
          this.log.push("[Action] Export " + act.format + " (delegating to /api/export)");
          try {
            const s = useEditorStore.getState();
            const resp = await fetch("http://localhost:3456/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputFiles: s.clips.map(c => ({ clipId: c.id, type: c.type, localPath: c.localPath, startFrame: c.startFrame, durationFrames: c.durationFrames, trackId: c.trackId, volume: c.volume, muted: c.muted, speed: c.speed, opacity: c.opacity, x: c.x, y: c.y, clipWidth: c.width, clipHeight: c.height, text: c.text, fontFamily: c.fontFamily, fontSize: c.fontSize, fontColor: c.fontColor, fontWeight: c.fontWeight, textAlign: c.textAlign, fadeIn: c.fadeIn, fadeOut: c.fadeOut, volumeEnvelope: c.volumeEnvelope, name: c.name, sourceStart: c.sourceStart, sourceDuration: c.sourceDuration })), projectWidth: s.projectWidth, projectHeight: s.projectHeight, fps: s.fps, tracks: s.tracks, format: act.format || "mp4", quality: act.quality || "medium", fileName: act.fileName || "flowscript_export" }) });
            const data = await resp.json();
            if (data.success) this.log.push("[Action] Export complete: " + data.filePath);
            else this.errors.push("[Action] Export failed: " + data.error);
          } catch (err: any) { this.errors.push("[Action] Export error: " + err.message); }
          break;
        }
        case "upload": { this.log.push("[Action] Upload to " + act.platform + " (placeholder)"); break; }
        case "autoSubtitle": { this.log.push("[Action] Auto subtitle (" + (act.language || "auto") + ")"); break; }
        case "wait": { await new Promise(r => setTimeout(r, act.seconds * 1000)); this.log.push("[Action] Wait " + act.seconds + "s"); break; }
        case "log": { this.log.push("[User] " + act.message); break; }
        default: {
          const a = (act as any);
          // Handle common AI-generated non-standard actions
          if (a.action === "add_text" || a.action === "addText") {
            this.log.push("[Action] add_text -> creating text clip");
            if (a.text || a.params?.text) {
              const textClip = createDefaultClip({
                id: uid(), name: a.text || a.params?.text || "Text",
                type: "text" as any, trackId: a.trackId || a.params?.trackId || "t1",
                startFrame: a.startFrame || a.params?.startFrame || 0,
                durationFrames: a.durationFrames || a.params?.durationFrames || 90,
                text: a.text || a.params?.text,
                fontFamily: a.textStyle?.fontFamily || a.params?.fontFamily,
                fontSize: a.textStyle?.fontSize || a.params?.fontSize || 48,
                fontColor: a.textStyle?.fontColor || a.params?.fontColor || "#ffffff",
              });
              useEditorStore.getState().dispatch(new AddClipCommand(textClip, false));
              this.log.push("[Action] Text clip created: " + (a.text || a.params?.text));
            }
          } else if (a.action === "add_audio" || a.action === "addAudio") {
            this.log.push("[Action] add_audio -> creating audio clip");
            if (a.mediaId || a.params?.mediaId) {
              const audioClip = createDefaultClip({
                id: uid(), name: "Audio", type: "audio" as any,
                trackId: a.trackId || a.params?.trackId || "a1",
                startFrame: a.startFrame || a.params?.startFrame || 0,
                durationFrames: a.durationFrames || a.params?.durationFrames || 900,
                mediaId: a.mediaId || a.params?.mediaId,
                volume: a.volume || a.params?.volume || 100,
              });
              useEditorStore.getState().dispatch(new AddClipCommand(audioClip, false));
              this.log.push("[Action] Audio clip created");
            } else { this.log.push("[Action] add_audio skipped (no mediaId)"); }
          } else {
            this.log.push("[Action] Unknown: " + a.action + " (params: " + JSON.stringify(a).substring(0, 100) + ")");
          }
          break;
        }
      }
    }
  }

  private resolveClipId(scriptId: string): string { return this.clipIdMap.get(scriptId) || scriptId; }

  static toFlowScript(): FlowScript {
    const s = useEditorStore.getState();
    return {
      version: "1.0",
      project: { width: s.projectWidth, height: s.projectHeight, fps: s.fps, aspectPreset: s.aspectPreset },
      media: s.mediaItems.map(m => ({ id: m.id, type: m.type, src: m.localPath || m.url, name: m.name, duration: m.duration })),
      tracks: s.tracks.map(t => ({ id: t.id, name: t.name, type: t.type, muted: t.muted, solo: t.solo, locked: t.locked, visible: t.visible, height: t.height })),
      clips: s.clips.map(c => ({ id: c.id, type: c.type, mediaId: c.mediaId, trackId: c.trackId, startFrame: c.startFrame, durationFrames: c.durationFrames, sourceStart: c.sourceStart, sourceDuration: c.sourceDuration, x: c.x, y: c.y, width: c.width, height: c.height, rotation: c.rotation, opacity: c.opacity, volume: c.volume, muted: c.muted, speed: c.speed, fadeIn: c.fadeIn, fadeOut: c.fadeOut, groupId: c.groupId, text: c.text, textStyle: c.text ? { fontFamily: c.fontFamily, fontSize: c.fontSize, fontColor: c.fontColor, fontWeight: c.fontWeight, textAlign: c.textAlign, backgroundColor: c.textBgColor, backgroundOpacity: c.textBgOpacity } : undefined, volumeEnvelope: c.volumeEnvelope })),
      metadata: { createdAt: new Date().toISOString(), author: "FlowCut" },
    };
  }
}

if (typeof window !== "undefined") {
  (window as any).__flowcut = {
    executeScript: async (json: FlowScript | string) => {
      const script = typeof json === "string" ? JSON.parse(json) : json;
      const engine = new ScriptEngine();
      return engine.execute(script);
    },
    getScript: () => ScriptEngine.toFlowScript(),
    getState: () => useEditorStore.getState(),
    store: useEditorStore,
  };
}