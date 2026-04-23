/**
 * FlowScript v1.0 — FlowCut Scripting Standard
 * Every editing operation can be expressed as a FlowScript document.
 * AI agents generate FlowScript JSON, the ScriptEngine executes it.
 */

export interface FlowScriptProject {
  width: number;
  height: number;
  fps: number;
  aspectPreset?: "16:9" | "9:16" | "1:1" | "4:5" | "21:9";
  name?: string;
}

export interface FlowScriptMedia {
  id: string;
  type: "video" | "audio" | "image";
  src: string;
  name?: string;
  duration?: number;
  aiPrompt?: string;
  aiWorkflow?: string;
  narration?: string;          // Auto-generate TTS and sync with scene clip
  narrationVoice?: string;     // Voice preset (ko, en, ja, zh, or Edge TTS voice name)
  narrationLang?: string;      // Language code
}

export interface FlowScriptKeyframe {
  frame: number;
  value: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bezier";
  bezier?: [number, number, number, number];
}

export interface FlowScriptEffect {
  type: "brightness" | "contrast" | "saturation" | "blur" | "opacity"
      | "chromakey" | "colorwheel" | "lut" | "speed" | "reverse"
      | "crop" | "rotate" | "flip" | "mirror";
  value?: number;
  keyframes?: FlowScriptKeyframe[];
  params?: Record<string, any>;
}

export interface FlowScriptTransition {
  type: "dissolve" | "wipe" | "slide" | "zoom" | "fade" | "push" | "none";
  duration: number;
  direction?: "left" | "right" | "up" | "down";
  easing?: string;
}

export interface FlowScriptTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowX?: number;
  shadowY?: number;
  shadowColor?: string;
  lineHeight?: number;
  presetId?: string;
}

export interface FlowScriptClip {
  id?: string;
  type: "video" | "audio" | "image" | "text";
  mediaId?: string;
  trackId?: string;
  startFrame: number;
  durationFrames: number;
  sourceStart?: number;
  sourceDuration?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  fitMode?: "fit" | "fill" | "stretch";
  keyframes?: {
    x?: FlowScriptKeyframe[];
    y?: FlowScriptKeyframe[];
    width?: FlowScriptKeyframe[];
    height?: FlowScriptKeyframe[];
    rotation?: FlowScriptKeyframe[];
    opacity?: FlowScriptKeyframe[];
    scale?: FlowScriptKeyframe[];
  };
  volume?: number;
  muted?: boolean;
  speed?: number;
  fadeIn?: number;
  fadeOut?: number;
  volumeEnvelope?: { position: number; volume: number }[];
  effects?: FlowScriptEffect[];
  transition?: FlowScriptTransition;
  text?: string;
  textStyle?: FlowScriptTextStyle;
  groupId?: string;
}

export interface FlowScriptTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "text";
  muted?: boolean;
  solo?: boolean;
  locked?: boolean;
  visible?: boolean;
  height?: number;
}

export type FlowScriptAction =
  | { action: "split"; clipId: string; frame: number }
  | { action: "splitAll"; frame: number }
  | { action: "delete"; clipIds: string[] }
  | { action: "rippleDelete"; clipIds: string[] }
  | { action: "group"; clipIds: string[] }
  | { action: "ungroup"; groupId: string }
  | { action: "move"; clipId: string; toTrack: string; toFrame: number }
  | { action: "trim"; clipId: string; edge: "left" | "right"; frames: number }
  | { action: "duplicate"; clipIds: string[]; offset?: number }
  | { action: "setEffect"; clipId: string; effect: FlowScriptEffect }
  | { action: "removeEffect"; clipId: string; effectType: string }
  | { action: "setVolume"; clipId: string; volume: number }
  | { action: "setSpeed"; clipId: string; speed: number }
  | { action: "addKeyframe"; clipId: string; property: string; frame: number; value: number; easing?: string }
  | { action: "export"; format: "mp4" | "webm" | "gif"; quality?: string; fileName?: string }
  | { action: "upload"; platform: "youtube" | "tiktok" | "instagram"; title?: string; description?: string; tags?: string[] }
  | { action: "aiGenerate"; mediaId: string; prompt: string; workflow?: string }
  | { action: "autoSubtitle"; language?: string; style?: string }
  | { action: "wait"; seconds: number }
  | { action: "log"; message: string };

export interface FlowScript {
  version: "1.0";
  project: FlowScriptProject;
  world?: FlowScriptWorld;
  media?: FlowScriptMedia[];
  tracks?: FlowScriptTrack[];
  clips: FlowScriptClip[];
  actions?: FlowScriptAction[];
  metadata?: {
    title?: string;
    description?: string;
    author?: string;
    tags?: string[];
    createdAt?: string;
    aiModel?: string;
    prompt?: string;
  };
}

export const FLOWSCRIPT_JSON_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FlowScript",
  "description": "FlowCut video editing script format v1.0",
  "type": "object",
  "required": ["version", "project", "clips"],
  "properties": {
    "version": { "type": "string", "enum": ["1.0"] },
    "project": { "type": "object", "required": ["width", "height", "fps"] },
    "media": { "type": "array" },
    "tracks": { "type": "array" },
    "clips": { "type": "array" },
    "actions": { "type": "array" },
    "metadata": { "type": "object" }
  }
} as const;