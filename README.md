# Claude Code API Configurator

用于在 Windows 上配置 Claude Code 的 Anthropic 兼容 API 环境，支持 DeepSeek、xAI、Qwen Token Plan、Qwen 按量计费等方案。

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
