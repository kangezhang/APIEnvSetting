import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Eraser,
  Eye,
  EyeOff,
  FileJson,
  KeyRound,
  Loader2,
  RefreshCcw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  Trash2,
  Wallet,
} from "lucide-react";
import "./styles.css";
import { ModelRankPage } from "./ModelRankPage";

type PresetId = "deepseek" | "xai-grok" | "aicoding-0011" | "claudecode-uk" | "qwen-token-plan" | "qwen-payg";

type ClaudeConfig = {
  provider: string;
  plan?: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  haikuModel: string;
  sonnetModel: string;
  opusModel: string;
  subagentModel: string;
  maxContextTokens?: string;
  effortLevel?: string;
  includeApiKeyEnv?: boolean;
  includeModelEnv?: boolean;
};

type ConfigStatus = {
  settingsPath: string;
  onboardingPath: string;
  settingsExists: boolean;
  onboardingExists: boolean;
  configuredProvider?: string;
  configuredBaseUrl?: string;
  configuredModel?: string;
  configuredAuthTokenPreview?: string;
  claudeVersion?: string;
  settingsBackupCount: number;
  backupsWithTokenCount: number;
};

type ApiKeyStatus = {
  presetId: PresetId;
  hasSavedKey: boolean;
  apiKeyPreview?: string;
};

type ApplyConfigResult = {
  settingsPath: string;
  onboardingPath: string;
  settingsBackupPath?: string;
  onboardingBackupPath?: string;
  provider: string;
  plan?: string;
  env: Record<string, string>;
};

type CleanupBackupsResult = {
  scannedCount: number;
  redactedCount: number;
  redactedPaths: string[];
};

type ClearConfigResult = {
  settingsPath: string;
  settingsBackupPath?: string;
  removedKeys: string[];
};

type ClearLocalEnvironmentResult = {
  removedKeys: string[];
};

type DeepSeekBalanceInfo = {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
};

type DeepSeekBalanceResult = {
  is_available: boolean;
  balance_infos: DeepSeekBalanceInfo[];
};

type Preset = {
  id: PresetId;
  title: string;
  subtitle: string;
  badge: string;
  note: string;
  config: Omit<ClaudeConfig, "apiKey">;
};

type ProviderModelOption = {
  id: string;
  name: string;
  description: string;
  badge: string;
  brand?: string;
  contextTokens?: string;
  haikuModel?: string;
  subagentModel?: string;
};

