# HarnessStudio

基于 Codeg 的独立二次开发项目，初始版本为 0.1.0。前端、桌面端、服务器端及其余功能沿用 Codeg，保留原有 UI 风格。

本轮变更：

- 移除新会话欢迎页的「代码开发 / 日常办公 / 科学研究」分类标签和快捷卡片，以及对应的外观设置开关。技能包仍可在原有设置页管理和使用。
- 移除侧边栏右键菜单、状态栏快捷菜单中的远端工作区打开与管理入口；取消相关 Tauri 命令注册，禁止创建或恢复远端工作区窗口。本地工作区和独立服务器/Web 部署保留。
- 侧边栏「文件夹」标题改为「项目」，同步更新十种语言及依赖该标签的筛选和排序显示。
- 应用名称为 HarnessStudio，桌面标识为 `com.harnessstudio.desktop`，系统深链接为 `harnessstudio://`。用户级偏好存储在 `~/.harnessstudio`，系统数据目录、凭据与缓存使用独立命名空间。
- 暂停自动更新，断开 Codeg 上游发布源；配置本项目自己的签名密钥和发布渠道后再启用。
- Git 仓库独立初始化，不继承上游提交历史或远端地址。

## 开发

使用 Node.js 24、pnpm 11.9.0。依赖版本由锁文件固定。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

前端开发默认访问 http://localhost:3000。完整的会话、文件、终端等功能需要运行桌面端或服务器后端，单独启动前端仅用于界面开发。

Windows 桌面开发还需安装 Rust stable（MSVC 工具链）、Visual Studio C++ Build Tools 与 Windows SDK，随后运行：

```powershell
pnpm tauri dev
pnpm tauri build
```

服务器开发与构建：

```powershell
pnpm server:dev
pnpm server:build
```

为了保持智能体协议、脚本与 sidecar 兼容，内部 Rust crate、可执行文件名、进程间链接以及 `CODEG_*` 环境变量暂时保留原名称。未设置覆盖变量时使用 HarnessStudio 的独立数据目录；显式指定 `CODEG_HOME` 或 `CODEG_DATA_DIR` 时以该路径为准。

## 验证

```powershell
pnpm exec tsc --noEmit
pnpm lint .
pnpm test
pnpm build
```

后端检查方式见 [AGENTS.md](./AGENTS.md)。

## 来源

上游为 [spacering-net/codeg](https://github.com/spacering-net/codeg)，源码基线为 0.34.0。来源及本轮修改见 [UPSTREAM.md](./UPSTREAM.md)，原项目说明保存在 [README.codeg.md](./README.codeg.md)。保留 [Apache-2.0 许可证](./LICENSE) 及原有第三方许可证、版权声明。
