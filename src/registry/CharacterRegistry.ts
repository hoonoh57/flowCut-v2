// src/registry/CharacterRegistry.ts
// Character Registry — seed + prompt DB for consistent character generation

import type { WorldCharacter } from '../scripting/WorldContext';

export interface RegisteredCharacter {
  key: string;
  name: string;
  created: string;
  generation: {
    model: string;
    seed: number;
    prompt: string;
    negative: string;
    width: number;
    height: number;
  };
  sheets: {
    front?: string;
    side?: string;
    fullBody?: string;
  };
  wardrobeSheets: Record<string, string>;
  voice: {
    engine: string;
    preset?: string;
    sampleClip?: string | null;
    language: string;
  };
  motion: {
    style: string;
    defaultPose: string;
  };
}

export interface CharacterDB {
  version: string;
  characters: Record<string, RegisteredCharacter>;
}

const STORAGE_KEY = 'flowcut_character_registry';

// --- Load from localStorage ---
export function loadRegistry(): CharacterDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { version: '1.0', characters: {} };
}

// --- Save to localStorage ---
export function saveRegistry(db: CharacterDB): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

// --- Register a character ---
export function registerCharacter(
  key: string,
  name: string,
  seed: number,
  prompt: string,
  options?: {
    model?: string;
    negative?: string;
    width?: number;
    height?: number;
    voice?: RegisteredCharacter['voice'];
    motion?: RegisteredCharacter['motion'];
  }
): RegisteredCharacter {
  const db = loadRegistry();

  const char: RegisteredCharacter = {
    key,
    name,
    created: new Date().toISOString(),
    generation: {
      model: options?.model || 'DreamShaperXL_Turbo_v2',
      seed,
      prompt,
      negative: options?.negative || 'blurry, ugly, deformed',
      width: options?.width || 1024,
      height: options?.height || 1024,
    },
    sheets: {},
    wardrobeSheets: {},
    voice: options?.voice || {
      engine: 'edge-tts',
      preset: 'ko-KR-SunHiNeural',
      language: 'ko',
    },
    motion: options?.motion || {
      style: 'natural, gentle',
      defaultPose: 'relaxed',
    },
  };

  db.characters[key] = char;
  saveRegistry(db);
  return char;
}

// --- Get a character ---
export function getCharacter(key: string): RegisteredCharacter | null {
  const db = loadRegistry();
  return db.characters[key] || null;
}

// --- List all characters ---
export function listCharacters(): RegisteredCharacter[] {
  const db = loadRegistry();
  return Object.values(db.characters);
}

// --- Delete a character ---
export function deleteCharacter(key: string): boolean {
  const db = loadRegistry();
  if (!db.characters[key]) return false;
  delete db.characters[key];
  saveRegistry(db);
  return true;
}

// --- Update character sheet paths ---
export function updateCharacterSheets(
  key: string,
  sheets: Partial<RegisteredCharacter['sheets']>
): boolean {
  const db = loadRegistry();
  const char = db.characters[key];
  if (!char) return false;
  char.sheets = { ...char.sheets, ...sheets };
  saveRegistry(db);
  return true;
}

// --- Convert registered character to WorldCharacter format ---
export function toWorldCharacter(reg: RegisteredCharacter): WorldCharacter {
  return {
    name: reg.name,
    description: reg.generation.prompt,
    faceRef: reg.sheets.front || null,
    bodyRef: reg.sheets.fullBody || null,
    voice: {
      engine: reg.voice.engine,
      preset: reg.voice.preset,
      sampleClip: reg.voice.sampleClip,
      language: reg.voice.language,
    },
    motion: {
      style: reg.motion.style,
      defaultPose: reg.motion.defaultPose,
    },
    generation: {
      seed: reg.generation.seed,
      model: reg.generation.model,
    },
  };
}

// --- Resolve $ref in world.characters ---
export function resolveCharacterRefs(
  characters: Record<string, any>
): Record<string, WorldCharacter> {
  const resolved: Record<string, WorldCharacter> = {};

  for (const [key, value] of Object.entries(characters)) {
    if (value && typeof value === 'object' && value['$ref']) {
      // $ref: "registry:yuna" -> load from registry
      const refKey = value['$ref'].replace('registry:', '');
      const reg = getCharacter(refKey);
      if (reg) {
        resolved[key] = toWorldCharacter(reg);
      } else {
        console.warn('[CharacterRegistry] Not found:', refKey);
        resolved[key] = value as WorldCharacter;
      }
    } else if (value && typeof value === 'object' && value['$seed']) {
      // $seed shorthand: { $seed: 123, name: "Yuna", ... }
      const worldChar: WorldCharacter = {
        ...value,
        generation: { seed: value['$seed'], model: value['$model'] },
      };
      delete (worldChar as any)['$seed'];
      delete (worldChar as any)['$model'];
      resolved[key] = worldChar;
    } else {
      resolved[key] = value as WorldCharacter;
    }
  }

  return resolved;
}

// --- Expose to browser console for testing ---
if (typeof window !== 'undefined') {
  (window as any).__flowcut_registry = {
    register: registerCharacter,
    get: getCharacter,
    list: listCharacters,
    remove: deleteCharacter,
    load: loadRegistry,
  };
}
