# 桌面版本验证

验证日期：2026-10-10。版本 0.1.0，应用显示名 `harness studio`。源码来源和变更范围见根目录 UPSTREAM.md。

## 本机编译环境

- Windows x64，Node.js 24.21.0、pnpm 11.9.0、WebView2 Runtime 154.0.4258.62。
- Rust/Cargo 1.99.0，目标 x86_64-pc-windows-msvc；rust-toolchain.toml 固定工具链版本，包含 clippy 和 rustfmt。
- Visual Studio Build Tools 2022 17.14.41、MSVC 14.44.35207、Windows SDK 10.0.26100.0；组件清单保存在 .vsconfig。
- Windows 打包使用项目内工具缓存和临时目录，避免 NSIS 解压时跨盘移动触发 Windows error 17。

## 已完成的检查

- TypeScript strict 类型检查通过。
- ESLint 全量检查通过，0 错误、0 警告。
- Vitest：566 个测试文件，8,459 项测试全部通过。
- 内置浏览器 agent.bundle.js 与源码一致，浏览器代理 TypeScript 检查通过。
- Next.js 生产构建通过，35 个页面静态导出；不再生成 login 和 settings/web-service 页面。
- Rust：cargo check --locked --release --features test-utils --all-targets 通过；cargo clippy --locked --release --all-targets --features test-utils -- -D warnings 通过。
- Rust 原生专项测试：518 项通过，覆盖事件、深链接、MCP 状态、工作区窗口、备份、配置同步、路径、电脑操作识别、数据库、MCP 注入、日志、更新状态及浏览器帧协议。测试日志位于 logs/rust-tests-rebrand-final.log。
- 主程序和两项伴生进程均可进行 Release 编译。主程序名称为 harness-studio.exe，伴生进程为 harness-studio-mcp.exe 和 harness-studio-computer-helper.exe。
- Git 差异空白检查通过。仓库只有自己的初始提交，没有上游 Git 历史或远端。

## 安装与实际桌面检查

- 此前桌面重命名验收的 pnpm windows:build 成功。该次安装包为 37,155,843 字节（约 35.4 MiB）；SHA-256：769ea8c1aa157836ca9acc9084c49900b1676ef65a53032ee017be1eeed4d01c。本轮新产物及验证记录见下文。
- NSIS 安装程序可正常完成本地安装，安装目录为 %LOCALAPPDATA%/harness studio。
- 已安装主程序与最终构建只相差 Tauri 打包时写入的 UNK → NSS 安装类型标记，两个辅助程序逐字节一致。安装后重新执行实际窗口检查通过；主进程没有监听 Web 工作台端口。
- 现有数据库已通过 SQLite backup API 备份和迁移到 %APPDATA%/com.harnessstudio.desktop/harness-studio.db。29 张表的行数逐项一致，完整性检查为 ok。原始备份存放在 %LOCALAPPDATA%/HarnessStudio-backups/before-desktop-rename-1791637652555/workspace.db。
- 旧名称的数据库、锁文件和凭据脚本移至同一备份目录的 legacy-app-data/，新版继续使用迁移后的数据库；退出应用后再次进行完整性检查，结果为 ok。
- 在实际 Tauri/WebView2 窗口打开 D:/Code/HarnessStudio，侧边栏显示「项目」，欢迎页三类按钮数量为 0，项目右键菜单没有远端工作区入口。
- 设置页标题为「设置 - harness studio」，导航中没有 Web 服务，设置页文本没有旧品牌。
- 原 Web 服务启动、停止、状态命令均返回 Command not found；旧品牌 MCP 命令也已移除。新 MCP 状态命令正常返回，伴生进程路径使用新名称，进程间通信通过本地命名管道工作。
- 新编译的 MCP 伴生进程 stdio 冒烟检查通过：initialize 返回 harness-studio-mcp 0.1.0，tools/list 正常列出 6 项已选工具，标准输出没有旧品牌。
- 实际窗口检查未捕获 JavaScript 页面异常。截图和结果位于 logs/native-workspace-rebrand.png、logs/native-settings-rebrand.png、logs/native-rebrand-result.json；验证产物不纳入 Git。

## 开发提速与智能体设置页验证

