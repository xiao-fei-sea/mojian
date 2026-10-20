# 墨笺 · MoJian

简约的本地 Markdown 编辑器，基于 Electron。所见即所得的实时预览、多标签页、以及一切数据都保存在本地——不联网、不上传、不打扰。

![墨笺](assets/极简%20Markdown%20编辑器图标.png)

## 特性

- **三种视图**：分栏（源码 + 预览）、单栏所见即所得、纯预览只读，`Ctrl + \` 一键切换。
- **所见即所得**：预览区可直接编辑，输入即回写 Markdown；标题、加粗、列表、引用、代码块等格式化即时生效。
- **多标签页**：像记事本一样同时打开多个文档，新建不会覆盖当前内容，未保存的标签带 `•` 标记。
- **图片导入**：工具栏按钮、直接粘贴、拖拽三种方式插入图片，自动复制到文档同目录的 `assets/` 文件夹并写入相对路径。
- **代码块**：支持语言标注与语法高亮（highlight.js），块内可正常编辑、换行、`Esc` 退出；相邻代码块之间自动留出空段落。
- **查找替换**：输入即检索并自动定位到第一处匹配，上下 / 回车循环切换，匹配项滚动居中并高亮全部结果（不改动 DOM）。
- **钉住窗口**：一键把窗口固定在所有窗口最前，状态本地持久化。
- **导出与打印**：导出 HTML、打印 / 导出 PDF、另存为，以及在文件夹中显示。
- **主题与字号**：浅色 / 深色主题切换，字号缩放。
- **本地优先**：文件读写通过主进程 IPC 完成，自动保存可选，全流程无网络请求。

## 技术栈

- [Electron](https://www.electronjs.org/) 33 — 桌面运行时（主进程 / preload / 渲染进程）
- [markdown-it](https://github.com/markdown-it/markdown-it) 14 — Markdown 渲染（`html`、`highlight` 回调）
- [highlight.js](https://highlightjs.org/) 11 — 代码块语法高亮
- [turndown](https://github.com/mixmark-io/turndown) + turndown-plugin-gfm — 预览 DOM 回写 Markdown
- 原生 `contenteditable` + CSS Custom Highlight API — 所见即所得编辑与查找高亮
- [@electron/packager](https://github.com/electron/packager) / [electron-builder](https://www.electron.build/) — 打包
- [sharp](https://sharp.pixelplumbing.com/) + png-to-ico — 图标生成

## 下载与安装

面向普通用户，无需任何开发环境：

1. 打开 [Releases](https://github.com/xiao-fei-sea/mojian/releases) 页面，下载最新版的 `墨笺 Setup x.y.z.exe`。
2. 双击运行安装程序，按向导选择安装目录（可自定义）并完成安装。
3. 安装完成后会自动创建桌面快捷方式，双击即可使用。

> Windows 可能提示「Windows 已保护你的电脑」，这是因为安装包未做代码签名，点击「更多信息 → 仍要运行」即可。
> 安装包为 NSIS 格式，支持自定义安装路径，并提供完整的卸载入口（在「设置 → 应用」或安装目录中卸载）。

## 快速开始

从源码运行需要 Node.js 18+ 与 npm。

```bash
# 安装依赖
npm install

# 启动（开发模式，带调试输出）
npm run dev

# 直接启动
npm start
```

## 打包

```bash
# 生成图标（可选，仅在更换源图后需要）
npm run icon

# 方式一：打包为免安装可执行目录
# 产物：dist/MoJian-win32-x64/MoJian.exe
npm run package

# 在方式一基础上替换启动器，规避 Windows「智能应用控制」对自定义启动器的拦截
npm run package:compat

# 方式二：打包为 NSIS 安装包（推荐用于分发）
# 产物：dist/墨笺 Setup 1.0.0.exe
npm run installer
```

打包前请先退出正在运行的墨笺，否则 `dist/` 目录会被占用导致打包失败。

`npm run installer` 首次执行需要从网络下载 electron 与 NSIS 构建资源，国内网络较慢或超时，
可以指定镜像加速：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run installer
```

> 说明：安装包通过 `build/after-pack.js` 写入应用图标与版本信息。之所以不用 electron-builder
> 内置的资源编辑，是因为其依赖的 winCodeSign 压缩包含有 macOS 符号链接，在普通权限的 Windows
> 上解压会失败；该脚本改为调用本地缓存的 rcedit 完成同样的工作。

## 快捷键

| 分类 | 操作 | 快捷键 |
| --- | --- | --- |
| 文件 | 新建文档 | `Ctrl + N` |
| 文件 | 打开文件 | `Ctrl + O` |
| 文件 | 保存 | `Ctrl + S` |
| 文件 | 另存为 | `Ctrl + Shift + S` |
| 文件 | 关闭当前文档 | `Ctrl + W` |
| 文件 | 导出 HTML | `Ctrl + Shift + E` |
| 文件 | 打印 / 导出 PDF | `Ctrl + P` |
| 视图 | 切换文档标签 | `Ctrl + Tab` |
| 视图 | 分栏 / 单栏切换 | `Ctrl + \` |
| 视图 | 纯预览 | `Ctrl + Shift + P` |
| 视图 | 切换深浅主题 | `Ctrl + Shift + D` |
| 视图 | 放大 / 缩小字号 | `Ctrl + Shift + +/-` |
| 视图 | 全屏 | `F11` |
| 视图 | 快捷键说明 | `F1` |
| 格式 | 加粗 | `Ctrl + B` |
| 格式 | 斜体 | `Ctrl + I` |
| 格式 | 行内代码 | `Ctrl + \`` |
| 格式 | 链接 | `Ctrl + K` |
| 格式 | 标题 1-6 / 正文 | `Ctrl + 1-6` / `Ctrl + 0` |
| 格式 | 引用 | `Ctrl + Shift + Q` |
| 格式 | 代码块 | `Ctrl + Shift + C` |
| 格式 | 无序 / 有序 / 任务列表 | `Ctrl + Shift + U` / `O` / `T` |
| 格式 | 表格 | `Ctrl + T` |
| 格式 | 分割线 | `Ctrl + Shift + R` |
| 格式 | 删除当前块 | `Ctrl + Shift + K` |
| 编辑 | 查找 / 替换 | `Ctrl + F` / `Ctrl + H` |
| 编辑 | 撤销 / 重做 | `Ctrl + Z` / `Ctrl + Y` |
| 编辑 | 缩进 / 反缩进 | `Tab` / `Shift + Tab` |
| 编辑 | 关闭浮层 | `Esc` |

## 目录结构

```
md编辑器/
├── src/
│   ├── main.js              # Electron 主进程：窗口、菜单、文件 IPC
│   ├── preload.js           # 暴露给渲染进程的安全 API
│   ├── assets/icon.png      # 应用窗口图标（由脚本生成）
│   └── renderer/
│       ├── index.html       # 界面结构
│       ├── styles.css       # 样式
│       └── app.js           # 渲染进程逻辑（编辑、预览、标签、查找等）
├── build/
│   ├── icon.ico             # 打包用图标
│   ├── icon.png             # 打包用图标
│   ├── make-icon.js         # 从源图生成图标
│   ├── after-pack.js        # electron-builder 打包后写入图标与版本信息
│   └── stock-launcher.js    # package:compat 启动器替换脚本
├── assets/
│   └── 极简 Markdown 编辑器图标.png  # 图标源图
├── package.json
├── LICENSE
└── README.md
```

## 许可证

本项目基于 [MIT License](LICENSE) 开源，可自由使用、修改与分发。

图标等美术资源版权归原作者所有，使用时请遵守相应授权。