const qwenTokenPlanModels: ProviderModelOption[] = [
  {
    id: "qwen3.8-max-preview",
    name: "Qwen3.8-Max Preview",
    description: "当前默认 Token Plan 文本/推理模型，保留原有长上下文配置。",
    badge: "default",
    brand: "千问",
    contextTokens: "983616",
    subagentModel: "qwen3.7-max",
  },
  {
    id: "qwen3.8-max",
    name: "Qwen3.8-Max",
    description: "Token Plan 千问旗舰文本与推理模型，适合复杂 Agent、编码和多模态理解任务。",
    badge: "text",
    brand: "千问",
    contextTokens: "983616",
    subagentModel: "qwen3.7-max",
  },
  {
    id: "qwen3.7-plus",
    name: "Qwen3.7-Plus",
    description: "Token Plan 千问 Plus 文本与推理模型，适合日常开发和通用任务。",
    badge: "text",
    brand: "千问",
    contextTokens: "983616",
    subagentModel: "qwen3.7-plus",
  },
  {
    id: "qwen3.7-max",
    name: "Qwen3.7-Max",
    description: "Token Plan 千问 Max 文本与推理模型，适合长任务和复杂代码理解。",
    badge: "text",
    brand: "千问",
    contextTokens: "983616",
    subagentModel: "qwen3.7-max",
  },
  {
    id: "qwen3.6-flash",
    name: "Qwen3.6-Flash",
    description: "Token Plan 千问轻量快速模型，适合低成本 Haiku/Subagent 辅助任务。",
    badge: "fast",
    brand: "千问",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "qwen-audio-3.0-tts-plus",
    name: "Qwen Audio 3.0 TTS Plus",
    description: "Token Plan 实时语音合成模型；选择后仍会写入 Claude Code 模型环境变量，可在高级项手动调整映射。",
    badge: "audio",
    brand: "千问",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "qwen-audio-3.0-realtime-plus",
    name: "Qwen Audio 3.0 Realtime Plus",
    description: "Token Plan Realtime Chatting 模型；选择后仍会写入 Claude Code 模型环境变量，可在高级项手动调整映射。",
    badge: "audio",
    brand: "千问",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "wan2.7-image",
    name: "Wan2.7 Image",
    description: "Token Plan 图片生成模型；适合需要直接指定图片模型 ID 的自定义配置。",
    badge: "image",
    brand: "万相",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "wan2.7-image-pro",
    name: "Wan2.7 Image Pro",
    description: "Token Plan 图片生成 Pro 模型；适合需要直接指定图片模型 ID 的自定义配置。",
    badge: "image",
    brand: "万相",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "happyhorse-1.1-i2v",
    name: "HappyHorse 1.1 I2V",
    description: "Token Plan 图生视频模型；适合需要直接指定视频模型 ID 的自定义配置。",
    badge: "video",
    brand: "HappyHorse",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "happyhorse-1.1-t2v",
    name: "HappyHorse 1.1 T2V",
    description: "Token Plan 文生视频模型；适合需要直接指定视频模型 ID 的自定义配置。",
    badge: "video",
    brand: "HappyHorse",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "happyhorse-1.1-r2v",
    name: "HappyHorse 1.1 R2V",
    description: "Token Plan 参考视频生成模型；适合需要直接指定视频模型 ID 的自定义配置。",
    badge: "video",
    brand: "HappyHorse",
    contextTokens: "983616",
    subagentModel: "qwen3.6-flash",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    description: "Token Plan DeepSeek 文本与推理模型，适合复杂推理和编码任务。",
    badge: "text",
    brand: "DeepSeek",
    contextTokens: "983616",
    subagentModel: "deepseek-v4-pro",
  },
  {
    id: "deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash 0731",
    description: "Token Plan DeepSeek 快速文本与推理模型，适合低延迟辅助任务。",
    badge: "text",
    brand: "DeepSeek",
    contextTokens: "983616",
    subagentModel: "deepseek-v4-flash-0731",
  },
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    description: "Token Plan 智谱 GLM-5.2 文本与推理模型，适合规划、推理和复杂代码理解。",
    badge: "text",
    brand: "智谱AI",
    contextTokens: "983616",
    subagentModel: "glm-5.2",
  },
];

const qwenPaygModels: ProviderModelOption[] = [
  {
    id: "ZHIPU/GLM-5.2",
    name: "ZHIPU/GLM-5.2",
    description: "智谱原厂直供 GLM-5.2，适合长程任务、规划、推理和复杂代码理解。",
    badge: "1M context",
    contextTokens: "1000000",
    subagentModel: "ZHIPU/GLM-5.2",
  },
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    description: "智谱旗舰长程任务模型，适合规划、推理、复杂代码理解。",
    badge: "1M context",
    contextTokens: "1000000",
    subagentModel: "glm-5.2",
  },
  {
    id: "kimi/kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    description: "月之暗面编程专用模型，适合多文件实现、重构、长会话调试。",
    badge: "262K context",
    contextTokens: "262144",
    subagentModel: "kimi/kimi-k2.7-code",
  },
  {
    id: "qwen3.7-max",
    name: "Qwen3.7-Max",
    description: "千问按量计费默认旗舰文本模型，适合通用 Agent 与编码任务。",
    badge: "1M context",
    contextTokens: "1000000",
    subagentModel: "qwen3.7-max",
  },
  {
    id: "qwen3.7-plus",
    name: "Qwen3.7-Plus",
    description: "高性价比 Plus 模型，适合日常开发和较长上下文任务。",
    badge: "1M context",
    contextTokens: "1000000",
    subagentModel: "qwen3.7-plus",
  },
  {
    id: "qwen3.6-flash",
    name: "Qwen3.6-Flash",
    description: "轻量快速模型，适合便宜的 Haiku/Subagent 辅助任务。",
    badge: "fast",
    subagentModel: "qwen3.6-flash",
  },
];

