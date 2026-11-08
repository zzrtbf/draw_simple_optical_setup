# Optical Bench 状态：2026-11-08

## 目标

做一个在搭光路之前排布器件的 2D 设计器（真实 mm 尺度、器件冲突检测、自动光路追迹），
成品是 macOS 双击可用的原生 App + Windows 免安装版，两个平台共用一份前端源码。

## 当前阶段

**v1.3.2 收尾完成，没有正在开发的功能。** 源码、双 README、MIT、CI、`.app`/`.dmg` 都在，
已推到 GitHub `origin/main`（工作区干净）。本文件与 `LOG.md` 也已入库，两台机器靠 git 同步。
功能上暂不推进（见末尾）。

## 已定决策

- **`STATE.md` / `LOG.md` 进 git，两台机器用仓库同步**（2026-11-08 用户改，推翻 project-memory 的
  「只留本地」默认）。理由：Windows 那台电脑也要接着开发，两边都会写这两个文件，靠 git 才接得上。
  代价是要守同步纪律（开工 `pull --rebase`、收工 push；`LOG.md` 冲突两边都留），见 `AGENTS.md`。
- **画布是 SVG DOM，不是 canvas。** 导出 = 克隆当前 `<svg>` → 剥 `data-ui` → 重设 viewBox → 栅格化，
  所以所见即所得、SVG 导出天然矢量。否决 canvas（矢量导出要另写一遍绘制，等于两份真相）。
- **macOS 壳用 Swift + WKWebView**（`macos/`），不打包浏览器内核。否决 Tauri（要装 400 MB Rust 工具链、
  首编译 5–10 min）、Electron（150–250 MB，与「体积小、启动快」直接冲突）、launchd 常驻服务器
  （无原生保存对话框、常驻内存）。
- **App 里自动存档写真实文件**（`~/Library/Application Support/Optical Bench/autosave.json`）。
  理由：WebKit 的 `localStorage` 延迟落盘，写完立刻 `⌘Q` 会丢数据。浏览器/Safari 路径仍用
  `localStorage`（键 `optical-bench.autosave.v1`）。
- **一个仓库、一份源码、两个壳目录**，不开 `mac`/`win` 双分支。否决双分支：共用代码占 95%，
  一周内就分叉，之后每次改功能都要 cherry-pick 两遍。
- **二进制走 GitHub Releases**，`dist/`、`build/`、`.dmg` 不进 git（撑大历史且无法 review）。
- **许可拆分**：代码 MIT，器件图形 CC BY-NC 3.0。否决整体 MIT——无权替第三方图形改许可。
- **BS 的透射/反射两支继承同一 $q$**，所以同色、同发散。这是用户明确要求的行为。
- **Playwright 回归不进 CI**（要下载浏览器，每个 job 多几分钟）；CI 只做 `npm ci` → `typecheck` →
  `build`，macOS 与 Windows 各跑一遍，防止只在 Mac 开发时 Windows 线悄悄烂掉。

## 生效参数

- 版本 `1.3.2`（build 10302），唯一来源 `package.json` ｜ ad-hoc 签名，arm64，最低 macOS 11
- 产物：`build/Optical Bench.app` 952 KB（前端资源 448 KB）｜`build/Optical Bench 1.3.2.dmg` 518 KB
- 冷启动到窗口可见 196 / 207 ms（构建后首次 516–770 ms）｜常驻约 99 MB RSS
- 回归测试 26（交互）+ 25（v1.1 功能）+ 27（光学引擎）= **78 项**
- 端口 5180（`scripts/serve.mjs` 与 `vite` 同端口）｜缩放 3 %–6000 %（1 px/mm = 100 %）
- 孔距 25 mm ｜ `z` 默认 25.4 mm（桌面以上）｜工程 schema `optical-setup/1`、3D 导出 `optical-bench/scene3d/1`

## 关键文件与入口

- `src/store.ts` — zustand：工程、选择、视图、撤销快照栈
- `src/lib/optics.ts` · `opticsMap.ts` · `spectrum.ts` — 光路追迹、器件→光学行为、波长配色（v1.3.2 核心）
- `src/components/Stage.tsx` — 画布与全部指针交互；`Inspector.tsx` — 右侧属性面板
- `src/lib/export.ts` · `native.ts` · `platform.ts` — 导出管线、原生桥、⌘/Ctrl 文案
- `macos/src/{main,NativeBridge,WebSchemeHandler}.swift` + `scripts/build-mac-app.sh` — 原生壳与打包
- 文档：`docs/AUTO-BEAMS.md`（光路模型与限制）· `docs/PLATFORMS.md`（双平台、桥协议、发版）
  · `docs/MACOS-APP.md`（打包实测与版本记录）