本轮使用实际 Tauri / WebView2 Debug 桌面窗口验证，未覆盖正式版安装；测试数据库与 WebView2 用户数据单独放在 logs/ 下，未保存或修改智能体凭据。

| 测量项 | 本机结果 |
| --- | --- |
| 首次进入智能体设置并可编辑 | 2.08 秒，包含 Next 开发路由首次编译 |
| 同一窗口重复进入并可编辑 | 0.85 秒 |
| 配置快照 IPC | 34 毫秒，15 个智能体 |
| 原完整列表 IPC | 5.22 秒，15 个智能体 |
| 当前 Claude Code 完整检查 | 494 毫秒，其中预检 230 毫秒 |
| 两次文案、样式热更新 | 0.90 秒、1.37 秒；没有 Rust 编译或打包 |
| 修改 Rust 后 Debug 增量编译 | 27.77 秒，主程序自动重启且 IPC 可用 |
| 辅助程序重复准备 | Cargo 0.52 秒，命令总耗时 4.76 秒；产物时间戳不变 |
| 故意挂起 npm 时配置可编辑 | 0.71 秒；超时显示 FAIL，未保存草稿保留 |

原列表与快照的 IPC 对比来自同一个新编译的 Debug 主程序，不是两个版本的完整页面端到端对比。首次 Debug 辅助程序编译约 2 分 55 秒，冷缓存仍需建立；这些耗时不能当作其他机器的保证。

- 快照专项测试断言不运行环境探测，也不向数据库插入智能体默认记录。
- 设置页及调度器专项 26 项测试通过，覆盖当前项优先、并发上限 2、预检独立显示、未检测版本、手动强制刷新、重复进入缓存、切换和卸载页面后的旧结果、安装后缓存失效、15 秒队列释放及未保存草稿。
- 受影响 Rust 原生单元测试 61 项通过，包含请求合并、缓存过期、强制刷新时共享在途探测、失败缓存、超时错误、npm prefix 缓存以及 Hermes 配置。测试 EXE 按下文补入 Common Controls 清单后执行。
- Debug 的 cargo check --all-targets --features test-utils 和 cargo clippy --all-targets --features test-utils -- -D warnings 通过。独立 MCP 的无默认 feature 检查通过；对应严格 Clippy 仍因共享核心的 281 项未使用代码错误失败，没有将其记录为通过，也未用全局禁用警告绕过检查。
- 故障测试使用真正挂起的 npm.cmd / Node 子进程。离开页面停止派发后，8 个已记录探测子进程均已结束。实际窗口未捕获页面异常。
- Debug MCP stdio 初始化和工具列表通过，包含 delegate_to_agent；电脑辅助程序协议 14 的 Ready 握手和只读权限查询通过。实际桌面 MCP 管道状态为 running / listening。
- Release 辅助程序同样通过 MCP stdio 和电脑助手握手、权限查询；两个辅助程序 SHA-256 与 target/x86_64-pc-windows-msvc/release/ 中的产物逐项一致，保持无默认 feature 构建。新生成的 NSIS 脚本 File 项引用的正是这两个产物。
- 生产前端静态导出通过。安装包不会用于覆盖当前正在运行的正式版，本轮桌面交互测量使用 Debug。
- 原始结果保存在 logs/optimization-*.log、logs/optimization-*-result.json；截图隐藏输入框内容。这些验证产物不纳入 Git。

本轮最终 pnpm windows:build 成功，Release 主程序编译耗时 5 分 52 秒。新安装包为 src-tauri/target/release/bundle/nsis/harness studio_0.1.0_x64-setup.exe，36,969,302 字节（约 35.3 MiB），生成时间 2026-10-10 23:22。SHA-256：C198E97BA01036300C3B3A93EA85479E3B640899499F5327670EC50ABF06272B。

## 模型供应商与自定义接口验证（2026-10-11）

