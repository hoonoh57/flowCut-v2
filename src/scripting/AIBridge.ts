import type { FlowScript } from "./flowscript.schema";

const SYSTEM_PROMPT = `You are a video scene planner. Given a topic, generate exactly 8 scenes for a 30-second vertical YouTube Shorts video.

RESPOND WITH ONLY A JSON OBJECT, no markdown, no explanation, no code fences.

Format:
{
  "scenes": [
    { "prompt": "detailed English image generation prompt, vertical 9:16 composition, cinematic", "text": "Korean overlay text, max 8 words" },
    ...8 items total
  ]
}

Rules:
- Scene 1: most dramatic/eye-catching moment (this is the hook, must stop scrolling)
- Scene 2-3: establish context and setting
- Scene 4-7: main content, each scene visually distinct
- Scene 8: callback to scene 1 for loop effect
- All "prompt" values: English, detailed, include lighting/mood/composition
- All "text" values: Korean, short (3-8 words), emotionally engaging
- Each scene must be visually DIFFERENT (vary: angle, subject, distance, lighting)
- Include: wide shots, close-ups, aerial views, detail shots
- ONLY output the JSON object, nothing else`;

export interface AIBridgeConfig {
  provider: "ollama" | "openai" | "anthropic";
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
}

const DEFAULT_CONFIG: AIBridgeConfig = {
  provider: "ollama",
  model: "qwen3-coder:30b",
  baseUrl: "http://localhost:11434",
  temperature: 0.2
};

export class AIBridge {
  private config: AIBridgeConfig;

  constructor(config?: Partial<AIBridgeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async promptToScript(prompt: string): Promise<{ script?: any; error?: string }> {
    try {
      const raw = await this.callLLM(prompt);
      // Try to parse JSON from LLM response
      let cleaned = raw.trim();
      // Remove markdown code fences if present
      cleaned = cleaned.replace(/\`\`\`json?\n?/g, "").replace(/\`\`\`/g, "").trim();
      // Find JSON object boundaries
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      const parsed = JSON.parse(cleaned);
      return { script: parsed };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  async generateFromPrompt(prompt: string): Promise<{ script?: any; error?: string }> {
    return this.promptToScript(prompt);
  }

  private async callLLM(prompt: string): Promise<string> {
    switch (this.config.provider) {
      case "ollama": return this.callOllama(prompt);
      case "openai": return this.callOpenAI(prompt);
      case "anthropic": return this.callAnthropic(prompt);
      default: throw new Error("Unknown provider: " + this.config.provider);
    }
  }

  private async callOllama(prompt: string): Promise<string> {
    const resp = await fetch(
      (this.config.baseUrl || "http://localhost:11434") + "/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model || "qwen3-coder:30b",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ],
          stream: false,
          options: { temperature: this.config.temperature || 0.2, num_predict: 8192 }
        })
      }
    );
    const data = await resp.json();
    return (data.message?.content || data.response) || "";
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (this.config.apiKey || "")
      },
      body: JSON.stringify({
        model: this.config.model || "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: this.config.temperature || 0.3,
        max_tokens: 4096
      })
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.config.model || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        temperature: this.config.temperature || 0.3
      })
    });
    const data = await resp.json();
    return data.content?.[0]?.text || "";
  }
}

export const aiBridge = new AIBridge();