const presets: Preset[] = [
  {
    id: "deepseek",
    title: "DeepSeek",
    subtitle: "DeepSeek Anthropic API",
    badge: "deepseek-v4",
    note: "按 DeepSeek 文档配置 Claude Code 的 Anthropic 兼容入口，含高低档模型映射。",
    config: {
      provider: "DeepSeek",
      baseUrl: "https://api.deepseek.com/anthropic",
      model: "deepseek-v4-pro[1m]",
      haikuModel: "deepseek-v4-flash",
      sonnetModel: "deepseek-v4-pro[1m]",
      opusModel: "deepseek-v4-pro[1m]",
      subagentModel: "deepseek-v4-flash",
      effortLevel: "max",
    },
  },
  {
    id: "xai-grok",
    title: "Grok",
    subtitle: "xAI Anthropic API",
    badge: "grok-4.5",
    note: "Use xAI's Anthropic-compatible /v1/messages endpoint for Claude Code. The default model is Grok 4.5.",
    config: {
      provider: "xAI",
      plan: "Grok",
      baseUrl: "https://api.x.ai",
      model: "grok-4.5",
      haikuModel: "grok-4.5",
      sonnetModel: "grok-4.5",
      opusModel: "grok-4.5",
      subagentModel: "grok-4.5",
      maxContextTokens: "500000",
    },
  },
  {
    id: "aicoding-0011",
    title: "0011 Claude",
    subtitle: "Custom Claude API",
    badge: "default",
    note: "Use the third-party Claude-compatible endpoint at https://aicoding.0011.ai. This preset follows the provider setup guide and lets 0011 route the model instead of forcing an explicit model ID.",
    config: {
      provider: "0011",
      plan: "Custom Claude API",
      baseUrl: "https://aicoding.0011.ai",
      model: "claude-sonnet-5",
      haikuModel: "claude-haiku-4-5",
      sonnetModel: "claude-sonnet-5",
      opusModel: "claude-opus-4-8",
      subagentModel: "claude-haiku-4-5",
      includeApiKeyEnv: true,
      includeModelEnv: false,
    },
  },
  {
    id: "claudecode-uk",
    title: "ClaudeCode UK",
    subtitle: "Card key Claude API",
    badge: "default",
    note: "Use the claudecode.uk card-key provider. The provider guide uses https://api.claudecode.uk with ANTHROPIC_AUTH_TOKEN only, so this preset does not force model variables.",
    config: {
      provider: "ClaudeCode UK",
      plan: "Card Key",
      baseUrl: "https://api.claudecode.uk",
      model: "sonnet",
      haikuModel: "haiku",
      sonnetModel: "sonnet",
      opusModel: "opus",
      subagentModel: "haiku",
      includeModelEnv: false,
    },
  },
  {
    id: "qwen-token-plan",
    title: "Qwen Token Plan",
    subtitle: "个人版 / 团队版",
    badge: "1M context",
    note: "使用千问 Token Plan Anthropic 入口，默认启用官方示例中的长上下文配置。",
    config: {
      provider: "Qwen",
      plan: "Token Plan",
      baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic",
      model: "qwen3.8-max-preview",
      haikuModel: "qwen3.6-flash",
      sonnetModel: "qwen3.8-max-preview",
      opusModel: "qwen3.8-max-preview",
      subagentModel: "qwen3.7-max",
      maxContextTokens: "983616",
    },
  },
  {
    id: "qwen-payg",
    title: "Qwen 按量计费",
    subtitle: "DashScope API Key / 模型市场",
    badge: "多模型",
    note: "使用千问按量计费 Anthropic 入口，可从模型市场选择 Qwen、GLM、Kimi 等模型。",
    config: {
      provider: "Qwen",
      plan: "按量计费",
      baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
      model: "qwen3.7-max",
      haikuModel: "qwen3.6-flash",
      sonnetModel: "qwen3.7-max",
      opusModel: "qwen3.7-max",
      subagentModel: "qwen3.7-max",
    },
  },
];

const managedKeys = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "CLAUDE_CODE_EFFORT_LEVEL",
];

