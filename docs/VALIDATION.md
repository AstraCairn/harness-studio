# 初始版本验证

验证日期：2026-10-10。源码基线和修改范围见根目录 UPSTREAM.md。

已通过：

- 冻结锁文件安装依赖。
- ESLint：检查 1,422 个文件，0 错误、0 警告。
- Vitest：566 个测试文件，8,470 项测试全部通过。
- Next.js 生产构建：类型检查通过，37 个页面完成静态导出，产物位于 out/。
- Chromium 页面渲染检查：使用模拟后端打开中文版工作区，确认侧边栏显示「项目」、欢迎页没有三类快捷入口，页面没有未处理的 JavaScript 异常。模拟后端未配置智能体，因此预览显示「暂无已启用的 Agent」。本地检查截图位于 logs/workspace-preview.png（验证产物不纳入 Git）。

尚未验证：

- Rust 编译、后端测试与 Windows 桌面打包：当前机器未安装 Rust/Cargo 和 Visual Studio C++ Build Tools/Windows SDK。需要补齐工具链后按 AGENTS.md 执行检查，再运行 pnpm tauri build。
- 真实智能体连接、终端及会话执行：需要运行原生后端，并配置可用的智能体 CLI。
