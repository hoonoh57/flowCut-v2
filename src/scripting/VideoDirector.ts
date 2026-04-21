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
  const hookEnd = 2;
  const ctxEnd = 7;
  const loopStart = durationSec - 5;
  const beats: Beat[] = [];

  beats.push({
    id: "hook", label: "Hook", startSec: 0, endSec: hookEnd,
    scenePrompt: scenes[0]?.prompt || "dramatic wide shot",
    text: scenes[0]?.text || "",
    textStyle: { fontSize: 80, fontWeight: "bold", y: 0.7, textShadow: "2px 2px 8px rgba(0,0,0,0.8)" },
    transition: "fadeIn", energy: "high"
  });

  const ctxScenes = scenes.slice(1, 3);
  const ctxDur = (ctxEnd - hookEnd) / Math.max(ctxScenes.length, 1);
  ctxScenes.forEach((s, i) => {
    beats.push({
      id: "ctx_" + i, label: "Context", startSec: hookEnd + i * ctxDur, endSec: hookEnd + (i+1) * ctxDur,
      scenePrompt: s.prompt, text: s.text,
      textStyle: { fontSize: 52, y: 0.75 },
      transition: "crossfade", energy: "medium"
    });
  });

  const payoffScenes = scenes.slice(3, n - 1);
  const payoffDur = (loopStart - ctxEnd) / Math.max(payoffScenes.length, 1);
  payoffScenes.forEach((s, i) => {
    beats.push({
      id: "pay_" + i, label: "Payoff", startSec: ctxEnd + i * payoffDur, endSec: ctxEnd + (i+1) * payoffDur,
      scenePrompt: s.prompt, text: s.text,
      textStyle: { fontSize: 48, y: 0.78 },
      transition: i % 2 === 0 ? "cut" : "crossfade", energy: i % 3 === 0 ? "high" : "medium"
    });
  });

  const loopScene = scenes[n - 1] || scenes[0];
  beats.push({
    id: "loop", label: "Loop", startSec: loopStart, endSec: durationSec,
    scenePrompt: loopScene.prompt, text: loopScene.text || scenes[0]?.text || "",
    textStyle: { fontSize: 56, y: 0.7 },
    transition: "fadeOut", energy: "low"
  });

  return {
    templateId: "shorts-scenic",
    project: { width: 1080, height: 1920, fps, durationSec },
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
      { type: "autoSubtitle", language: "ko" },
      { type: "export", format: "mp4", quality: "high" }
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
  while (scenes.length < 8) {
    scenes.push(scenes[scenes.length - 1] || { prompt: "beautiful scenery", text: "" });
  }
  return scenicTemplate(scenes, dur, fps);
}