# 一个仓库，两个平台：Optical Bench 的版本组织方式

这份文档只回答一件事：**macOS 版和 Windows 版怎么在同一个 GitHub 仓库里长期共存**。

## 一句话结论

一份源码 + 两个「壳」目录 + 二进制走 GitHub Releases。

```
src/  index.html  package.json  vite.config.ts   ← 两个平台共用的全部前端（约 95% 的代码）
macos/                                            ← macOS 的壳：Swift + WKWebView
windows/                                          ← Windows 的壳：目前是「本地服务器 + Edge 无边框窗口」
```

不做的事：

- **不开两个分支**（`mac` / `win`）——两个平台共用的代码占绝大多数，分支一周内就会分叉，
  之后每次改功能都要 cherry-pick 两遍。
- **不开两个仓库**——同一个软件的两种打包，合在一起才有「一份历史、一个版本号」。
- **不把 `.dmg` / `.exe` / `dist/` / `node_modules/` 提交进 git**——二进制会永久撑大仓库历史、
  每次更新多一份拷贝，而且没法 review。产物放 [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)。

## 现在的分工

| 层 | 位置 | 是否平台相关 |
| --- | --- | --- |
| 编辑器本体（画布、器件库、光学追迹、导出） | `src/` | 否，完全共用 |
| 快捷键文案（`⌘` / `Ctrl`） | `src/lib/platform.ts` | 运行时用 `navigator` 判断，**不参与构建分支** |
| 原生能力桥（保存对话框、自动存档、剪贴板） | `src/lib/native.ts` | 否——桥不存在时自动退化成浏览器行为 |
| macOS 壳 | `macos/`（`main.swift` / `NativeBridge.swift` / `WebSchemeHandler.swift` / `Info.plist`） | 是 |
| Windows 壳 | `windows/`（目前是 `.bat` + `scripts/serve.mjs`） | 是 |
| 构建脚本 | `scripts/build-mac-app.sh`（macOS 专属）· `scripts/serve.mjs`（跨平台） | 部分 |

关键设计：**前端不认识操作系统**。它只问两个问题——「我跑在原生壳里吗？」（`window.__ob` 存在与否）
和「这里该怎么写快捷键？」（`platform.ts`）。所以加一个平台 = 加一个壳，`src/` 一行都不用改。

## 三条硬规则

1. **平台判断只能出现在 `src/lib/platform.ts` 和壳目录里。**
   在 `Stage.tsx` 里写 `if (navigator.platform === 'MacIntel')` 这种代码，是双平台仓库开始腐烂的信号。
2. **版本号只有 `package.json` 一处。**
   macOS 的 `Info.plist` 用 `__VERSION__` / `__BUILD__` 占位，构建时由 `build-mac-app.sh` 从
   `package.json` 读出来替换；Windows 侧将来照抄这个做法。两边永远同号，不允许各走各的。
3. **产物（`dist/`、`build/`、`*.dmg`、`*.exe`）不进 git。**
   要给人下载就发 Release，见下面的发版流程。

## Windows 版从「能用」到「原生」的三条路

现在 Windows 上已经能用（`Optical Bench.bat` → `scripts/serve.mjs` → Edge 的 `--app=` 无边框窗口），
缺的只是「原生壳」这一层，和 macOS 在 v1.3.2 做过的事情完全对应。三条路：

| 方案 | 做法 | 体积 | 代价 | 适合 |
| --- | --- | --- | --- | --- |
| **A. WebView2 原生壳**（推荐） | C#/WPF 或 Rust，`WebView2` + 自定义 scheme + 同一套 `__ob` 桥 | 几百 KB + 系统 WebView2 运行时 | 要写一份和 `macos/src/*.swift` 对称的壳 | 想和 mac 完全对称、体积最小 |
| B. Tauri | Rust + 系统 WebView，生态现成 | 2–5 MB | 引入 Rust 工具链与 Tauri 的壳约定 | 以后还想上 Linux |
| C. Electron | Chromium 一起打包 | 100 MB+ | 体积、内存、启动都变重 | 只想最快出安装包，不在乎体积 |

