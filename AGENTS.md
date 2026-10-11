# AGENTS.md

## 项目约束

本仓库为独立桌面项目 **harness studio**，版本 0.1.0。保留原有 UI 风格和多智能体能力，不得重新引入欢迎页三类快捷卡片、远端工作区打开/管理入口、Web 服务、浏览器登录、独立服务器、Docker 部署或上游自动更新源。

侧边栏文件夹分区展示为「项目」。显示名称统一为 `harness studio`；包和主程序为 `harness-studio`，Rust 库为 `harness_studio_lib`，辅助程序为 `harness-studio-mcp` 和 `harness-studio-computer-helper`。环境变量使用 `HARNESS_STUDIO_*`，深链接使用 `harnessstudio://`。桌面标识为 `com.harnessstudio.desktop`，用户目录为 `~/.harnessstudio`。

旧项目品牌只保留在必要的来源及许可证记录中，见 UPSTREAM.md。不得删除第三方版权或许可证声明。

## 技术栈

- Tauri 2：Rust 桌面后端和 WebView 前端。
- Next.js 16 静态导出、React 19、TypeScript strict。
- Tailwind CSS v4、shadcn/ui、next-intl（10 种语言）。
- SeaORM 与 SQLite，pnpm 包管理器。
- Rust 版本由 rust-toolchain.toml 固定；Windows 组件见 .vsconfig。

## 检查

根据改动范围执行必要检查：

```powershell
pnpm lint .
pnpm test
pnpm build
pnpm browser:agent:check
```

在 src-tauri/ 目录执行：

```powershell
cargo check --all-targets --features test-utils
cargo test --features test-utils
cargo clippy --all-targets --features test-utils -- -D warnings
cargo check --no-default-features --features mcp-bin --bin harness-studio-mcp
cargo clippy --no-default-features --features mcp-bin --bin harness-studio-mcp -- -D warnings
```

Windows 单元测试的 Common Controls manifest 限制及本机验证方式见 docs/VALIDATION.md。解析器快照变化时使用 cargo insta review。

## 架构

- `src-tauri/src/lib.rs`：桌面启动和 Tauri 命令注册。
- `src-tauri/src/events.rs`：桌面与进程内事件分发，不提供 HTTP 服务。
- `src-tauri/src/app_state.rs`：核心状态及测试装配。
- `src-tauri/src/acp/`：Agent Client Protocol、智能体连接和 MCP 委托。
- `src-tauri/src/commands/`：业务逻辑；`_core` 函数接受普通引用，Tauri 包装接收 State。
- `src-tauri/src/db/`：数据库；`parsers/`：本地智能体会话解析。
- `src-tauri/src/browser/`：桌面内置浏览器；`computer/`：电脑操作。
- `src/lib/transport/`：通过 Tauri IPC 调用后端，不创建浏览器 WebTransport。
- `src/lib/types.ts`：Rust 数据模型的 TypeScript 镜像。
- `src/i18n/messages/`：10 种语言的界面文案。

三个二进制分别为桌面主程序、stdio MCP 伴生进程和电脑操作辅助进程。后二者必须保持独立 feature（mcp-bin、computer-helper），由 prepare-sidecars 脚本构建，避免 Tauri 将启用桌面依赖的辅助目标打进安装包。

`#[cfg(feature = "tauri-runtime")]` 用于桌面专有代码，MCP 和电脑辅助进程可在不启用默认 feature 时编译。静态前端仍需要 Node.js 开发服务器；智能体协作、文档预览等本地通信不属于已移除的远程 Web 工作台服务。

## 代码约定

- Next.js 仅允许 `output: "export"`，使用查询参数而非动态路由。
- `@/*` 映射到 `./src/*`。
- Prettier：无分号、ES5 尾逗号、2 空格、80 字符宽度。
- ESLint：Next.js、TypeScript 和 Prettier。
- TypeScript strict，启用 noUnusedLocals 和 noUnusedParameters。
- Rust 2021 edition，错误类型使用 thiserror。
