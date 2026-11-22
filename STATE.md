# Optical Bench 状态：2026-11-22

## 目标

做一个在搭光路之前排布器件的 2D 设计器（真实 mm 尺度、器件冲突检测、自动光路追迹），
成品是 macOS 双击可用的原生 App + Windows 免安装版，两个平台共用一份前端源码。

## 当前阶段

**v1.3.5 完成，没有正在开发的功能。** 最近三版：v1.3.3 = 物镜工作距离 + BS 透射比 + 光路下沉；
v1.3.4 = UI 强调色青绿 → 深蓝；v1.3.5 = 自动光路可一键转手绘、按光源来回切（11-22 修补了手绘吸附/对齐
与文字点击外保存，版本号按用户要求仍为 1.3.5）。源码、双 README 与 CI 在 `origin/main`；
`.app`/`.dmg` 只在本地 `build/`（按约定不入库，也还没发 Release）；本文件与 `LOG.md` 入库，
两台机器靠 git 同步。功能上暂不推进（见末尾）。

## 已定决策

- **`STATE.md` / `LOG.md` 进 git，两台机器用仓库同步**（2026-11-08 用户改，推翻 project-memory 的
  「只留本地」默认）：Windows 那台也要接着开发。代价是同步纪律（开工 `pull --rebase`、收工 push；
  `LOG.md` 冲突两边都留），见 `AGENTS.md`。
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
- **物镜用工作距离 WD，而不是焦距 + 光心居中**（2026-11-20 用户定）。等效薄透镜放在筒身前端
  出射窗口（`faceAt = 46.5/48`，默认相对转轴 +22.5 mm），焦距取 WD，所以准直入射时汇聚点正好在
  窗口外 WD。旧做法把薄透镜放在镜筒中心，焦点会落在物镜内部；已删掉。
- **自动光路画在器件图层下方**（2026-11-20 用户定）。反射光停在反射镜/PBS 的轮廓处，不再盖住器件；
  代价是穿过物镜筒身的那段光被筒身遮住（符合实际观感）。手绘光束同样在器件下方。
- **分束比手动 T，不做偏振**。`split` = 透射比 T，反射 1−T；支路亮度按同一光源归一化
  （50/50 与旧外观一致，0/100 % 时另一支不画）。PBS 仍是几何分光，没有 Jones 向量。
- **UI 强调色 = 深蓝 `#3b6cff`**（2026-11-20 用户定，原为青绿 `#38e1c4`）。画布 SVG 属性读不到 CSS 变量，
  所以只在两处维护：`src/lib/theme.ts` 的 `UI_ACCENT` 与 `styles.css` 的 `--accent` / `--accent-soft` /
  `--accent-line`，改色必须同步。浅色画布的原点十字线用 `#1d4ed8`。画布内容色（块色板、文字色板、
  示例布局的块）不跟着变。
- **自动 / 手绘按光源切换**（2026-11-20 用户要）。`Auto beams` 关掉 = 该光源不追迹；`Convert to hand-drawn`
  把当前追迹结果烘成带 `bakedFrom` 的普通 Beam（在器件面与焦点处切开），再打开 Auto 时隐藏而不删除。
  这台工具里「物理检查」和「画图」是两件事：自动是前者，手绘/烘焙是后者。转换有损（焦点保留、包络变直线）。
- **Playwright 回归不进 CI**（要下载浏览器，每个 job 多几分钟）；CI 只做 `npm ci` → `typecheck` →
  `build`，macOS 与 Windows 各跑一遍，防止只在 Mac 开发时 Windows 线悄悄烂掉。

## 生效参数

- 版本 `1.3.5`（build 10305），唯一来源 `package.json` ｜ ad-hoc 签名，arm64，最低 macOS 11
- **1.3.5 有两份构建**：初版 `5eda8d4`（11-20，烘焙功能）与修补版 `989da46`（11-22，吸附/对齐/文字），
  版本号与 build 都是 1.3.5 / 10305。机器上装的是哪份只能看提交或按 11-22 行为区分；当前 `/Applications`
  里是 11-22 修补版。
- 产物：`build/Optical Bench.app` 956 KB（前端资源 452 KB）｜`build/Optical Bench 1.3.5.dmg` 516 KB。
  `.app` 拖进 `/Applications` 后 Finder 会把它从 `build/` 移走，`npm run app:run` 前要先重跑 `app:build`。
- 冷启动到窗口可见 196 / 207 ms（v1.3.2 实测；1.3.3 起未重测）｜常驻约 99 MB RSS
- 回归测试 28（交互）+ 39（v1.1 功能）+ 38（光学引擎）= **105 项**（Chromium 与 WebKit 均通过）
- 物镜默认 WD 15 mm；出射窗口相对转轴 +22.5 mm（48 mm 筒身的前端面）
- 端口 5180（`scripts/serve.mjs` 与 `vite` 同端口）｜缩放 3 %–6000 %（1 px/mm = 100 %）
- 孔距 25 mm ｜ `z` 默认 25.4 mm（桌面以上）｜工程 schema `optical-setup/1`、3D 导出 `optical-bench/scene3d/1`

