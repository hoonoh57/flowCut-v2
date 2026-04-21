import { DEFAULT_PROJECT } from '../types/project';

export interface Beat {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  scenePrompt?: string;
  text?: string;
  textStyle?: Record<string, any>;
  transition?: "cut" | "fadeIn" | "fadeOut" | "crossfade";
  energy: "high" | "medium" | "low";
}

export interface DirectorPlan {
  templateId: string;
  project: { width: number; height: number; fps: number; durationSec: number };
  style: { mood: string; colorTone: string };
  beats: Beat[];
  musicPrompt?: string;
}

function scenicTemplate(scenes: {prompt:string; text:string}[], durationSec = 30, fps = 30): DirectorPlan {
  const n = scenes.length;
  // Each i2v clip is ~2 seconds. Distribute scenes evenly across duration.
  const clipDur = durationSec / n; // e.g. 30s / 15 scenes = 2s each
  const beats: Beat[] = [];

  scenes.forEach((s, i) => {
    const startSec = i * clipDur;
    const endSec = (i + 1) * clipDur;
    let label = "Payoff";
    let energy: "high" | "medium" | "low" = "medium";
    let transition: "cut" | "fadeIn" | "fadeOut" | "crossfade" = "crossfade";
    
    if (i === 0) { label = "Hook"; energy = "high"; transition = "fadeIn"; }
    else if (i === 1) { label = "Context"; }
    else if (i === n - 1) { label = "Loop"; energy = "low"; transition = "fadeOut"; }
    else if (i % 3 === 0) { energy = "high"; }

    beats.push({
      id: i === 0 ? "hook" : i === n - 1 ? "loop" : i <= 2 ? "ctx_" + (i-1) : "pay_" + (i-3),
      label,
      startSec,
      endSec,
      scenePrompt: s.prompt || "beautiful scene",
      text: s.text || "",
      textStyle: {
        fontSize: i === 0 ? 80 : i === n - 1 ? 56 : 48,
        fontWeight: i === 0 ? "bold" : "normal",
        y: i === 0 ? 0.7 : 0.78,
        textShadow: "2px 2px 8px rgba(0,0,0,0.8)"
      },
      transition,
      energy
    });
  });

  return {
    templateId: "shorts-scenic",
    project: { width: opts.width || DEFAULT_PROJECT.width, height: opts.height || DEFAULT_PROJECT.height, fps, durationSec },
    style: { mood: "cinematic", colorTone: "warm" },
    beats,
    musicPrompt: "uplifting ambient background music"
  };
}

export function planToFlowScript(plan: DirectorPlan): any {
  const { project, beats } = plan;
  const fps = project.fps;
  const media: any[] = [];
  const clips: any[] = [];
  const tracks = [
    { id: "v1", name: "비디오 1", type: "video" },
    { id: "t1", name: "텍스트 1", type: "text" }
  ];

  beats.forEach((beat) => {
    const startFrame = Math.round(beat.startSec * fps);
    const durFrame = Math.round((beat.endSec - beat.startSec) * fps);
    const mediaId = "m_" + beat.id;

    media.push({
      id: mediaId, type: "image",
      src: "ai://" + (beat.scenePrompt || "scene"),
      aiWorkflow: "image-to-video"
    });

    clips.push({
      trackId: "v1", mediaId, type: "image",
      startFrame, durationFrames: durFrame,
      width: project.width, height: project.height, x: 0, y: 0,
      fadeIn: (beat.transition === "fadeIn" || beat.transition === "crossfade") ? 0.3 : 0,
      fadeOut: (beat.transition === "fadeOut" || beat.transition === "crossfade") ? 0.3 : 0
    });

    if (beat.text) {
      const ty = beat.textStyle?.y || 0.75;
      clips.push({
        trackId: "t1", type: "text",
        startFrame, durationFrames: durFrame,
        text: beat.text,
        fontSize: beat.textStyle?.fontSize || 48,
        fontWeight: beat.textStyle?.fontWeight || "bold",
        color: "#ffffff", textAlign: "center",
        x: 0, y: Math.round(project.height * ty),
        width: project.width, height: 200,
        textShadow: beat.textStyle?.textShadow || "1px 1px 4px rgba(0,0,0,0.7)"
      });
    }
  });

  return {
    version: "1.0",
    project: { width: project.width, height: project.height, fps },
    media, tracks, clips,
    actions: [
      { action: "autoSubtitle", language: "ko" },
      { action: "export", format: "mp4", quality: "high" }
    ]
  };
}

export function selectTemplate(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("list") || p.includes("top") || p.includes("best")) return "shorts-listicle";
  if (p.includes("story") || p.includes("vlog") || p.includes("day")) return "shorts-story";
  return "shorts-scenic";
}

export function buildDirectorPlan(
  scenes: {prompt: string; text: string}[],
  opts?: { durationSec?: number; fps?: number }
): DirectorPlan {
  const dur = opts?.durationSec || 30;
  const fps = opts?.fps || 30;
  while (scenes.length < 15) {
    scenes.push(scenes[scenes.length - 1] || { prompt: "beautiful scenery", text: "" });
  }
  return scenicTemplate(scenes, dur, fps);
}