## 已知问题 / 限制

- **Windows 没有原生壳**：只有 `Optical Bench.bat` → `serve.mjs` → Edge `--app` 窗口。方案 A（WebView2）
  已在 `docs/PLATFORMS.md` 选定，未开工；`windows/README.md` 是带约定的占位。
  但 Windows 侧其实**已用 Tauri 打包成功过**（在另一台 Windows 电脑上），只是那台机器不在手边、
  工作没有合并进本仓库。合并前不要按「从来没做过」重头规划。
- `.app` arm64 only、未签名未公证（外传需 `xattr -dr com.apple.quarantine`）、无自动更新。
- 光路模型是 2D 傍轴：>20–30° 只有几何近似；薄透镜无像差；凹面镜按平面处理；**无偏振、无干涉**
  （PBS 与 BS 一样 50/50，`split` 字段已留未开放）；无光阑衍射。
- 光束是独立线段、不会在器件处自动断开，一条光路要画成几段（多段串成一条在计划里）。
- 冲突检测只按矩形足迹（OBB + 分离轴），不考虑器件高度；镜架等支架对光透明。
- **GitHub Releases 上还没有二进制**，`.dmg` 只在本地 `build/` 里。

## 下一步

**暂不推进新功能**（2026-11-08 用户定）。真要动时先问方向，候选有三个：

1. **合并 Windows 侧已有的 Tauri 打包工作**——用户 2026-11-08 确认：打包在另一台 Windows 电脑上
   成功过，机器不在手边，**等机器可取回时再处理**。届时一并重新评估 `docs/PLATFORMS.md` 的推荐
   （Tauri 既然已跑通，继续走它可能比从零写 WebView2 壳划算，文档现在推荐 A 是当初只做纸面比较的结论）。
2. Windows WebView2 原生壳（在 `windows/src/` 实现 `src/lib/native.ts` 的五个 op，
   补 `windows/build-win-app.ps1`，`.bat` 保留）——若不走 Tauri 则选这条。
3. 首次发版（`git tag v1.3.2` + `gh release create`，注意 `gh` 尚未安装）。

## 坑（不要重复做）

- **`localStorage` 静默丢数据**：实测写完立刻退出就丢（连续启动时计数器每两次才进一位），等到 3 秒后才稳。
  App 里必须立刻落盘成文件，退出前 flush（最多等 1.5 s）。
- **原生菜单会抢快捷键**：`⌘Z/⌘C/⌘V/⌘A` 在被送到页面之前就被 AppKit 吃掉。做法是菜单项不直接执行动作，
  先问 `window.__obMenuActive()` 焦点是否在输入框：在输入框交给 AppKit，否则回调页面。
- **Safari 触控板捏合不发 `ctrl+wheel`**：只处理 `ctrl+wheel` 的代码在 Safari 上等于没写，
  要另接 `gesturestart/gesturechange/gestureend`。
- **WebKit 剪贴板必须在手势内同步构造** `ClipboardItem`（传 Promise），否则抛 `NotAllowedError`；
  失败要降级成下载 PNG。
- **`build-mac-app.sh --no-dmg` 曾成功却返回退出码 1**：`set -e` 配合末尾 `[ ... ] && ...` 的副作用，已改成 `if`。
- **`github.com:22` 密钥交换会被切断**：`~/.ssh/config` 已把 `github.com` 指到 `ssh.github.com:443`。
  这是全局配置，别的仓库也走这条；要撤销就删那一段。
- **存档不跨版本继承**：`opticalbench://app` 与 `http://127.0.0.1:5180` 是两个 origin。换版本要先用
  `.osopt.json` 中转（Safari 里 `⌘S`，App 里 `⌘O`）。
- `git config` 是**仓库级**的（`zzrtbf` / GitHub noreply 邮箱），换机器不继承。
- **已确认（2026-11-08）**：Windows 侧此前用 **Tauri 打包成功过**，但在另一台 Windows 电脑上，
  那台机器暂不在手边，所以没有合并进本仓库（`windows/` 现在只有 `.bat`）。**用户决定以后再处理**，
  不是悬案、不用每次会议重问。合并时仍需核实 Windows 版是否与 v1.3.2 对齐
  （自动光路、v1.3.1 文本缩放）。
