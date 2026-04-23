import { DEFAULT_PROJECT } from './project';

export interface VolumePoint {
  /** 0~1 ratio within clip duration */
  position: number;
  /** 0~200 volume percent */
  volume: number;
}

export interface Clip {
  id: string;
  type: 'video' | 'image' | 'audio' | 'text';
  trackId: string;
  name: string;
  startFrame: number;
  durationFrames: number;
  sourceStart: number;
  sourceDuration: number;
  mediaId?: string;
  previewUrl?: string;
  src?: string;
  localPath?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  volume: number;
  muted: boolean;
  speed: number;
  fadeIn: number;
  fadeOut: number;
  volumeEnvelope?: VolumePoint[];
  text?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  // --- Text style ---
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontStyle?: string;
  textBgColor?: string;
  textBgOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  shadowColor?: string;
  shadowX?: number;
  shadowY?: number;
  lineHeight?: number;
  letterSpacing?: number;

  // --- Text Animation ---
  animationType?: 'none' | 'bounce' | 'wave' | 'slide-left' | 'slide-right' | 'slide-up' | 'typewriter' | 'glow-pulse' | 'fade-in-char';
  animationSpeed?: number;     // 0.5 ~ 3.0 (default 1.0)
  animationAmplitude?: number; // pixels for bounce/wave (default 10)
  animationDelay?: number;     // per-char delay in ms (default 50)

  groupId?: string;  // clips with same groupId move/delete together

  // --- Transition ---
  transitionIn?: {
    type: 'dissolve' | 'fade' | 'wipeleft' | 'wiperight' | 'wipeup' | 'wipedown' | 'slideleft' | 'slideright';
    duration: number;  // frames
  };
  transitionOut?: {
    type: 'dissolve' | 'fade' | 'wipeleft' | 'wiperight' | 'wipeup' | 'wipedown' | 'slideleft' | 'slideright';
    duration: number;  // frames
  };
  locked: boolean;
  visible: boolean;
}

export function createDefaultClip(
  ov: Partial<Clip> & Pick<Clip, 'id' | 'type' | 'trackId' | 'name'>
): Clip {
  return {
    startFrame: 0,
    durationFrames: 150,
    sourceStart: 0,
    sourceDuration: 5,
    x: 0,
    y: 0,
    width: DEFAULT_PROJECT.width,
  height: DEFAULT_PROJECT.height,
    rotation: 0,
    opacity: 100,
    brightness: 0,
    contrast: 100,
    saturation: 100,
    blur: 0,
    volume: 100,
    muted: false,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    locked: false,
    visible: true,
    ...ov,
  };
}

/** Interpolate volume at a given position (0~1) from envelope */
export function getEnvelopeVolume(envelope: VolumePoint[] | undefined, position: number): number {
  if (!envelope || envelope.length === 0) return 100;
  if (envelope.length === 1) return envelope[0].volume;
  const sorted = [...envelope].sort((a, b) => a.position - b.position);
  if (position <= sorted[0].position) return sorted[0].volume;
  if (position >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].volume;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (position >= a.position && position <= b.position) {
      const t = (position - a.position) / (b.position - a.position);
      return a.volume + (b.volume - a.volume) * t;
    }
  }
  return 100;
}

/** Keys of Clip that hold numeric values - used for sliders in Effects/Transitions panels */
export type ClipNumericKey = 'brightness' | 'contrast' | 'saturation' | 'blur' | 'opacity' | 'volume' | 'speed' | 'fadeIn' | 'fadeOut' | 'rotation';

/** Safely get a numeric clip property */
export function getClipNumericValue(clip: Clip, key: ClipNumericKey): number {
  return clip[key] ?? 0;
}