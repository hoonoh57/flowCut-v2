import type { FlowScript } from "./flowscript.schema";

const SYSTEM_PROMPT = [
  "You are FlowCut AI. Generate a FlowScript JSON for video editing.",
  "Output ONLY valid JSON. No markdown, no explanation, no code blocks.",
  "",
  "=== EXACT JSON STRUCTURE (follow precisely) ===",
  "{",
  "  \"version\": \"1.0\",",
  "  \"project\": { \"width\": 1080, \"height\": 1920, \"fps\": 30 },",
  "  \"media\": [",
  "    { \"id\": \"bg1\", \"type\": \"image\", \"src\": \"ai://detailed image description in English\", \"aiWorkflow\": \"background-scene\" }",
  "  ],",
  "  \"tracks\": [",
  "    { \"id\": \"v1\", \"type\": \"video\" },",
  "    { \"id\": \"t1\", \"type\": \"text\" }",
  "  ],",
  "  \"clips\": [",
  "    { \"type\": \"image\", \"mediaId\": \"bg1\", \"trackId\": \"v1\", \"startFrame\": 0, \"durationFrames\": 225, \"width\": 1080, \"height\": 1920 },",
  "    { \"type\": \"text\", \"trackId\": \"t1\", \"startFrame\": 0, \"durationFrames\": 90, \"text\": \"Title\", \"textStyle\": { \"fontSize\": 64, \"fontColor\": \"#ffffff\" } }",
  "  ],",
  "  \"actions\": [",
  "    { \"action\": \"autoSubtitle\", \"language\": \"ko\" },",
  "    { \"action\": \"export\", \"format\": \"mp4\", \"quality\": \"high\", \"fileName\": \"output\" }",
  "  ]",
  "}",
  "",
  "=== CRITICAL RULES ===",
  "1. clips is a TOP-LEVEL array, NOT nested inside tracks",
  "2. media uses \"id\" (not \"mediaId\"), and \"src\" field (not \"prompt\" or \"aiPrompt\")",
  "3. src for AI images: \"ai://description in English\"",
  "4. Clips use startFrame + durationFrames (NOT endFrame, NOT start/duration)",
  "5. 30fps: 30sec = 900 frames. Create 3-5 image scenes spread across frames",
  "6. Available workflows: background-scene, title-card, anime-illustration, video-t2v, video-i2v",
  "7. NO audio generation via AI. Skip audio media if no file exists",
  "8. Text content in Korean for Korean topics",
  "9. Each image media needs a DIFFERENT detailed English prompt",
  "10. Clips MUST have width/height matching project dimensions"
].join("\n")

export interface AIBridgeConfig {
  provider: "ollama" | "openai" | "anthropic";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
}

const DEFAULT_CONFIG: AIBridgeConfig = { provider: "ollama", model: "qwen3-coder:30b", baseUrl: "http://localhost:11434", temperature: 0.3 };

export class AIBridge {
  private config: AIBridgeConfig;
  constructor(config?: Partial<AIBridgeConfig>) { this.config = { ...DEFAULT_CONFIG, ...config }; }

  async promptToScript(userPrompt: string): Promise<{ script: FlowScript | null; raw: string; error?: string }> {
    try {
      const raw = await this.callLLM(userPrompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { script: null, raw, error: "No JSON found in response" };
      const script = JSON.parse(jsonMatch[0]) as FlowScript;
      if (!script.version || !script.project || !script.clips) return { script: null, raw, error: "Invalid FlowScript structure" };
      script.version = "1.0";
      if (!script.metadata) script.metadata = {};
      script.metadata.prompt = userPrompt;
      script.metadata.aiModel = this.config.model;
      script.metadata.createdAt = new Date().toISOString();
      return { script, raw };
    } catch (err: any) { return { script: null, raw: "", error: err.message }; }
  }

  async refineScript(script: FlowScript, instruction: string): Promise<{ script: FlowScript | null; raw: string; error?: string }> {
    const prompt = "Here is the current FlowScript:\n```json\n" + JSON.stringify(script, null, 2) + "\n```\nUser instruction: " + instruction + "\nModify and return the complete updated JSON.";
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
    const resp = await fetch((this.config.baseUrl || "http://localhost:11434") + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: this.config.model || "qwen3-coder:30b", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], stream: false, options: { temperature: this.config.temperature || 0.2, num_predict: 8192 } }) });
    const data = await resp.json();
    return (data.message?.content || data.response) || "";
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (this.config.apiKey || "") }, body: JSON.stringify({ model: this.config.model || "gpt-4o", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], temperature: this.config.temperature || 0.3, max_tokens: 4096 }) });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const resp = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": this.config.apiKey || "", "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: this.config.model || "claude-opus-4-6", max_tokens: 4096, system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }], temperature: this.config.temperature || 0.3 }) });
    const data = await resp.json();
    return data.content?.[0]?.text || "";
  }
}

export const aiBridge = new AIBridge();