- Claude、Codex、Gemini 的供应商添加和编辑共用可滚动表单；智能体页自定义接口复用获取及搜索选择控件。列表只存在当前表单内存，获取不会保存配置、选择模型或启动会话。
- 前端全量 Vitest：568 个文件、8,470 项测试通过；TypeScript strict、全量 ESLint、Next.js 静态构建和浏览器 bundle 一致性检查通过。新增测试覆盖搜索显示名称但保存 ID、手填模型、角色填空、Codex 有效默认目录和高级配置保留、结果失效、迟到请求、草稿保护及绑定只读。
- Windows 原生测试按 Common Controls manifest 方式执行，26 项受影响测试通过，其中 8 项模型发现测试覆盖路径前缀、认证头、两种分页、去重、错误分类、总预算超时、禁止重定向和已保存 Key 的读取限制。
- 最终 `cargo check --all-targets --features test-utils` 与 `cargo clippy --all-targets --features test-utils -- -D warnings` 通过。Windows 上运行中的桌面 EXE 会占用 Tauri 构建复制目标，最终严格检查在关闭隔离测试实例后执行。
- 实际 Tauri / WebView2 开发窗口使用独立数据库和浏览器数据目录，以虚拟凭据验证三种供应商的添加、获取、选择、保存、重新打开，以及编辑时 Key 留空的查询。智能体自定义接口获取后保留未保存主模型；绑定供应商时模型只读，JSON 草稿与供应商一致，编辑入口可见。
- 挂起目录请求约 10.04 秒后显示超时，期间主模型可编辑，超时后草稿保留。修改地址但 Key 留空时拒绝复用旧 Key；401 显示本地化认证错误，未展示远端正文。
- 对提供服务只读查询模型目录，Claude 的 `/cc/v1/models` 和 Codex 的 `/v1/models` 均与独立实时查询逐个 ID 一致。没有发送对话，也未将真实测试 Key 写入源码、夹具、截图或验收记录。模型数量不是验收常量。
- Gemini 原生格式和 404/405 后同前缀兼容回退由本地 HTTP 服务及原生测试覆盖。提供服务的 `/v1beta/models` 返回非模型目录内容，因此没有将其记为原生 Gemini 成功，也没有对格式错误扩大自动回退。
- 绑定的真实桌面验收限于只读状态和草稿一致性：现有 Claude 原生配置路径仍指向用户的 `~/.claude/settings.json`，本轮未用虚拟凭据覆盖该文件。绑定保存和联动由组件及 Rust 回归测试覆盖。未验证模型对话兼容性和运行中真实会话重启。
- 截图与无凭据结果位于 `logs/model-discovery-native-*.png`、`logs/model-discovery-native-result.json`，构建和测试日志位于 `logs/model-discovery-*.log`，均不纳入 Git。

## 供应商页面与 Claude 映射验证（2026-10-11）

- 添加和编辑改为设置右侧内容区内的完整页面，保留侧栏和标题栏；顶部返回、中间独立滚动、底部固定保存。列表保持挂载，真实桌面编辑返回时 Claude 筛选和 150px 滚动位置均保留。
- Claude 主模型和角色映射复用到智能体自定义接口；增加四种角色显示名称及 Subagent。1M 使用模型值的 `[1m]` 后缀，Haiku 不提供新的勾选入口但保留旧值。移除可见的推理模型控件，旧 `reasoning` 值继续兼容保存；本轮未增加推理强度设置。
- 前端全量 568 个文件、8,475 项测试通过；最终控件样式和草稿比较调整后，受影响组件测试再次通过。全量 ESLint、最终受影响文件 ESLint、TypeScript、静态构建及浏览器 bundle 检查通过。新增文案覆盖 10 种语言。
- Windows 按 Common Controls manifest 方式执行 35 项受影响原生测试，覆盖模型映射解析、空值清除、JSON 合并、供应商、Codex 目录及模型发现。最终 `cargo check --all-targets --features test-utils` 和严格 Clippy 通过。
- 真实 Tauri / WebView2 使用独立数据库和虚拟凭据，验证 Claude、Codex、Gemini 的添加、目录获取、选择、保存及重开。Claude 显示名称、Subagent 和 1M 状态重开一致；返回和侧栏导航的未保存提示均可继续编辑或放弃。
- 在 800×700 的 WebView 视口下，内容区宽度和滚动宽度均为 561px，无横向溢出；固定底栏保持在视口底部。挂起目录请求约 10.13 秒后显示超时，期间主模型仍可编辑，超时后保留草稿。
- 智能体入口验证目录获取保留未保存主模型和显示名称，选择供应商后显示名称及 Subagent/1M 只读一致。没有以虚拟凭据执行 Claude 原生绑定保存，因为现有路径仍指向用户 `~/.claude/settings.json`；绑定保存及清空联动由组件和 Rust 测试覆盖。
- 验收没有发送模型对话。截图、无凭据结果及检查日志位于 `logs/provider-editor-*`，不纳入 Git。隔离实例完成验证后关闭，恢复用户原来的桌面开发模式。

