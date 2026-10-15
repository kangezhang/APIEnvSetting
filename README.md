# Claude Code API Configurator

用于在 Windows 上配置 Claude Code 的 Anthropic 兼容 API 环境，支持 DeepSeek、xAI、Qwen Token Plan、Qwen 按量计费等方案。

## Claude 模型与服务商（2026-10-15 核对）

0011 Claude、ClaudeCode UK 的主模型菜单提供当前官方模型名称：

| 系列 | API 模型 ID |
| --- | --- |
| Sonnet 5.5 | `claude-sonnet-5-5` |
| Opus 5.5 | `claude-opus-5-5` |
| Haiku 5.5 | `claude-haiku-5-5` |

来源：[Anthropic 模型目录](https://platform.claude.com/docs/en/models/overview)。

两种方案默认选择“服务商默认（自动路由）”，不写入模型变量。选择具体模型后会写入 `ANTHROPIC_MODEL` 和对应 Sonnet、Opus、Haiku、Subagent 映射；高级项支持自定义主模型 ID。切回自动路由后，应用配置会清除此前的模型覆盖。

官方模型已发布，不代表中转服务商已经接入。本次只读查询的情况：

- 0011：[官网](https://3366.ai/)的 Setup Guide → Manual Setup → Terminal Setup → Claude Code → Windows 已将 API 入口更新为 `https://api.3366.ai`，预设随之更新；保留旧域名的凭据识别。新旧 API 入口的 `/v1/models` 均返回 404，未确认 Claude 5.5 的可用性。
- ClaudeCode UK：使用对应已保存凭据查询 `https://api.claudecode.uk/v1/models`，目录中最新的 Claude 系列为 `claude-sonnet-4-5-20250929`、`claude-opus-4-5-20251101`、`claude-haiku-4-5-20251001`，也提供在主模型菜单中。目录可能滞后，不能据此断言未列出的模型一定不可用。

本次没有发送生成请求，也没有修改本机已应用的 Claude Code 配置。

## 开发

安装依赖：

```powershell
npm install
```

启动前端开发服务：

```powershell
npm run dev
```

启动 Tauri 开发窗口：

```powershell
npm run tauri -- dev
```

## 构建前端

```powershell
npm run build
```

`tauri build` 会自动执行 `tauri.conf.json` 里的 `beforeBuildCommand`，所以正常打包时不需要单独先跑这一步。

## 打包 Windows NSIS 安装包

在 Windows 环境中执行：

```powershell
npm run tauri -- build --bundles nsis
```

等价命令：

```powershell
npx tauri build --bundles nsis
```

如果本机未配置代码签名，并且打包流程提示签名相关问题，可以跳过签名：

```powershell
npm run tauri -- build --bundles nsis --no-sign
```

NSIS 安装包输出目录：

```text
src-tauri/target/release/bundle/nsis/
```

产物通常是 `*.exe` 安装程序，例如：

```text
Claude Code API Configurator_0.1.0_x64-setup.exe
```

## 说明

- 当前 `src-tauri/tauri.conf.json` 中 `bundle.targets` 是 `all`。不加 `--bundles nsis` 时，Tauri 会按配置尝试构建所有 Windows bundle。
- 只需要 NSIS 安装包时，推荐始终使用 `--bundles nsis`。
- 打包需要本机已安装 Node.js/npm、Rust 工具链，以及 Tauri Windows 打包所需依赖。
