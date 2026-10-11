# harness studio 图标

采用 2026-10-11 确认的第一版设计：暖白圆角底板与橙红色交织丝带 H。
`icon-source.png` 保存用户选定的原始生图预览，使用内置 ImageGen 生成。

原始提示词的核心要求：独立桌面应用图标；两条交织丝带组成 H，表达多智能体协作；
橙红色标记、暖白底板、简洁轮廓；不用代码括号、彩色圆点或旧品牌图形。

运行 `pnpm icons:generate` 更新桌面 PNG、ICO、ICNS、Windows 商店尺寸、
macOS 单色托盘图标及前端 favicon。依赖项目已有的 Node.js 和 Tauri CLI。
生成过程保留原始画面，使用 SVG 视口裁去预览外围背景，并统一圆角和透明边缘。
`icon.svg` 为自包含的栅格画面封装，不是手工重绘的矢量标记。
macOS ICNS 单独保留 824/1024 安全区域。

`tray-icon-template.svg` 为适配 macOS 菜单栏的单色 H 轮廓。
Windows 和 Linux 托盘继续使用桌面彩色图标。