function App() {
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("deepseek");
  const [selectedTokenPlanModelId, setSelectedTokenPlanModelId] = useState("qwen3.8-max-preview");
  const [selectedPaygModelId, setSelectedPaygModelId] = useState("qwen3.7-max");
  const [config, setConfig] = useState<ClaudeConfig>({
    ...presets[0].config,
    apiKey: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [apiKeyStatuses, setApiKeyStatuses] = useState<Record<PresetId, ApiKeyStatus>>({
    deepseek: { presetId: "deepseek", hasSavedKey: false },
    "xai-grok": { presetId: "xai-grok", hasSavedKey: false },
    "aicoding-0011": { presetId: "aicoding-0011", hasSavedKey: false },
    "claudecode-uk": { presetId: "claudecode-uk", hasSavedKey: false },
    "qwen-token-plan": { presetId: "qwen-token-plan", hasSavedKey: false },
    "qwen-payg": { presetId: "qwen-payg", hasSavedKey: false },
  });
  const [draftApiKeys, setDraftApiKeys] = useState<Record<PresetId, string>>({
    deepseek: "",
    "xai-grok": "",
    "aicoding-0011": "",
    "claudecode-uk": "",
    "qwen-token-plan": "",
    "qwen-payg": "",
  });
  const [result, setResult] = useState<ApplyConfigResult | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupBackupsResult | null>(null);
  const [clearResult, setClearResult] = useState<ClearConfigResult | null>(null);
  const [clearLocalEnvironmentResult, setClearLocalEnvironmentResult] = useState<ClearLocalEnvironmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cleaningBackups, setCleaningBackups] = useState(false);
  const [clearingConfig, setClearingConfig] = useState(false);
  const [clearingLocalEnvironment, setClearingLocalEnvironment] = useState(false);
  const [checkingDeepSeekBalance, setCheckingDeepSeekBalance] = useState(false);
  const [deepSeekBalance, setDeepSeekBalance] = useState<DeepSeekBalanceResult | null>(null);

  const selected = useMemo(
    () => presets.find((preset) => preset.id === selectedPreset) ?? presets[0],
    [selectedPreset],
  );
  const selectedKeyStatus = apiKeyStatuses[selectedPreset];
  const hasDraftKey = config.apiKey.trim().length > 0;
  const selectedPaygModel =
    qwenPaygModels.find((model) => model.id === config.model) ??
    qwenPaygModels.find((model) => model.id === "qwen3.7-max") ??
    qwenPaygModels[0];
  const selectedTokenPlanModel =
    qwenTokenPlanModels.find((model) => model.id === config.model) ??
    qwenTokenPlanModels.find((model) => model.id === "qwen3.8-max-preview") ??
    qwenTokenPlanModels[0];

  const previewEnv = useMemo(() => {
    const env: Record<string, string> = {
      ANTHROPIC_AUTH_TOKEN: config.apiKey
        ? maskToken(config.apiKey)
        : selectedKeyStatus.hasSavedKey
          ? `${selectedKeyStatus.apiKeyPreview}（已保存）`
          : "未填写",
      ANTHROPIC_BASE_URL: config.baseUrl,
    };
    if (config.includeApiKeyEnv) {
      env.ANTHROPIC_API_KEY = env.ANTHROPIC_AUTH_TOKEN;
    }
    if (config.includeModelEnv !== false) {
      env.ANTHROPIC_MODEL = config.model;
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = config.haikuModel;
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = config.sonnetModel;
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = config.opusModel;
      env.CLAUDE_CODE_SUBAGENT_MODEL = config.subagentModel;
      if (config.maxContextTokens?.trim()) {
        env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = config.maxContextTokens.trim();
      }
      if (config.effortLevel?.trim()) {
        env.CLAUDE_CODE_EFFORT_LEVEL = config.effortLevel.trim();
      }
    }
    return env;
  }, [config, selectedKeyStatus]);

  useEffect(() => {
    void refreshStatus();
    void refreshApiKeyStatuses();
  }, []);

  function selectPreset(preset: Preset) {
    setSelectedPreset(preset.id);
    const nextConfig =
      preset.id === "qwen-token-plan"
        ? configWithTokenPlanModel(preset.config, selectedTokenPlanModelId)
        : preset.id === "qwen-payg"
        ? configWithPaygModel(preset.config, selectedPaygModelId)
        : preset.config;
    setConfig({
      ...nextConfig,
      apiKey: draftApiKeys[preset.id] ?? "",
    });
    setShowKey(false);
    setDeepSeekBalance(null);
    clearMessages();
  }

  function updateApiKey(apiKey: string) {
    setConfig({ ...config, apiKey });
    setDraftApiKeys({
      ...draftApiKeys,
      [selectedPreset]: apiKey,
    });
    setDeepSeekBalance(null);
  }

  function applyPaygModel(modelId: string) {
    const option = qwenPaygModels.find((model) => model.id === modelId);
    if (!option) {
      return;
    }
    setSelectedPaygModelId(option.id);
    setConfig(configWithPaygModel(config, option.id));
    clearMessages();
  }

  function applyTokenPlanModel(modelId: string) {
    const option = qwenTokenPlanModels.find((model) => model.id === modelId);
    if (!option) {
      return;
    }
    setSelectedTokenPlanModelId(option.id);
    setConfig(configWithTokenPlanModel(config, option.id));
    clearMessages();
  }

  function clearMessages() {
    setResult(null);
    setCleanupResult(null);
    setClearResult(null);
    setClearLocalEnvironmentResult(null);
    setError(null);
  }

  async function checkDeepSeekBalance() {
    setCheckingDeepSeekBalance(true);
    setError(null);
    setDeepSeekBalance(null);
    try {
      const balance = await invoke<DeepSeekBalanceResult>("get_deepseek_balance", {
        request: {
          apiKey: config.apiKey,
        },
      });
      setDeepSeekBalance(balance);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCheckingDeepSeekBalance(false);
    }
  }

  async function refreshStatus() {
    setLoadingStatus(true);
    setError(null);
    try {
      const nextStatus = await invoke<ConfigStatus>("get_config_status");
      setStatus(nextStatus);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingStatus(false);
    }
  }

  async function refreshApiKeyStatuses() {
    try {
      const statuses = await invoke<ApiKeyStatus[]>("get_api_key_statuses");
      setApiKeyStatuses(
        statuses.reduce(
          (acc, status) => ({
            ...acc,
            [status.presetId]: status,
          }),
          {
            deepseek: { presetId: "deepseek", hasSavedKey: false },
            "xai-grok": { presetId: "xai-grok", hasSavedKey: false },
            "aicoding-0011": { presetId: "aicoding-0011", hasSavedKey: false },
            "claudecode-uk": { presetId: "claudecode-uk", hasSavedKey: false },
            "qwen-token-plan": { presetId: "qwen-token-plan", hasSavedKey: false },
            "qwen-payg": { presetId: "qwen-payg", hasSavedKey: false },
          } as Record<PresetId, ApiKeyStatus>,
        ),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function applyConfig() {
    setSaving(true);
    clearMessages();
    try {
      const applied = await invoke<ApplyConfigResult>("apply_claude_config", {
        request: {
          ...config,
          presetId: selectedPreset,
        },
      });
      setResult(applied);
      await refreshStatus();
      await refreshApiKeyStatuses();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function redactBackups() {
    setCleaningBackups(true);
    clearMessages();
    try {
      const cleaned = await invoke<CleanupBackupsResult>("redact_sensitive_backups");
      setCleanupResult(cleaned);
      await refreshStatus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCleaningBackups(false);
    }
  }

  async function clearConfig() {
    const confirmed = window.confirm("确认清除当前 Claude Code 的 API 环境配置？会先创建脱敏备份。");
    if (!confirmed) {
      return;
    }

    setClearingConfig(true);
    clearMessages();
    try {
      const cleared = await invoke<ClearConfigResult>("clear_claude_config");
      setClearResult(cleared);
      setConfig({ ...config, apiKey: "" });
      setDraftApiKeys({ ...draftApiKeys, [selectedPreset]: "" });
      await refreshStatus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearingConfig(false);
    }
  }

  async function clearLocalEnvironment() {
    const confirmed = window.confirm(
      "确认清除 Windows 用户环境变量中的 Claude Code API 配置？这会移除 ANTHROPIC_* 和 CLAUDE_CODE_* 托管变量，但不会删除已保存的供应商 API Key。",
    );
    if (!confirmed) {
      return;
    }

    setClearingLocalEnvironment(true);
    clearMessages();
    try {
      const cleared = await invoke<ClearLocalEnvironmentResult>("clear_local_environment");
      setClearLocalEnvironmentResult(cleared);
      await refreshStatus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearingLocalEnvironment(false);
    }
  }

  const canSave = (config.apiKey.trim().length > 0 || selectedKeyStatus.hasSavedKey) && !saving;
  const riskyBackups = status?.backupsWithTokenCount ?? 0;

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="应用状态">
        <div>
          <p className="eyebrow">Claude Code API 配置器</p>
          <h1>选择模型服务商，写入本机 Claude Code 环境</h1>
        </div>
        <div className="topbar-actions">
          <a className="icon-text-button" href="#/llm-rank" title="查看 LLMRank 筛选榜单">
            <BarChart3 size={18} />
            LLM 榜单
          </a>
          <button className="icon-text-button" onClick={refreshStatus} disabled={loadingStatus} title="刷新当前配置状态">
            {loadingStatus ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
            刷新状态
          </button>
        </div>
      </section>

      <section className="status-strip" aria-label="当前配置">
        <StatusItem icon={<FileJson size={18} />} label="settings.json" value={status?.settingsExists ? "已存在" : "未创建"} />
        <StatusItem icon={<CheckCircle2 size={18} />} label="Onboarding" value={status?.onboardingExists ? "已设置" : "待写入"} />
        <StatusItem icon={<Server size={18} />} label="当前供应商" value={status?.configuredProvider ?? "未识别"} />
        <StatusItem icon={<Terminal size={18} />} label="Claude Code" value={status?.claudeVersion ?? "未检测到"} />
      </section>

      <section className={`security-strip ${riskyBackups > 0 ? "warn" : ""}`} aria-label="安全状态">
        <div>
          <ShieldCheck size={20} />
          <div>
            <strong>每个方案的 API Key 保存在系统凭据里，本工具不会上传。</strong>
            <p>应用某个方案时，Claude Code 当前生效的 Key 仍会按其机制写入 settings.json。新备份会自动脱敏，旧备份可在这里清理。</p>
          </div>
        </div>
        <div className="security-actions">
          <span>{status?.settingsBackupCount ?? 0} 个备份，{riskyBackups} 个含明文 Key</span>
          <button type="button" className="icon-text-button" onClick={redactBackups} disabled={cleaningBackups} title="脱敏 settings.json 历史备份">
            {cleaningBackups ? <Loader2 className="spin" size={18} /> : <Eraser size={18} />}
            脱敏备份
          </button>
          <button type="button" className="danger-button" onClick={clearConfig} disabled={clearingConfig} title="清除当前 Claude Code API 配置">
            {clearingConfig ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
            清除配置
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={clearLocalEnvironment}
            disabled={clearingLocalEnvironment}
            title="清除 Windows 用户环境变量中的 Claude Code API 配置"
          >
            {clearingLocalEnvironment ? <Loader2 className="spin" size={18} /> : <Trash2 size={18} />}
            清除本地环境
          </button>
        </div>
      </section>

      <section className="workspace">
        <div className="provider-column" aria-label="供应商选择">
          <div className="section-heading">
            <ClipboardList size={19} />
            <h2>配置方案</h2>
          </div>

          <div className="provider-list">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={`provider-option ${selectedPreset === preset.id ? "active" : ""}`}
                onClick={() => selectPreset(preset)}
                title={`选择 ${preset.title}`}
              >
                <span className="provider-main">
                  <span className="provider-title">{preset.title}</span>
                  <span className="provider-subtitle">{preset.subtitle}</span>
                </span>
                <span className="provider-badges">
                  <span className="provider-badge">{preset.badge}</span>
                  <span className={`key-state ${keyStateClass(preset.id, draftApiKeys, apiKeyStatuses)}`}>
                    {keyStateLabel(preset.id, draftApiKeys, apiKeyStatuses)}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="reference-block">
            <p>{selected.note}</p>
            <p>保存后新开一个终端运行 <code>claude</code>，或在 Claude Code 中执行 <code>/status</code> 查看生效状态。</p>
          </div>
        </div>

        <form
          className="config-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void applyConfig();
          }}
        >
          <div className="section-heading">
            <KeyRound size={19} />
            <h2>API 与模型</h2>
          </div>

          <label className="field">
            <span>API Key</span>
            <div className="secret-input">
              <input
                type={showKey ? "text" : "password"}
                value={config.apiKey}
                onChange={(event) => updateApiKey(event.target.value)}
                placeholder={
                  selectedKeyStatus.hasSavedKey
                    ? `已保存 ${selectedKeyStatus.apiKeyPreview}，留空将直接使用`
                    : selectedPreset === "deepseek"
                      ? "DeepSeek API Key"
                      : selectedPreset === "xai-grok"
                        ? "xAI API Key"
                        : selectedPreset === "aicoding-0011"
                          ? "0011 API Key"
                          : selectedPreset === "claudecode-uk"
                            ? "ck card key"
                      : "千问 / DashScope API Key"
                }
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowKey(!showKey)} title={showKey ? "隐藏 API Key" : "显示 API Key"}>
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <small className="field-hint">
              {hasDraftKey && selectedKeyStatus.hasSavedKey
                ? "当前输入来自本方案，应用后会覆盖系统凭据里保存的 Key。"
                : hasDraftKey
                  ? "当前输入已在本次会话中绑定到这个方案，应用后会保存到系统凭据。"
                  : selectedKeyStatus.hasSavedKey
                ? "当前方案已有保存的 Key。输入新 Key 会覆盖保存值，留空会直接使用已保存 Key。"
                : "当前方案尚未保存 Key。第一次输入并应用后，之后切换回来可直接使用。"}
            </small>
          </label>

          {selectedPreset === "deepseek" && (
            <div className="balance-panel" aria-label="DeepSeek 余额">
              <div className="balance-heading">
                <div>
                  <Wallet size={18} />
                  <span>DeepSeek 余额</span>
                </div>
                <button
                  type="button"
                  className="icon-text-button"
                  onClick={checkDeepSeekBalance}
                  disabled={checkingDeepSeekBalance || (!hasDraftKey && !selectedKeyStatus.hasSavedKey)}
                  title="查询 DeepSeek 账户余额"
                >
                  {checkingDeepSeekBalance ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
                  查询
                </button>
              </div>
              {!hasDraftKey && !selectedKeyStatus.hasSavedKey && (
                <p className="balance-empty">输入 DeepSeek API Key，或先应用一次 DeepSeek 配置后即可查询。</p>
              )}
              {deepSeekBalance && (
                <div className="balance-result">
                  <span className={`availability ${deepSeekBalance.is_available ? "ok" : "bad"}`}>
                    {deepSeekBalance.is_available ? "可用" : "余额不足或不可用"}
                  </span>
                  <div className="balance-grid">
                    {deepSeekBalance.balance_infos.map((info) => (
                      <div key={info.currency} className="balance-card">
                        <strong>{info.currency}</strong>
                        <dl>
                          <div>
                            <dt>总余额</dt>
                            <dd>{info.total_balance}</dd>
                          </div>
                          <div>
                            <dt>赠送余额</dt>
                            <dd>{info.granted_balance}</dd>
                          </div>
                          <div>
                            <dt>充值余额</dt>
                            <dd>{info.topped_up_balance}</dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedPreset === "qwen-token-plan" && (
            <label className="field model-picker">
              <span>Token Plan 模型</span>
              <select value={config.model} onChange={(event) => applyTokenPlanModel(event.target.value)}>
                {Array.from(new Set(qwenTokenPlanModels.map((model) => model.brand ?? "其它"))).map((brand) => (
                  <optgroup key={brand} label={brand}>
                    {qwenTokenPlanModels
                      .filter((model) => (model.brand ?? "其它") === brand)
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} · {model.id}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <small className="field-hint">
                {selectedTokenPlanModel.description} 已同步到主模型、Sonnet、Opus 和 Subagent 映射；默认仍为 qwen3.8-max-preview。
              </small>
            </label>
          )}

          {selectedPreset === "qwen-payg" && (
            <label className="field model-picker">
              <span>按量计费模型</span>
              <select value={config.model} onChange={(event) => applyPaygModel(event.target.value)}>
                {qwenPaygModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.id}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                {selectedPaygModel.description} 已同步到主模型、Sonnet、Opus 和 Subagent 映射。
              </small>
            </label>
          )}

          <div className="field-grid">
            <TextField label="Base URL" value={config.baseUrl} onChange={(baseUrl) => setConfig({ ...config, baseUrl })} />
            <TextField label="主模型" value={config.model} onChange={(model) => setConfig({ ...config, model })} />
          </div>

          <button className="advanced-toggle" type="button" onClick={() => setShowAdvanced(!showAdvanced)} title="展开或收起模型映射">
            <Settings2 size={18} />
            模型映射与高级项
            {showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showAdvanced && (
            <div className="advanced-grid">
              <TextField label="Haiku 默认模型" value={config.haikuModel} onChange={(haikuModel) => setConfig({ ...config, haikuModel })} />
              <TextField label="Sonnet 默认模型" value={config.sonnetModel} onChange={(sonnetModel) => setConfig({ ...config, sonnetModel })} />
              <TextField label="Opus 默认模型" value={config.opusModel} onChange={(opusModel) => setConfig({ ...config, opusModel })} />
              <TextField label="Subagent 模型" value={config.subagentModel} onChange={(subagentModel) => setConfig({ ...config, subagentModel })} />
              <TextField label="最大上下文 Token" value={config.maxContextTokens ?? ""} onChange={(maxContextTokens) => setConfig({ ...config, maxContextTokens })} />
              <TextField label="Effort Level" value={config.effortLevel ?? ""} onChange={(effortLevel) => setConfig({ ...config, effortLevel })} />
            </div>
          )}

          <div className="preview-block" aria-label="将写入的环境变量">
            <div className="preview-header">
              <span>写入预览</span>
              <span>{Object.keys(previewEnv).length} 项</span>
            </div>
            <dl>
              {managedKeys
                .filter((key) => previewEnv[key])
                .map((key) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{previewEnv[key]}</dd>
                  </div>
                ))}
            </dl>
          </div>

          {error && <div className="message error">{error}</div>}
          {result && (
            <div className="message success">
              已写入 {result.settingsPath}，并设置 {result.onboardingPath}。新备份已脱敏。
            </div>
          )}
          {cleanupResult && (
            <div className="message success">
              已扫描 {cleanupResult.scannedCount} 个 settings 备份，脱敏 {cleanupResult.redactedCount} 个。
            </div>
          )}
          {clearResult && (
            <div className="message success">
              已从 {clearResult.settingsPath} 移除 {clearResult.removedKeys.length} 个托管环境变量，并创建脱敏备份。
            </div>
          )}

          <button className="primary-button" type="submit" disabled={!canSave} title="写入 Claude Code 配置">
            {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            应用配置
          </button>
          {clearLocalEnvironmentResult && (
            <div className="message success">
              已清除 {clearLocalEnvironmentResult.removedKeys.length} 个 Windows 用户环境变量。请重新打开 PowerShell 或 Claude Code。
            </div>
          )}
        </form>
      </section>

      <section className="path-row" aria-label="配置文件路径">
        <div>
          <span>Claude settings</span>
          <code>{status?.settingsPath ?? "加载中"}</code>
        </div>
        <div>
          <span>Claude onboarding</span>
          <code>{status?.onboardingPath ?? "加载中"}</code>
        </div>
      </section>
    </main>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StatusItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="status-item">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function maskToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return "未填写";
  }
  if (trimmed.length <= 10) {
    return "********";
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function keyStateLabel(
  presetId: PresetId,
  draftApiKeys: Record<PresetId, string>,
  apiKeyStatuses: Record<PresetId, ApiKeyStatus>,
) {
  if (draftApiKeys[presetId]?.trim()) {
    return "本次已输入";
  }
  if (apiKeyStatuses[presetId]?.hasSavedKey) {
    return "已保存 Key";
  }
  return "待输入";
}

function keyStateClass(
  presetId: PresetId,
  draftApiKeys: Record<PresetId, string>,
  apiKeyStatuses: Record<PresetId, ApiKeyStatus>,
) {
  if (draftApiKeys[presetId]?.trim()) {
    return "draft";
  }
  if (apiKeyStatuses[presetId]?.hasSavedKey) {
    return "saved";
  }
  return "empty";
}

function configWithPaygModel<T extends Omit<ClaudeConfig, "apiKey"> | ClaudeConfig>(config: T, modelId: string): T {
  const option =
    qwenPaygModels.find((model) => model.id === modelId) ??
    qwenPaygModels.find((model) => model.id === "qwen3.7-max") ??
    qwenPaygModels[0];
  return {
    ...config,
    model: option.id,
    sonnetModel: option.id,
    opusModel: option.id,
    subagentModel: option.subagentModel ?? option.id,
    haikuModel: option.haikuModel ?? "qwen3.6-flash",
    maxContextTokens: option.contextTokens ?? "",
  } as T;
}

function configWithTokenPlanModel<T extends Omit<ClaudeConfig, "apiKey"> | ClaudeConfig>(config: T, modelId: string): T {
  const option =
    qwenTokenPlanModels.find((model) => model.id === modelId) ??
    qwenTokenPlanModels.find((model) => model.id === "qwen3.8-max-preview") ??
    qwenTokenPlanModels[0];
  return {
    ...config,
    model: option.id,
    sonnetModel: option.id,
    opusModel: option.id,
    subagentModel: option.subagentModel ?? option.id,
    haikuModel: option.haikuModel ?? "qwen3.6-flash",
    maxContextTokens: option.contextTokens ?? "983616",
  } as T;
}

function errorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function Root() {
  const [route, setRoute] = useState(window.location.hash || "#/");

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "#/llm-rank") {
    return <ModelRankPage />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