选 A 的理由和当初 macOS 选 Swift + `WKWebView` 一样：这个软件 99% 是 SVG + 状态管理，
不需要自带浏览器内核；Windows 10/11 上 WebView2 运行时随 Edge 预装，可以直接依赖。
选 A 时 `windows/` 的目录结构照抄 `macos/`：

```
windows/
  README.md            ← 现在这个位置的说明
  src/                 ← 将来：外壳源码（.cs 或 .rs）
  app.manifest / .ico  ← 将来：清单与图标（图标可直接复用 assets/app.ico）
  build-win-app.ps1    ← 将来：一条命令出 exe / 安装包
```

## 桥接口约定（Windows 壳必须实现这几条）

前端通过 `window.__ob.call(op, args)` 调用，壳回一个 `{ ok, ... }` 的 JSON。协议在
`src/lib/native.ts` 里定义，macOS 侧实现在 `macos/src/NativeBridge.swift` 的 `switch op` 里。

| op | args | 返回 | 说明 |
| --- | --- | --- | --- |
| `saveFile` | `{ name, kind, data }`，`kind` ∈ `json` / `png` / `svg` / `text` | `{ ok }` 或 `{ ok: false, cancelled: true }` | 原生「另存为」面板；`png` 的 `data` 是 base64，其余是纯文本 |
| `openFile` | — | `{ ok, name, text }` | 原生打开面板，记住上次目录 |
| `readAutosave` | — | `{ text }`（无文件时 `text: null`） | macOS 存在 `~/Library/Application Support/Optical Bench/autosave.json`，Windows 建议 `%APPDATA%\Optical Bench\` |
| `writeAutosave` | `{ text }` | `{ ok }` | 退出前必须落盘 |
| `copyImage` | `{ data }`（base64 PNG） | `{ ok }` | 剪贴板；WebView2 里也可以通过 `navigator.clipboard.write` 走浏览器路径，壳不实现也能退化 |

另外三个由壳注入到页面的全局钩子：`window.__obMenuActive()`（有输入框聚焦时不要抢菜单快捷键）、
`window.__obMenu(op)`（菜单项转发给页面）、`window.__obFlush()`（退出前让页面把自动存档写出来）。
`flushDone` 是页面回给壳的确认。

**只要这五条 op 对得上，Windows 壳和 macOS 壳就是可替换的，`src/` 不需要知道自己在哪个系统上。**

## 发版流程

版本号在 `package.json`，两个平台一起走：

```bash
# 1. 改版本号（只改 package.json 一处）并提交
npm version patch --no-git-tag-version   # 或者手动改

# 2. 各自平台出产物（产物在 build/，不进 git）
npm run app:build                         # macOS: Optical Bench.app + .dmg
                                          # Windows: 将来是 build-win-app.ps1（暂未实现）

# 3. 打 tag、发 Release，把 .dmg / .exe 作为附件传上去
git tag v1.3.2 && git push origin v1.3.2
gh release create v1.3.2 "build/Optical Bench 1.3.2.dmg" --title "v1.3.2"
```

Release 附件命名带平台后缀，两个版本就能并排躺着、互不覆盖：

```
Optical Bench 1.3.2 macOS-arm64.dmg
Optical Bench 1.3.2 Windows-x64.exe
```

## CI

`.github/workflows/ci.yml` 在 `macos-latest` 和 `windows-latest` 上各跑一遍
`npm ci` → `npm run typecheck` → `npm run build`。它的作用不是替代人工验收，而是**保证
Windows 那条线不会因为只在 Mac 上开发而悄悄烂掉**——任何一次提交，两个平台都必须能构建通过。

Playwright 回归（`npm run test:ui`）目前没进 CI：它需要一个真实的 Chromium/WebKit，
装浏览器会让每个 job 多几分钟。本地在改交互代码时跑。

## 以后加平台时的检查清单

- [ ] 新平台判断只加进 `src/lib/platform.ts`，不动组件
- [ ] 新壳目录照 `macos/` 的结构，实现上面五条 op
- [ ] 版本号从 `package.json` 读，不硬编码
- [ ] 构建脚本产物落在 `build/`（已被 `.gitignore` 覆盖）
- [ ] 在 `ci.yml` 的 matrix 里加一行
- [ ] README 的「怎么打开」和本文件的表格各加一行
