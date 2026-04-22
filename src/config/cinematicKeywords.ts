// src/config/cinematicKeywords.ts
// 42 Cinematic Camera Movements + Scene Type Detection + Auto Enhancement

export interface CameraMove {
  id: string;
  name: string;
  prompt: string;
  energy: 'low' | 'medium' | 'high';
  sceneTypes: string[];
}

export const CAMERA_MOVES: CameraMove[] = [
  // --- Dolly ---
  { id: 'dolly-in', name: 'Dolly In', prompt: 'slow dolly in, camera moving forward', energy: 'medium', sceneTypes: ['portrait', 'emotion', 'reveal'] },
  { id: 'dolly-out', name: 'Dolly Out', prompt: 'slow dolly out, camera pulling back', energy: 'low', sceneTypes: ['landscape', 'ending', 'reveal'] },
  { id: 'dolly-zoom', name: 'Dolly Zoom', prompt: 'dolly zoom vertigo effect', energy: 'high', sceneTypes: ['suspense', 'emotion'] },

  // --- Pan ---
  { id: 'pan-left', name: 'Pan Left', prompt: 'smooth pan left', energy: 'medium', sceneTypes: ['landscape', 'follow', 'explore'] },
  { id: 'pan-right', name: 'Pan Right', prompt: 'smooth pan right', energy: 'medium', sceneTypes: ['landscape', 'follow', 'explore'] },
  { id: 'whip-pan', name: 'Whip Pan', prompt: 'fast whip pan, motion blur', energy: 'high', sceneTypes: ['action', 'transition', 'comedy'] },

  // --- Tilt ---
  { id: 'tilt-up', name: 'Tilt Up', prompt: 'slow tilt up, revealing sky', energy: 'low', sceneTypes: ['landscape', 'reveal', 'epic'] },
  { id: 'tilt-down', name: 'Tilt Down', prompt: 'slow tilt down, revealing subject', energy: 'low', sceneTypes: ['portrait', 'reveal'] },

  // --- Tracking ---
  { id: 'track-left', name: 'Track Left', prompt: 'tracking shot moving left alongside subject', energy: 'medium', sceneTypes: ['walk', 'follow', 'action'] },
  { id: 'track-right', name: 'Track Right', prompt: 'tracking shot moving right alongside subject', energy: 'medium', sceneTypes: ['walk', 'follow', 'action'] },
  { id: 'track-follow', name: 'Follow Shot', prompt: 'camera following subject from behind', energy: 'medium', sceneTypes: ['walk', 'chase', 'explore'] },
  { id: 'track-lead', name: 'Lead Shot', prompt: 'camera leading subject from front', energy: 'medium', sceneTypes: ['walk', 'portrait'] },

  // --- Crane ---
  { id: 'crane-up', name: 'Crane Up', prompt: 'crane shot rising upward, aerial perspective', energy: 'high', sceneTypes: ['epic', 'landscape', 'ending'] },
  { id: 'crane-down', name: 'Crane Down', prompt: 'crane shot descending toward subject', energy: 'medium', sceneTypes: ['reveal', 'intro'] },

  // --- Orbit ---
  { id: 'orbit-cw', name: 'Orbit CW', prompt: 'orbiting clockwise around subject', energy: 'medium', sceneTypes: ['portrait', 'product', 'dramatic'] },
  { id: 'orbit-ccw', name: 'Orbit CCW', prompt: 'orbiting counter-clockwise around subject', energy: 'medium', sceneTypes: ['portrait', 'product', 'dramatic'] },
  { id: 'orbit-360', name: '360 Orbit', prompt: 'full 360 degree orbit around subject', energy: 'high', sceneTypes: ['epic', 'dramatic', 'product'] },

  // --- Zoom ---
  { id: 'zoom-in', name: 'Zoom In', prompt: 'smooth zoom in on subject', energy: 'medium', sceneTypes: ['portrait', 'detail', 'emotion'] },
  { id: 'zoom-out', name: 'Zoom Out', prompt: 'smooth zoom out revealing scene', energy: 'low', sceneTypes: ['landscape', 'context'] },
  { id: 'crash-zoom', name: 'Crash Zoom', prompt: 'rapid crash zoom into subject', energy: 'high', sceneTypes: ['action', 'comedy', 'shock'] },

  // --- Steadicam ---
  { id: 'steadicam-walk', name: 'Steadicam Walk', prompt: 'smooth steadicam walking shot, fluid motion', energy: 'medium', sceneTypes: ['walk', 'explore', 'follow'] },
  { id: 'steadicam-float', name: 'Steadicam Float', prompt: 'floating steadicam, ethereal smooth movement', energy: 'low', sceneTypes: ['dream', 'romantic', 'peaceful'] },

  // --- Handheld ---
  { id: 'handheld-subtle', name: 'Handheld Subtle', prompt: 'subtle handheld camera, natural slight shake', energy: 'medium', sceneTypes: ['documentary', 'realistic', 'intimate'] },
  { id: 'handheld-shaky', name: 'Handheld Shaky', prompt: 'shaky handheld camera, urgent feel', energy: 'high', sceneTypes: ['action', 'chase', 'tension'] },

  // --- Aerial ---
  { id: 'aerial-high', name: 'Aerial High', prompt: 'high aerial drone shot, birds eye view', energy: 'medium', sceneTypes: ['landscape', 'epic', 'establishing'] },
  { id: 'aerial-low', name: 'Aerial Low', prompt: 'low aerial flyover, skimming surface', energy: 'high', sceneTypes: ['landscape', 'action', 'chase'] },
  { id: 'aerial-reveal', name: 'Aerial Reveal', prompt: 'aerial shot rising to reveal vast landscape', energy: 'high', sceneTypes: ['epic', 'establishing'] },

  // --- Static ---
  { id: 'static-wide', name: 'Static Wide', prompt: 'static wide shot, no camera movement', energy: 'low', sceneTypes: ['landscape', 'establishing', 'dialogue'] },
  { id: 'static-close', name: 'Static Close-up', prompt: 'static close-up shot, no camera movement', energy: 'low', sceneTypes: ['portrait', 'emotion', 'detail'] },
  { id: 'static-medium', name: 'Static Medium', prompt: 'static medium shot, no camera movement', energy: 'low', sceneTypes: ['dialogue', 'portrait'] },

  // --- Special ---
  { id: 'over-shoulder', name: 'Over Shoulder', prompt: 'over the shoulder shot', energy: 'low', sceneTypes: ['dialogue', 'portrait'] },
  { id: 'pov', name: 'POV', prompt: 'first person point of view shot', energy: 'medium', sceneTypes: ['action', 'explore', 'immersive'] },
  { id: 'dutch-angle', name: 'Dutch Angle', prompt: 'tilted dutch angle, disorienting', energy: 'high', sceneTypes: ['suspense', 'horror', 'dramatic'] },
  { id: 'birds-eye', name: 'Birds Eye', prompt: 'top-down birds eye view', energy: 'medium', sceneTypes: ['establishing', 'planning', 'food'] },
  { id: 'worms-eye', name: 'Worms Eye', prompt: 'low angle worms eye view looking up', energy: 'medium', sceneTypes: ['epic', 'power', 'dramatic'] },
  { id: 'rack-focus', name: 'Rack Focus', prompt: 'rack focus shifting between foreground and background', energy: 'medium', sceneTypes: ['reveal', 'dramatic', 'portrait'] },
  { id: 'push-in', name: 'Push In', prompt: 'slow push in toward subject, building intensity', energy: 'medium', sceneTypes: ['suspense', 'emotion', 'reveal'] },
  { id: 'pull-out', name: 'Pull Out', prompt: 'pull out revealing wider context', energy: 'low', sceneTypes: ['ending', 'context'] },

  // --- Hyperlapse ---
  { id: 'hyperlapse', name: 'Hyperlapse', prompt: 'hyperlapse time-lapse with camera movement', energy: 'high', sceneTypes: ['landscape', 'city', 'transition'] },
  { id: 'timelapse', name: 'Timelapse', prompt: 'timelapse, time passing rapidly', energy: 'medium', sceneTypes: ['landscape', 'city', 'transition'] },

  // --- Cinematic Specific ---
  { id: 'kubrick-stare', name: 'Kubrick Stare', prompt: 'symmetrical centered shot, subject staring at camera', energy: 'high', sceneTypes: ['dramatic', 'horror', 'intense'] },
  { id: 'hitchcock-zoom', name: 'Hitchcock Zoom', prompt: 'dolly zoom vertigo effect, background stretching', energy: 'high', sceneTypes: ['suspense', 'shock'] },
];