## 图标替换与 Windows 重构建（2026-10-11）

- 使用确认的第一版橙红丝带 H 图标，原始 ImageGen 画面保存在 `src-tauri/icons/icon-source.png`；通过 SVG 视口裁去预览边框，保留图案本身。桌面 PNG、ICO、ICNS、前端 favicon 和 macOS 单色托盘同步更新，`pnpm icons:generate` 可重新生成。
- 图标资源检查通过：PNG 尺寸和透明圆角、前端文件一致性、Windows ICO 的 16/24/32/48/64/256px 槽位、macOS ICNS 的 824/1024 安全区域及旧系统所需蒙版。受影响文件 ESLint、浏览器 bundle 一致性检查通过。
- `pnpm windows:build` 成功，Next.js 完成 TypeScript 检查并静态导出 35 个页面；两个辅助程序保持独立 feature、无默认 feature 的 Release 构建，打包目录与构建产物 SHA-256 一致。伴生进程构建仍有此前记录的 281 项未使用代码警告。
- 从新生成的 Release EXE 实际提取并查看图标，确认为橙红 H。构建日志为 `logs/icon-windows-build.log`，图标检查脚本为 `logs/validate-app-icons.cjs`，提取结果为 `logs/built-app-icon.png`。
- 新 NSIS 安装包为 `src-tauri/target/release/bundle/nsis/harness studio_0.1.0_x64-setup.exe`，37,377,924 字节（35.65 MiB）。SHA-256：`37F3C5620FDF5046B53BE7C7AB5A4C5F252ECC18DCF8878BB66B94AF1CEA3572`。
- 首先生成安装包；随后按用户重启查看的要求，以 `/S /UPDATE` 更新 `%LOCALAPPDATA%/harness studio` 并启动已安装版本，窗口标题为 `harness studio`、响应正常。主程序仅有预期的 `UNK → NSS` 安装类型标记差异，两个辅助程序逐字节一致。桌面和开始菜单快捷方式明确使用安装目录中的新版 `harness-studio.ico`，已通知 Windows 刷新图标缓存。没有执行 macOS、Linux 应用构建。

- 后续桌面显示验收：任务栏显示新版 H，但桌面快捷方式仍显示空白。Windows `SHGetFileInfo` 对快捷方式、ICO 和 EXE 均读取到新版 H；`ie4uinit -show`、重建快捷方式和实际桌面 F5 刷新后仍未恢复。结束资源管理器并清理图标缓存的操作被自动审批策略拒绝，未执行。临时诊断快捷方式已移出桌面，待用户手动重启 Windows 资源管理器后复核；没有将桌面图标显示记录为通过。

## Windows Rust 测试说明

桌面库测试 EXE 默认缺少 Common-Controls v6 清单，直接运行会因 TaskDialogIndirect 导入产生 0xc0000139。本机使用 Windows SDK 的 mt.exe 对生成的测试 EXE 补入清单后执行测试；不修改项目产品代码或安装包的清单。清单位于 logs/setup/test-common-controls.manifest。

测试编译使用 cargo test --locked --release --features test-utils --lib --no-run --config 'profile.release.package.harness-studio.opt-level=0'，仅降低测试 crate 的优化级别以加快验证。应用安装包采用完整 Release 构建。

## 验证范围

- 本次验证在 Windows x64 上完成；未执行 macOS、Linux 构建。
- 未执行 Rust 全量测试和全部集成测试，也未验证实际智能体登录及完整会话执行。
- 无桌面 feature 的伴生进程可以编译，但共享核心中仍有未使用代码警告；未将其记录为无警告的伴生进程 Clippy 检查。
- 许可证与必要来源声明继续保留。智能体协作、文档预览、内置浏览器等桌面内部通信继续保留；移除的是通过浏览器访问整个工作台的 Web 服务、独立服务器和容器部署。