## 关键文件与入口

- `src/store.ts` — zustand：工程、选择、视图、撤销快照栈
- `src/lib/optics.ts` · `opticsMap.ts` · `spectrum.ts` — 光路追迹、器件→光学行为、波长配色（v1.3.2–1.3.3 核心）
- `src/components/Stage.tsx` — 画布与全部指针交互；`Inspector.tsx` — 右侧属性面板
- `src/lib/bake.ts` · `beams.ts` — 自动光路转手绘 / 可见光束过滤；`theme.ts` — 画布配色与 `UI_ACCENT`
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
  （PBS 与 BS 一样按几何分光，T/R 手动给，没有 Jones 向量）；无光阑衍射。
- **物镜 = 出射窗口处的单一薄透镜**：只保证准直入射时焦点在窗口外 WD；非准直入射只是傍轴近似。
  有效面按器件高度（30 mm）判断，不是画出来的那个 11 mm 小窗口。
- 光束是独立线段、不会在器件处自动断开，一条光路要画成几段（多段串成一条在计划里）。
- **转手绘是有损的**：Gaussian 包络变成每段直线锥度（焦点和器件面宽度保留）；烘出来的光束脱离布局，
  不再跟器件移动。
- 冲突检测只按矩形足迹（OBB + 分离轴），不考虑器件高度；镜架等支架对光透明。
- **GitHub Releases 上还没有二进制**，`.dmg` 只在本地 `build/` 里。

## 下一步

**等用户定方向**（2026-11-22 起暂停新功能；11-08 的「暂不推进」中间被 11-20/22 的需求恢复过）。三条候选：

1. **合并 Windows 侧已有的 Tauri 打包工作**——等那台 Windows 电脑可取回；届时重评
   `docs/PLATFORMS.md` 的 WebView2 推荐（Tauri 已跑通，可能更划算）。
2. Windows WebView2 原生壳：新建 `windows/src/`（现在不存在，只有占位 `windows/README.md`），
   实现 `native.ts` 的五个 op + `build-win-app.ps1`。
3. 首次发版：`git tag v1.3.5` + `gh release create`（`gh` 尚未安装；仓库目前一个 tag 都没有）。

## 坑（不要重复做）

- **`localStorage` 静默丢数据**：写完立刻退出会丢，最多等 3 s 才稳 → App 里必须立刻写文件，退出前 flush（≤1.5 s）。
- **原生菜单抢 `⌘Z/⌘C/⌘V/⌘A`**：菜单项先问 `window.__obMenuActive()` 焦点是否在输入框，是就交给 AppKit，否则回调页面。
- **Safari 捏合不发 `ctrl+wheel`**：要另接 `gesturestart/gesturechange/gestureend`。
- **WebKit 剪贴板**：必须在手势内同步构造 `ClipboardItem`（传 Promise），否则 `NotAllowedError`；失败降级下载 PNG。
- **`build-mac-app.sh --no-dmg` 曾成功却返回退出码 1**：`set -e` 配合末尾 `[ ... ] && ...` 的副作用，已改成 `if`。
- **`github.com:22` 会被切断**：`~/.ssh/config` 已把 `github.com` 指到 `ssh.github.com:443`（全局配置）。
- **存档不跨版本继承**：`opticalbench://app` 与 `http://127.0.0.1:5180` 是两个 origin，换版本先用 `.osopt.json` 中转。
- `git config` 是**仓库级**的（`zzrtbf` / GitHub noreply 邮箱），换机器不继承。
- **`build/Optical Bench.app` 会被安装动作移走**：拖进 `/Applications` 后 `build/` 里只剩 `.dmg`，
  `npm run app:run` 会找不到；重跑 `app:build`，或直接开 `/Applications` 里的。
- **本机没有系统 Chrome/Edge**：`npm run test:ui` 默认找不到浏览器；用 `PW_ENGINE=webkit`，或把 `EDGE_PATH`
  指到 `~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell`。
- **点击画布会丢文字编辑**：画布的 `pointerdown` 会先关编辑框，`onBlur` 来不及提交。现在 `TextEditor`
  在 window 的捕获阶段先 commit 再关；Esc 仍是取消，Cmd/Ctrl+Enter 仍是提交。
- **烘焙光束的吸附**：默认 `snap: true`；多选光束的 `Snap beams to hole grid` 可批量改。旧的 false 副本
  要么批量开，要么重烘。
- **Windows Tauri 不是悬案**：另一台机器上已打包成功过，等机器可取回再处理，不要重问；合并时核实与 v1.3.2 对齐。