// --- Scene Type Detection ---
export type SceneType = 'portrait' | 'landscape' | 'action' | 'dialogue' | 'emotion' | 'walk' | 'food' | 'product' | 'epic' | 'general';

const SCENE_KEYWORDS: Record<SceneType, string[]> = {
  portrait: ['face', 'portrait', 'close-up', 'headshot', 'looking', 'staring', 'eyes'],
  landscape: ['scenery', 'landscape', 'mountain', 'ocean', 'sunset', 'sunrise', 'sky', 'forest', 'field', 'city skyline'],
  action: ['running', 'fighting', 'jumping', 'chasing', 'battle', 'kick', 'punch', 'explosion', 'sword'],
  dialogue: ['talking', 'speaking', 'conversation', 'chat', 'discussion'],
  emotion: ['crying', 'laughing', 'smiling', 'sad', 'happy', 'angry', 'tears', 'joy', 'love'],
  walk: ['walking', 'strolling', 'wandering', 'hiking', 'jogging'],
  food: ['eating', 'cooking', 'food', 'restaurant', 'kitchen', 'coffee', 'tea', 'meal'],
  product: ['product', 'brand', 'showcase', 'display', 'unboxing'],
  epic: ['epic', 'grand', 'vast', 'majestic', 'dramatic reveal'],
  general: [],
};

