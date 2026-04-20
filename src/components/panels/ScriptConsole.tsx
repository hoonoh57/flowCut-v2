import React, { useState, useRef, useCallback } from "react";
import { ScriptEngine } from "../../scripting/ScriptEngine";
import { AIBridge } from "../../scripting/AIBridge";
import { theme } from "../../styles/theme";
import type { FlowScript } from "../../scripting/flowscript.schema";
import { buildDirectorPlan, planToFlowScript } from "../../scripting/VideoDirector";

export const ScriptConsole: React.FC = () => {
  const [mode, setMode] = useState<"prompt" | "script" | "log">("prompt");
  const [prompt, setPrompt] = useState("");
  const [scriptJson, setScriptJson] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState({ provider: "ollama" as const, model: "gemma4:e4b" });

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, "[" + new Date().toLocaleTimeString() + "] " + msg]);
  }, []);

  const handlePromptSubmit = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    addLog("Prompt: " + prompt);
    addLog("Director 모드: LLM에 씬 배열 요청 중...");
    try {
      const bridge = new AIBridge(aiConfig);
      const result = await bridge.promptToScript(prompt);

      // LLM 응답에서 scenes 배열 추출
      let scenes: {prompt: string; text: string}[] = [];
      try {
        let raw = result.script || result.error || "";
        if (typeof raw === "string") {
          raw = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(raw);
          scenes = parsed.scenes || parsed;
        } else if (raw && typeof raw === "object") {
          // result.script가 이미 객체인 경우
          if (Array.isArray(raw.scenes)) scenes = raw.scenes;
          else if (Array.isArray(raw.clips)) {
            // 기존 FlowScript 형식으로 온 경우 그대로 사용
            setScriptJson(JSON.stringify(raw, null, 2));
            addLog("FlowScript 직접 수신 (" + raw.clips.length + " clips) - 기존 방식");
            setMode("script");
            setLoading(false);
            return;
          } else if (Array.isArray(raw)) scenes = raw;
        }
      } catch (parseErr: any) {
        addLog("JSON 파싱 시도: " + parseErr.message);
      }

      if (!Array.isArray(scenes) || scenes.length < 2) {
        addLog("ERROR: 유효한 씬 배열을 받지 못함 (received: " + JSON.stringify(scenes).substring(0, 200) + ")");
        setLoading(false);
        return;
      }

      addLog("LLM 응답: " + scenes.length + "개 씬 수신");
      scenes.forEach((s, i) => addLog("  [" + (i+1) + "] " + (s.text || "no text") + " | " + (s.prompt || "no prompt").substring(0, 60)));

      // Director Plan 생성 (최소 8개 씬 보장)
      const plan = buildDirectorPlan(scenes, { durationSec: 30, fps: 30 });
      addLog("Director Plan: " + plan.beats.length + " beats (" + plan.templateId + ")");

      // FlowScript 변환
      const flowScript = planToFlowScript(plan);
      addLog("FlowScript 생성: " + flowScript.media.length + " media, " + flowScript.clips.length + " clips");

      setScriptJson(JSON.stringify(flowScript, null, 2));
      setMode("script");
      addLog("Director FlowScript 준비 완료. Execute를 눌러 실행하세요.");

    } catch (err: any) { addLog("ERROR: " + err.message); }
    setLoading(false);
  }, [prompt, aiConfig, addLog]);

  const handleExecute = useCallback(async () => {
    if (!scriptJson.trim()) return;
    setLoading(true);
    addLog("Executing FlowScript...");
    try {
      const script: FlowScript = JSON.parse(scriptJson);
      const engine = new ScriptEngine();
      const result = await engine.execute(script);
      for (const line of result.log) addLog(line);
      for (const err of result.errors) addLog("ERROR: " + err);
      addLog(result.success ? "SUCCESS (" + result.duration + "ms, " + result.clipIds.length + " clips)" : "FAILED with " + result.errors.length + " errors");
      setMode("log");
    } catch (err: any) { addLog("PARSE ERROR: " + err.message); }
    setLoading(false);
  }, [scriptJson, addLog]);

  const handleExportScript = useCallback(() => {
    const script = ScriptEngine.toFlowScript();
    setScriptJson(JSON.stringify(script, null, 2));
    addLog("Current project exported to FlowScript");
    setMode("script");
  }, [addLog]);

  const handleSaveScript = useCallback(() => {
    const blob = new Blob([scriptJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "flowscript_" + Date.now() + ".json"; a.click();
    URL.revokeObjectURL(url);
    addLog("Script saved to file");
  }, [scriptJson, addLog]);

  const handleLoadScript = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => { setScriptJson(ev.target?.result as string || ""); addLog("Loaded: " + file.name); setMode("script"); };
      reader.readAsText(file);
    };
    input.click();
  }, [addLog]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
    borderRadius: "4px 4px 0 0",
    background: active ? theme.colors.accent.blue : "transparent",
    color: active ? "#fff" : theme.colors.text.muted,
  });

  const btnStyle: React.CSSProperties = {
    padding: "6px 14px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 4,
    cursor: "pointer", background: theme.colors.accent.blue, color: "#fff",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: theme.colors.bg.primary }}>
      <div style={{ display: "flex", gap: 2, padding: "4px 8px", flexWrap: "wrap", borderBottom: "1px solid " + theme.colors.border.default }}>
        <button style={tabStyle(mode === "prompt")} onClick={() => setMode("prompt")}>AI Prompt</button>
        <button style={tabStyle(mode === "script")} onClick={() => setMode("script")}>FlowScript</button>
        <button style={tabStyle(mode === "log")} onClick={() => setMode("log")}>Log</button>
        <div style={{ flex: 1 }} />
        <button style={{ ...btnStyle, background: theme.colors.accent.green, fontSize: 9, padding: "2px 6px", whiteSpace: "nowrap" }} onClick={handleExportScript}>Export State</button>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {mode === "prompt" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 8, gap: 8 }}>
            <div style={{ fontSize: 11, color: theme.colors.text.muted }}>Describe the video you want to create.</div>
            <select value={aiConfig.provider} onChange={e => setAiConfig({ ...aiConfig, provider: e.target.value as any })} style={{ padding: 4, fontSize: 11, background: theme.colors.bg.secondary, color: theme.colors.text.primary, border: "1px solid " + theme.colors.border.default, borderRadius: 4 }}>
              <option value="ollama">Ollama (Local)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="30-second YouTube Shorts video about spring in Pohang. 9:16 vertical. Add title, music, auto-subtitle. Export as MP4." style={{ flex: 1, resize: "none", padding: 8, fontSize: 12, background: theme.colors.bg.secondary, color: theme.colors.text.primary, border: "1px solid " + theme.colors.border.default, borderRadius: 4, fontFamily: "inherit" }} />
            <button style={btnStyle} onClick={handlePromptSubmit} disabled={loading}>{loading ? "Generating..." : "Generate FlowScript"}</button>
          </div>
        )}

        {mode === "script" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 8, gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btnStyle} onClick={handleExecute} disabled={loading}>{loading ? "Running..." : "Execute"}</button>
              <button style={{ ...btnStyle, background: theme.colors.accent.green }} onClick={handleSaveScript}>Save</button>
              <button style={{ ...btnStyle, background: theme.colors.accent.amber }} onClick={handleLoadScript}>Load</button>
            </div>
            <textarea value={scriptJson} onChange={e => setScriptJson(e.target.value)} style={{ flex: 1, resize: "none", padding: 8, fontSize: 11, background: "#0d1117", color: "#c9d1d9", border: "1px solid " + theme.colors.border.default, borderRadius: 4, fontFamily: "Consolas, monospace", lineHeight: 1.4 }} spellCheck={false} />
          </div>
        )}

        {mode === "log" && (
          <div style={{ flex: 1, overflow: "auto", padding: 8, background: "#0d1117", fontFamily: "Consolas, monospace", fontSize: 11 }}>
            {logs.map((line, i) => (
              <div key={i} style={{ color: line.includes("ERROR") ? theme.colors.accent.red : line.includes("SUCCESS") ? theme.colors.accent.green : line.includes("[Action]") ? theme.colors.accent.amber : "#8b949e", padding: "1px 0" }}>{line}</div>
            ))}
            {logs.length === 0 && <div style={{ color: theme.colors.text.muted }}>No logs yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
};