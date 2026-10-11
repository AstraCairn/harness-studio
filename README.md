# harness studio

多智能体桌面工作台，版本 0.1.0。使用 Rust、Tauri 2、Next.js、React 和 TypeScript，保留原有工作台 UI。

- 仅提供桌面应用，已移除内置 Web 服务、浏览器登录、独立服务器和 Docker 部署。
- 欢迎页不再按「代码开发 / 日常办公 / 科学研究」分组，不提供远端工作区打开或管理入口。
- 侧边栏分区名为「项目」。应用显示名统一为 `harness studio`。
- 主程序为 `harness-studio`，辅助程序为 `harness-studio-mcp` 和 `harness-studio-computer-helper`；环境变量使用 `HARNESS_STUDIO_*`。
- 桌面标识为 `com.harnessstudio.desktop`，深链接为 `harnessstudio://`，用户级目录为 `~/.harnessstudio`。自动更新保持关闭，未配置发布源。
- Git 仓库独立初始化，没有上游提交历史或远端地址。

## 开发与编译

使用 Node.js 24、pnpm 11.9.0。Rust 1.99.0 由 `rust-toolchain.toml` 固定，依赖分别由 `pnpm-lock.yaml` 和 `src-tauri/Cargo.lock` 锁定。

Windows 需要 Visual Studio C++ Build Tools 与 Windows SDK，可导入 `.vsconfig` 安装所需组件。本机使用 Build Tools 2022 17.14.41、MSVC 14.44.35207、Windows SDK 10.0.26100.0。

```powershell
pnpm install --frozen-lockfile
pnpm desktop:dev
pnpm windows:build
```

安装包输出到 `src-tauri/target/release/bundle/nsis/`。构建命令会编译两个辅助程序，并将打包工具缓存和临时文件放在项目内，避免 Windows 跨盘移动失败。已有编译产物时，可使用 `pnpm windows:bundle` 重新打包。

`pnpm dev` 仅用于前端界面开发；完整功能请使用 `pnpm desktop:dev`。浏览器访问工作台的服务端已移除，智能体、本地文件、终端、MCP 和内置浏览器通过桌面进程运行。

日常修改请保持 `pnpm desktop:dev` 运行。React、TypeScript、样式和翻译在桌面窗口中热更新，不需要生成安装包；Rust 修改由 Tauri 自动进行 Debug 增量编译并重启主程序。首次启动需要建立 Debug 编译缓存，后续保留 `src-tauri/target/` 和 `.next/` 即可复用。

开发启动会以 Debug 构建两个辅助程序，由 Cargo 判断是否需要重编译；内容相同的产物不会重复复制。修改 MCP 伴生逻辑、电脑操作或辅助程序共享的 Rust 代码后，停止并重新运行 `pnpm desktop:dev`；也可先运行 `pnpm desktop:sidecars` 再重启。保持原有的辅助程序 feature 隔离，Debug 桌面使用独立的 `harness-studio-dev.db`，智能体自己的本地配置仍与正式版共享。

阶段验收使用 `pnpm windows:build`，默认流程准备 Release 辅助程序并生成 Release 主程序和安装包。`pnpm windows:bundle` 仅重新打包现有产物，不会编译修改后的代码；请仅在 Release 产物已经更新时使用。`pnpm tauri:prepare-sidecars --profile dev` 与 `--profile release` 可显式指定辅助程序 profile，默认是 Release。

## 验证

```powershell
pnpm exec tsc --noEmit
pnpm lint .
pnpm test
pnpm build
```

Rust 检查方式见 [AGENTS.md](./AGENTS.md)，本机验证结果见 [docs/VALIDATION.md](./docs/VALIDATION.md)。

## 来源与许可证

项目基于开源代码独立开发，必要的来源记录见 [UPSTREAM.md](./UPSTREAM.md)。保留 [Apache-2.0 许可证](./LICENSE) 和第三方许可证、版权声明。