export function detectSceneType(prompt: string): SceneType {
  const lc = prompt.toLowerCase();
  let bestType: SceneType = 'general';
  let bestScore = 0;

  for (const [type, keywords] of Object.entries(SCENE_KEYWORDS) as [SceneType, string[]][]) {
    const score = keywords.filter(k => lc.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestType;
}

// --- Lighting Suggestions ---
export interface LightingSuggestion {
  type: string;
  prompt: string;
}

const LIGHTING_BY_SCENE: Record<string, LightingSuggestion[]> = {
  portrait: [
    { type: 'rembrandt', prompt: 'Rembrandt lighting, dramatic side light' },
    { type: 'soft', prompt: 'soft diffused lighting, gentle shadows' },
    { type: 'backlit', prompt: 'backlit silhouette, rim light' },
  ],
  landscape: [
    { type: 'golden', prompt: 'golden hour lighting, warm sun low on horizon' },
    { type: 'blue', prompt: 'blue hour, twilight, cool ambient light' },
    { type: 'dramatic', prompt: 'dramatic clouds, volumetric light rays' },
  ],
  action: [
    { type: 'high-contrast', prompt: 'high contrast lighting, sharp shadows' },
    { type: 'neon', prompt: 'neon lighting, colorful reflections' },
  ],
  emotion: [
    { type: 'warm', prompt: 'warm soft lighting, intimate atmosphere' },
    { type: 'moody', prompt: 'moody low-key lighting, emotional shadows' },
  ],
  general: [
    { type: 'natural', prompt: 'natural lighting' },
  ],
};

export function suggestLighting(sceneType: SceneType): LightingSuggestion {
  const options = LIGHTING_BY_SCENE[sceneType] || LIGHTING_BY_SCENE['general'];
  return options[0];
}

// --- Camera Selection by Energy + Scene Type ---
export function suggestCamera(sceneType: SceneType, energy: 'low' | 'medium' | 'high'): CameraMove {
  const candidates = CAMERA_MOVES.filter(
    cm => cm.energy === energy && cm.sceneTypes.includes(sceneType)
  );
  if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];

  // Fallback: match energy only
  const fallback = CAMERA_MOVES.filter(cm => cm.energy === energy);
  if (fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];

  return CAMERA_MOVES[0]; // dolly-in as default
}

// --- Shot Size ---
export const SHOT_SIZES: Record<string, string> = {
  'extreme-wide': 'extreme wide shot, vast environment',
  'wide': 'wide shot, full body and environment',
  'medium-wide': 'medium wide shot, knee up',
  'medium': 'medium shot, waist up',
  'medium-close': 'medium close-up, chest up',
  'close': 'close-up shot, face and shoulders',
  'extreme-close': 'extreme close-up, eyes or detail',
};

export function suggestShotSize(sceneType: SceneType): string {
  const map: Record<string, string> = {
    portrait: 'medium-close',
    landscape: 'wide',
    action: 'medium-wide',
    dialogue: 'medium',
    emotion: 'close',
    walk: 'medium-wide',
    food: 'close',
    product: 'medium-close',
    epic: 'extreme-wide',
    general: 'medium',
  };
  const key = map[sceneType] || 'medium';
  return SHOT_SIZES[key] || SHOT_SIZES['medium'];
}
