use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

const CREDENTIAL_SERVICE: &str = "Claude Code API Configurator";
const PRESET_IDS: [&str; 6] = [
    "deepseek",
    "xai-grok",
    "aicoding-0011",
    "claudecode-uk",
    "qwen-token-plan",
    "qwen-payg",
];
const MANAGED_ENV_KEYS: [&str; 10] = [
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

const REDACTED_TOKEN: &str = "<redacted-by-api-configurator>";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyConfigRequest {
    preset_id: String,
    provider: String,
    plan: Option<String>,
    api_key: String,
    base_url: String,
    model: String,
    haiku_model: String,
    sonnet_model: String,
    opus_model: String,
    subagent_model: String,
    max_context_tokens: Option<String>,
    effort_level: Option<String>,
    include_api_key_env: Option<bool>,
    include_model_env: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigStatus {
    settings_path: String,
    onboarding_path: String,
    settings_exists: bool,
    onboarding_exists: bool,
    configured_provider: Option<String>,
    configured_base_url: Option<String>,
    configured_model: Option<String>,
    configured_auth_token_preview: Option<String>,
    claude_version: Option<String>,
    settings_backup_count: usize,
    backups_with_token_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiKeyStatus {
    preset_id: String,
    has_saved_key: bool,
    api_key_preview: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyConfigResult {
    settings_path: String,
    onboarding_path: String,
    settings_backup_path: Option<String>,
    onboarding_backup_path: Option<String>,
    provider: String,
    plan: Option<String>,
    env: Map<String, Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupBackupsResult {
    scanned_count: usize,
    redacted_count: usize,
    redacted_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClearConfigResult {
    settings_path: String,
    settings_backup_path: Option<String>,
    removed_keys: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClearLocalEnvironmentResult {
    removed_keys: Vec<String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct LocalCredentialStore {
    credentials: HashMap<String, LocalCredential>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalCredential {
    protected_hex: String,
    api_key_preview: String,
    updated_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeepSeekBalanceRequest {
    api_key: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct DeepSeekBalanceInfo {
    currency: String,
    total_balance: String,
    granted_balance: String,
    topped_up_balance: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct DeepSeekBalanceResult {
    is_available: bool,
    balance_infos: Vec<DeepSeekBalanceInfo>,
}

#[tauri::command]
fn get_api_key_statuses() -> Result<Vec<ApiKeyStatus>, String> {
    migrate_current_settings_key_to_credentials()?;
    PRESET_IDS
        .iter()
        .map(|preset_id| api_key_status(preset_id))
        .collect()
}

#[tauri::command]
fn get_deepseek_balance(request: DeepSeekBalanceRequest) -> Result<DeepSeekBalanceResult, String> {
    let api_key = match request
        .api_key
        .as_deref()
        .and_then(|value| non_empty(Some(value)))
    {
        Some(api_key) => api_key.to_string(),
        None => get_saved_api_key("deepseek")?.ok_or_else(|| {
            "DeepSeek 方案还没有保存 API Key。请先输入 Key，或应用一次 DeepSeek 配置。".to_string()
        })?,
    };

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|err| format!("创建 HTTP 客户端失败: {err}"))?;
    let response = client
        .get("https://api.deepseek.com/user/balance")
        .bearer_auth(api_key)
        .send()
        .map_err(|err| format!("请求 DeepSeek 余额失败: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!(
            "DeepSeek 余额查询失败: HTTP {status}{}",
            short_error_body(&body)
        ));
    }

    response
        .json::<DeepSeekBalanceResult>()
        .map_err(|err| format!("解析 DeepSeek 余额响应失败: {err}"))
}

#[tauri::command]
fn get_config_status() -> Result<ConfigStatus, String> {
    let paths = config_paths()?;
    let settings_exists = paths.settings.exists();
    let onboarding_exists = paths.onboarding.exists();
    let settings = read_json_file(&paths.settings).unwrap_or_else(|_| json!({}));
    let env = settings.get("env").and_then(Value::as_object);

    let base_url = env
        .and_then(|env| env.get("ANTHROPIC_BASE_URL"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let model = env
        .and_then(|env| env.get("ANTHROPIC_MODEL"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let token_preview = env
        .and_then(|env| env.get("ANTHROPIC_AUTH_TOKEN"))
        .or_else(|| env.and_then(|env| env.get("ANTHROPIC_API_KEY")))
        .and_then(Value::as_str)
        .map(mask_token);
    let backup_paths = settings_backup_paths(&paths)?;
    let backups_with_token_count = backup_paths
        .iter()
        .filter(|path| backup_contains_plain_token(path))
        .count();

    Ok(ConfigStatus {
        settings_path: path_to_string(&paths.settings),
        onboarding_path: path_to_string(&paths.onboarding),
        settings_exists,
        onboarding_exists,
        configured_provider: base_url.as_deref().map(detect_provider),
        configured_base_url: base_url,
        configured_model: model,
        configured_auth_token_preview: token_preview,
        claude_version: claude_version(),
        settings_backup_count: backup_paths.len(),
        backups_with_token_count,
    })
}

#[tauri::command]
fn apply_claude_config(request: ApplyConfigRequest) -> Result<ApplyConfigResult, String> {
    validate_request(&request)?;
    validate_preset_id(&request.preset_id)?;
    let auth_token = resolve_auth_token(&request)?;

    let paths = config_paths()?;
    if let Some(parent) = paths.settings.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建 .claude 目录失败: {err}"))?;
    }

    let settings_backup_path = backup_json_if_exists(&paths.settings, true)?;
    let onboarding_backup_path = backup_json_if_exists(&paths.onboarding, false)?;

    let mut settings = read_json_file(&paths.settings).unwrap_or_else(|_| json!({}));
    ensure_object(&mut settings);
    let settings_obj = settings.as_object_mut().expect("settings is object");
    let env_value = settings_obj
        .entry("env".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !env_value.is_object() {
        *env_value = Value::Object(Map::new());
    }
    let env = env_value.as_object_mut().expect("env is object");
    for key in MANAGED_ENV_KEYS {
        env.remove(key);
    }

    env.insert(
        "ANTHROPIC_AUTH_TOKEN".to_string(),
        Value::String(auth_token.clone()),
    );
    if request.include_api_key_env.unwrap_or(false) {
        env.insert(
            "ANTHROPIC_API_KEY".to_string(),
            Value::String(auth_token.clone()),
        );
    }
    env.insert(
        "ANTHROPIC_BASE_URL".to_string(),
        Value::String(request.base_url.trim().to_string()),
    );
    if request.include_model_env.unwrap_or(true) {
        env.insert(
            "ANTHROPIC_MODEL".to_string(),
            Value::String(request.model.trim().to_string()),
        );
        env.insert(
            "ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(),
            Value::String(request.haiku_model.trim().to_string()),
        );
        env.insert(
            "ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(),
            Value::String(request.sonnet_model.trim().to_string()),
        );
        env.insert(
            "ANTHROPIC_DEFAULT_OPUS_MODEL".to_string(),
            Value::String(request.opus_model.trim().to_string()),
        );
        env.insert(
            "CLAUDE_CODE_SUBAGENT_MODEL".to_string(),
            Value::String(request.subagent_model.trim().to_string()),
        );
        if let Some(max_context_tokens) = non_empty(request.max_context_tokens.as_deref()) {
            env.insert(
                "CLAUDE_CODE_MAX_CONTEXT_TOKENS".to_string(),
                Value::String(max_context_tokens.to_string()),
            );
        }
        if let Some(effort_level) = non_empty(request.effort_level.as_deref()) {
            env.insert(
                "CLAUDE_CODE_EFFORT_LEVEL".to_string(),
                Value::String(effort_level.to_string()),
            );
        }
    }

    let written_env = env.clone();
    write_json_file(&paths.settings, &settings)?;
    sync_user_environment(&written_env)?;
    if non_empty(Some(&request.api_key)).is_some() {
        save_api_key(&request.preset_id, &auth_token)?;
    }

    let mut onboarding = read_json_file(&paths.onboarding).unwrap_or_else(|_| json!({}));
    ensure_object(&mut onboarding);
    onboarding
        .as_object_mut()
        .expect("onboarding is object")
        .insert("hasCompletedOnboarding".to_string(), Value::Bool(true));
    write_json_file(&paths.onboarding, &onboarding)?;

    Ok(ApplyConfigResult {
        settings_path: path_to_string(&paths.settings),
        onboarding_path: path_to_string(&paths.onboarding),
        settings_backup_path: settings_backup_path.map(|path| path_to_string(&path)),
        onboarding_backup_path: onboarding_backup_path.map(|path| path_to_string(&path)),
        provider: request.provider,
        plan: request.plan,
        env: redact_env(written_env),
    })
}

#[tauri::command]
fn redact_sensitive_backups() -> Result<CleanupBackupsResult, String> {
    let paths = config_paths()?;
    let backup_paths = settings_backup_paths(&paths)?;
    let mut redacted_paths = Vec::new();

    for path in &backup_paths {
        let mut value = match read_json_file(path) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if redact_token_in_settings(&mut value) {
            write_json_file(path, &value)?;
            redacted_paths.push(path_to_string(path));
        }
    }

    Ok(CleanupBackupsResult {
        scanned_count: backup_paths.len(),
        redacted_count: redacted_paths.len(),
        redacted_paths,
    })
}

#[tauri::command]
fn clear_claude_config() -> Result<ClearConfigResult, String> {
    let paths = config_paths()?;
    if !paths.settings.exists() {
        return Ok(ClearConfigResult {
            settings_path: path_to_string(&paths.settings),
            settings_backup_path: None,
            removed_keys: Vec::new(),
        });
    }

    let settings_backup_path = backup_json_if_exists(&paths.settings, true)?;
    let mut settings = read_json_file(&paths.settings).unwrap_or_else(|_| json!({}));
    ensure_object(&mut settings);

    let mut removed_keys = Vec::new();
    if let Some(env) = settings.get_mut("env").and_then(Value::as_object_mut) {
        for key in MANAGED_ENV_KEYS {
            if env.remove(key).is_some() {
                removed_keys.push(key.to_string());
            }
        }
    }

    write_json_file(&paths.settings, &settings)?;
    sync_user_environment(&Map::new())?;

    Ok(ClearConfigResult {
        settings_path: path_to_string(&paths.settings),
        settings_backup_path: settings_backup_path.map(|path| path_to_string(&path)),
        removed_keys,
    })
}

#[tauri::command]
fn clear_local_environment() -> Result<ClearLocalEnvironmentResult, String> {
    let removed_keys = user_environment_keys_present()?;
    sync_user_environment(&Map::new())?;
    Ok(ClearLocalEnvironmentResult { removed_keys })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config_status,
            get_api_key_statuses,
            get_deepseek_balance,
            apply_claude_config,
            redact_sensitive_backups,
            clear_claude_config,
            clear_local_environment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct ConfigPaths {
    settings: PathBuf,
    onboarding: PathBuf,
}

fn config_paths() -> Result<ConfigPaths, String> {
    let home = dirs::home_dir().ok_or_else(|| "无法定位当前用户主目录".to_string())?;
    Ok(ConfigPaths {
        settings: home.join(".claude").join("settings.json"),
        onboarding: home.join(".claude.json"),
    })
}

fn validate_request(request: &ApplyConfigRequest) -> Result<(), String> {
    if !request.include_model_env.unwrap_or(true) {
        if non_empty(Some(&request.base_url)).is_none() {
            return Err("Base URL cannot be empty".to_string());
        }
        if let Some(max_context_tokens) = non_empty(request.max_context_tokens.as_deref()) {
            if !max_context_tokens.chars().all(|ch| ch.is_ascii_digit()) {
                return Err("Max context tokens must be numeric".to_string());
            }
        }
        return Ok(());
    }

    for (label, value) in [
        ("Base URL", &request.base_url),
        ("主模型", &request.model),
        ("Haiku 模型", &request.haiku_model),
        ("Sonnet 模型", &request.sonnet_model),
        ("Opus 模型", &request.opus_model),
        ("Subagent 模型", &request.subagent_model),
    ] {
        if non_empty(Some(value)).is_none() {
            return Err(format!("{label} 不能为空"));
        }
    }

    if let Some(max_context_tokens) = non_empty(request.max_context_tokens.as_deref()) {
        if !max_context_tokens.chars().all(|ch| ch.is_ascii_digit()) {
            return Err("最大上下文 Token 数必须是数字".to_string());
        }
    }

    Ok(())
}

fn validate_preset_id(preset_id: &str) -> Result<(), String> {
    if PRESET_IDS.contains(&preset_id) {
        Ok(())
    } else {
        Err(format!("未知配置方案: {preset_id}"))
    }
}

fn resolve_auth_token(request: &ApplyConfigRequest) -> Result<String, String> {
    if let Some(api_key) = non_empty(Some(&request.api_key)) {
        return Ok(api_key.to_string());
    }

    get_saved_api_key(&request.preset_id)?.ok_or_else(|| {
        "当前方案还没有保存 API Key。请先输入一次 API Key 并应用配置，之后切换方案会自动复用。"
            .to_string()
    })
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    let contents = fs::read_to_string(path)
        .map_err(|err| format!("读取 {} 失败: {err}", path_to_string(path)))?;
    serde_json::from_str(&contents)
        .map_err(|err| format!("解析 {} 失败: {err}", path_to_string(path)))
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    let contents =
        serde_json::to_string_pretty(value).map_err(|err| format!("序列化 JSON 失败: {err}"))?;
    fs::write(path, format!("{contents}\n"))
        .map_err(|err| format!("写入 {} 失败: {err}", path_to_string(path)))
}

fn sync_user_environment(env: &Map<String, Value>) -> Result<(), String> {
    let keys = MANAGED_ENV_KEYS.join(",");
    let script = r#"
$ErrorActionPreference = 'Stop'
$keys = $env:CLAUDE_CONFIGURATOR_SYNC_KEYS -split ','
foreach ($key in $keys) {
  $syncName = "CLAUDE_CONFIGURATOR_SYNC_$key"
  $value = [System.Environment]::GetEnvironmentVariable($syncName, 'Process')
  [System.Environment]::SetEnvironmentVariable($key, $value, 'User')
}
"#;

    let mut command = Command::new("powershell.exe");
    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg("-")
        .env("CLAUDE_CONFIGURATOR_SYNC_KEYS", keys)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for key in MANAGED_ENV_KEYS {
        if let Some(value) = env.get(key).and_then(Value::as_str) {
            command.env(format!("CLAUDE_CONFIGURATOR_SYNC_{key}"), value);
        }
    }

    let mut child = command
        .spawn()
        .map_err(|err| format!("同步 Windows 用户环境变量失败: {err}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(script.as_bytes())
            .map_err(|err| format!("写入环境变量同步脚本失败: {err}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|err| format!("等待环境变量同步失败: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("同步 Windows 用户环境变量失败: {}", stderr.trim()));
    }

    Ok(())
}

fn user_environment_keys_present() -> Result<Vec<String>, String> {
    let keys = MANAGED_ENV_KEYS.join(",");
    let script = r#"
$ErrorActionPreference = 'Stop'
$keys = $env:CLAUDE_CONFIGURATOR_SYNC_KEYS -split ','
$present = @()
foreach ($key in $keys) {
  if ($null -ne [System.Environment]::GetEnvironmentVariable($key, 'User')) {
    $present += $key
  }
}
$present | ConvertTo-Json -Compress
"#;
    let output = Command::new("powershell.exe")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(script)
        .env("CLAUDE_CONFIGURATOR_SYNC_KEYS", keys)
        .output()
        .map_err(|err| format!("读取 Windows 用户环境变量失败: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("读取 Windows 用户环境变量失败: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(Vec::new());
    }
    if let Ok(keys) = serde_json::from_str::<Vec<String>>(trimmed) {
        return Ok(keys);
    }
    serde_json::from_str::<String>(trimmed)
        .map(|key| vec![key])
        .map_err(|err| format!("解析 Windows 用户环境变量列表失败: {err}"))
}

fn backup_json_if_exists(path: &Path, redact_token: bool) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let backup_path = timestamped_backup_path(path)?;
    if redact_token {
        match read_json_file(path) {
            Ok(mut value) => {
                redact_token_in_settings(&mut value);
                write_json_file(&backup_path, &value)?;
            }
            Err(err) => {
                return Err(format!(
                    "{err}。为避免把可能存在的 API Key 原样复制到备份，请先手动修复或移除该文件。"
                ));
            }
        }
    } else {
        fs::copy(path, &backup_path)
            .map_err(|err| format!("备份 {} 失败: {err}", path_to_string(path)))?;
    }
    Ok(Some(backup_path))
}

fn timestamped_backup_path(path: &Path) -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("生成备份时间戳失败: {err}"))?
        .as_secs();
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!("{ext}.bak-{stamp}"))
        .unwrap_or_else(|| format!("bak-{stamp}"));
    Ok(path.with_extension(extension))
}

fn settings_backup_paths(paths: &ConfigPaths) -> Result<Vec<PathBuf>, String> {
    let settings_dir = match paths.settings.parent() {
        Some(parent) if parent.exists() => parent,
        _ => return Ok(Vec::new()),
    };

    let mut paths = Vec::new();
    let entries = fs::read_dir(settings_dir)
        .map_err(|err| format!("读取备份目录 {} 失败: {err}", path_to_string(settings_dir)))?;
    for entry in entries {
        let entry = entry.map_err(|err| format!("读取备份文件失败: {err}"))?;
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if file_name.starts_with("settings.json.bak-") {
            paths.push(path);
        }
    }
    paths.sort();
    Ok(paths)
}

fn redact_token_in_settings(value: &mut Value) -> bool {
    let Some(env) = value.get_mut("env").and_then(Value::as_object_mut) else {
        return false;
    };
    let mut redacted = false;
    for key in ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"] {
        let Some(token) = env.get(key).and_then(Value::as_str) else {
            continue;
        };
        if token.is_empty() || token == REDACTED_TOKEN {
            continue;
        }
        env.insert(key.to_string(), Value::String(REDACTED_TOKEN.to_string()));
        redacted = true;
    }
    redacted
}

fn backup_contains_plain_token(path: &Path) -> bool {
    let Ok(value) = read_json_file(path) else {
        return false;
    };
    let Some(env) = value.get("env").and_then(Value::as_object) else {
        return false;
    };
    ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]
        .iter()
        .filter_map(|key| env.get(*key))
        .filter_map(Value::as_str)
        .any(|token| !token.is_empty() && token != REDACTED_TOKEN)
}

fn api_key_status(preset_id: &str) -> Result<ApiKeyStatus, String> {
    match get_saved_api_key(preset_id) {
        Ok(Some(api_key)) => Ok(ApiKeyStatus {
            preset_id: preset_id.to_string(),
            has_saved_key: true,
            api_key_preview: Some(mask_token(&api_key)),
        }),
        Ok(None) => Ok(ApiKeyStatus {
            preset_id: preset_id.to_string(),
            has_saved_key: false,
            api_key_preview: None,
        }),
        Err(err) => Err(err),
    }
}

fn migrate_current_settings_key_to_credentials() -> Result<(), String> {
    let paths = config_paths()?;
    let settings = match read_json_file(&paths.settings) {
        Ok(settings) => settings,
        Err(_) => return Ok(()),
    };
    let Some(env) = settings.get("env").and_then(Value::as_object) else {
        return Ok(());
    };
    let Some(token) = env
        .get("ANTHROPIC_AUTH_TOKEN")
        .or_else(|| env.get("ANTHROPIC_API_KEY"))
        .and_then(Value::as_str)
        .and_then(|value| non_empty(Some(value)))
    else {
        return Ok(());
    };
    if token == REDACTED_TOKEN {
        return Ok(());
    }
    let base_url = env
        .get("ANTHROPIC_BASE_URL")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let model = env
        .get("ANTHROPIC_MODEL")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let Some(preset_id) = infer_preset_id(base_url, model) else {
        return Ok(());
    };

    if get_saved_api_key(preset_id)?.is_none() {
        save_api_key(preset_id, token)?;
    }
    Ok(())
}

fn infer_preset_id(base_url: &str, model: &str) -> Option<&'static str> {
    if base_url.contains("deepseek.com") {
        Some("deepseek")
    } else if base_url.contains("api.x.ai") || model.starts_with("grok") {
        Some("xai-grok")
    } else if base_url.contains("aicoding.0011.ai") || base_url.contains("api.3366.ai") {
        Some("aicoding-0011")
    } else if base_url.contains("api.claudecode.uk") {
        Some("claudecode-uk")
    } else if base_url.contains("token-plan.cn-beijing.maas.aliyuncs.com") {
        Some("qwen-token-plan")
    } else if base_url.contains("dashscope.aliyuncs.com")
        || model.starts_with("qwen")
        || model.contains('/')
    {
        Some("qwen-payg")
    } else {
        None
    }
}

fn credential_entry(preset_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, preset_id)
        .map_err(|err| format!("打开系统凭据失败: {err}"))
}

fn save_api_key(preset_id: &str, api_key: &str) -> Result<(), String> {
    let keyring_result = credential_entry(preset_id).and_then(|entry| {
        entry
            .set_password(api_key)
            .map_err(|err| format!("保存 API Key 到系统凭据失败: {err}"))
    });
    let local_result = save_local_api_key(preset_id, api_key);

    match (keyring_result, local_result) {
        (Ok(()), _) | (_, Ok(())) => Ok(()),
        (Err(keyring_err), Err(local_err)) => Err(format!("{keyring_err}; {local_err}")),
    }
}

fn get_saved_api_key(preset_id: &str) -> Result<Option<String>, String> {
    let keyring_result = credential_entry(preset_id)?.get_password();
    match keyring_result {
        Ok(api_key) => return Ok(Some(api_key)),
        Err(keyring::Error::NoEntry) => {}
        Err(keyring_err) => {
            if let Some(api_key) = get_local_api_key(preset_id)? {
                let _ = save_api_key_to_keyring_only(preset_id, &api_key);
                return Ok(Some(api_key));
            }
            return Err(format!("读取系统凭据失败: {keyring_err}"));
        }
    }

    if let Some(api_key) = get_local_api_key(preset_id)? {
        let _ = save_api_key_to_keyring_only(preset_id, &api_key);
        return Ok(Some(api_key));
    }

    Ok(None)
}

fn save_api_key_to_keyring_only(preset_id: &str, api_key: &str) -> Result<(), String> {
    credential_entry(preset_id)?
        .set_password(api_key)
        .map_err(|err| format!("保存 API Key 到系统凭据失败: {err}"))
}

fn local_credentials_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "无法定位当前用户配置目录".to_string())?;
    Ok(base
        .join("Claude Code API Configurator")
        .join("credentials.dpapi.json"))
}

fn read_local_credential_store() -> Result<LocalCredentialStore, String> {
    let path = local_credentials_path()?;
    if !path.exists() {
        return Ok(LocalCredentialStore::default());
    }

    let contents =
        fs::read_to_string(&path).map_err(|err| format!("读取本地凭据索引失败: {err}"))?;
    serde_json::from_str(&contents).map_err(|err| format!("解析本地凭据索引失败: {err}"))
}

fn write_local_credential_store(store: &LocalCredentialStore) -> Result<(), String> {
    let path = local_credentials_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建本地凭据目录失败: {err}"))?;
    }
    let contents =
        serde_json::to_string_pretty(store).map_err(|err| format!("序列化本地凭据失败: {err}"))?;
    fs::write(&path, format!("{contents}\n")).map_err(|err| format!("写入本地凭据失败: {err}"))
}

fn save_local_api_key(preset_id: &str, api_key: &str) -> Result<(), String> {
    let mut store = read_local_credential_store()?;
    let protected = dpapi_protect(api_key.as_bytes())?;
    store.credentials.insert(
        preset_id.to_string(),
        LocalCredential {
            protected_hex: encode_hex(&protected),
            api_key_preview: mask_token(api_key),
            updated_at: unix_timestamp()?,
        },
    );
    write_local_credential_store(&store)
}

fn get_local_api_key(preset_id: &str) -> Result<Option<String>, String> {
    let store = read_local_credential_store()?;
    let Some(credential) = store.credentials.get(preset_id) else {
        return Ok(None);
    };
    let protected = decode_hex(&credential.protected_hex)?;
    let plain = dpapi_unprotect(&protected)?;
    String::from_utf8(plain)
        .map(Some)
        .map_err(|err| format!("本地凭据不是有效 UTF-8: {err}"))
}

fn unix_timestamp() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|err| format!("生成时间戳失败: {err}"))
}

fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let ok = unsafe {
        CryptProtectData(
            &mut input,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err("DPAPI 加密 API Key 失败".to_string());
    }

    let protected =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut core::ffi::c_void);
    }
    Ok(protected)
}

fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let ok = unsafe {
        CryptUnprotectData(
            &mut input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 {
        return Err("DPAPI 解密本地 API Key 失败".to_string());
    }

    let plain =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut core::ffi::c_void);
    }
    Ok(plain)
}

fn encode_hex(data: &[u8]) -> String {
    let mut encoded = String::with_capacity(data.len() * 2);
    for byte in data {
        encoded.push_str(&format!("{byte:02x}"));
    }
    encoded
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err("本地凭据编码长度无效".to_string());
    }

    let mut bytes = Vec::with_capacity(value.len() / 2);
    for index in (0..value.len()).step_by(2) {
        let byte = u8::from_str_radix(&value[index..index + 2], 16)
            .map_err(|err| format!("解析本地凭据编码失败: {err}"))?;
        bytes.push(byte);
    }
    Ok(bytes)
}

fn ensure_object(value: &mut Value) {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
}

fn detect_provider(base_url: &str) -> String {
    if base_url.contains("deepseek.com") {
        "DeepSeek".to_string()
    } else if base_url.contains("api.x.ai") {
        "xAI Grok".to_string()
    } else if base_url.contains("aicoding.0011.ai") || base_url.contains("api.3366.ai") {
        "0011 Claude".to_string()
    } else if base_url.contains("api.claudecode.uk") {
        "ClaudeCode UK".to_string()
    } else if base_url.contains("dashscope.aliyuncs.com") {
        "Qwen 按量计费".to_string()
    } else if base_url.contains("token-plan.cn-beijing.maas.aliyuncs.com") {
        "Qwen Token Plan".to_string()
    } else {
        "自定义".to_string()
    }
}

fn mask_token(token: &str) -> String {
    let token = token.trim();
    if token.len() <= 10 {
        return "********".to_string();
    }

    let prefix: String = token.chars().take(4).collect();
    let suffix: String = token
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    format!("{prefix}...{suffix}")
}

fn redact_env(mut env: Map<String, Value>) -> Map<String, Value> {
    for key in ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"] {
        if let Some(Value::String(token)) = env.get(key) {
            env.insert(key.to_string(), Value::String(mask_token(token)));
        }
    }
    env
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn short_error_body(body: &str) -> String {
    let body = body.trim();
    if body.is_empty() {
        return String::new();
    }

    let mut shortened: String = body.chars().take(220).collect();
    if body.chars().count() > 220 {
        shortened.push_str("...");
    }
    format!(": {shortened}")
}

fn claude_version() -> Option<String> {
    let output = Command::new("claude").arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}
