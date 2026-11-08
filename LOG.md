# 决策与尝试日志

只追加，不删改。最新的写在最上面。摘要性结论进 `STATE.md`，过程与理由留在这里。
来源标注：`[会话]` = DSH 会话日志（本地，`~/.dsh/sessions/`）｜`[git]` = 提交｜`[文档]` = 仓库内 md｜`[文件]` = 文件 mtime。

## 2026-11-08 STATE.md / LOG.md 改为入库

- 起因：用户指出两台机器（Mac / Windows）都要接着开发，工作状态应该跟着仓库走，所以让这两个文件进 git。
  这推翻了 project-memory 的默认（只留本地）和本仓库原先的 `.gitignore` 规则。
- 做法：`.gitignore` 移除 `STATE.md` / `LOG.md`，注释改成「刻意入库，不要加回来」；`AGENTS.md` 的
  「工作状态约定」改为入库并写明跨机器同步纪律；CI 加 `paths-ignore` 跳过这两个文件（同步笔记会频繁
  推送，不值得白烧两个 job；同一次提交里还有别的改动时 CI 照跑）；中英 README 目录各补两行。
- 结论：完成。已知代价是合并冲突——`LOG.md` 只追加且新条目在最上面，两台机器同一天都写会在文件头相撞，
  规则是两边条目都保留，不删另一台机器的记录。 [会话][git]

## 2026-11-08 Tauri 打包的来龙去脉（用户澄清）

- 起因：公开文档 `docs/PLATFORMS.md` 推荐 WebView2（方案 A），而本日志早先记着用户「Windows 那边用 tauri
  打包过」，两者对不上，向用户追问。
- 澄清：**确实在一台 Windows 电脑上用 Tauri 打包成功过**；那台电脑现在不在手边，所以 Windows 打包那部分
  工作没有合并进本仓库。**用户决定以后再处理**，现在不动。
- 处理：只在本地 `STATE.md` 记下这个事实（「已知问题」「下一步」「坑/待确认」三处都补了），**不改公开文档**。
  `docs/PLATFORMS.md` 暂时保持推荐 WebView2；等 Tauri 工作合并进来时再重新评估——Tauri 既然已跑通，
  继续走它可能比从零写 WebView2 壳划算（当初推荐 A 只是纸面比较的结论）。
- 未动：仓库代码、README、CI 一行没改；本次只改了被 gitignore 的本地状态文件。 [会话]

## 2026-11-08 用 project-memory 建状态文件（本次整理）

- 目标：给工作区建立可交接的工作状态，避免每开一个新会话都从头考古。
- 形态判断：**单任务**，不是主题工作区。理由：macOS 壳、自动光路、发布这几条线共享同一份 `src/`、
  同一个 `package.json` 版本号、同一套 78 项回归和同一组仓库规则，按「共享参数与结论」看是一件事。
- 做法：根目录建 `AGENTS.md`（48 行，进 git）+ `STATE.md`（~90 行）+ `LOG.md`，后两者写进 `.gitignore`。
- 材料来源：仓库自带文档（README / MIGRATION-TO-MACOS / docs/*）为主；会话日志（迁移 f91af46b，
  11-01 17:30 → 11-07 20:40；GitHub 81d47ef9，11-08 18:36 → 21:09）补决策理由与坑；
  v1.0–v1.2 无本地来源，只记了「待确认」，未补写。 [文档][会话][git]
- 结果：`git status` 只有 `.gitignore` 修改 + `AGENTS.md` 新增；`STATE.md`/`LOG.md` 被忽略，不进公开仓库。
  本次没有改代码、没有跑回归测试。
- 结论：用户决定**暂不推进新功能**，Release 继续押后；`AGENTS.md` 与 `.gitignore` 的改动暂不提交，用户自己看过再定。

## 2026-11-08 GitHub 公开 + 双 README + MIT

- 目标：把软件同步到 `github.com/zzrtbf/draw_simple_optical_setup`，并让 Mac/Windows 两版长期共存。
- 做法：`mac/` 改名 `macos/`、新建带约定的 `windows/`；写 `docs/PLATFORMS.md`（组织方式 + 桥协议 + 发版流程）；
  加 `.github/workflows/ci.yml`（macos-latest + windows-latest 各跑 install/typecheck/build）；
  补 `README.en.md` 与中英切换链接；加 `LICENSE`（MIT，`package.json` 补 `license`/`author`）。
- 结果：`9241c5d`（导入 v1.3.2）→ `f640967`（英文 README）→ `3628681`（MIT）都在 `origin/main`；
  CI 两个平台 job 全绿（run 42482203912、后续 ci #3）；`.git` 只有 2.2 MB（产物已排除）。
- 结论：完成。**Release 暂不发**——用户说「等开发的更好了再发布」，`.dmg` 留在本地 `build/`。 [会话][git]
- 附带修：`scripts/build-mac-app.sh --no-dmg` 退出码（`set -e` + 末尾 `[ ] &&` → `if`）；
  git 身份设为仓库级 `zzrtbf` / GitHub noreply；`~/.ssh/config` 把 `github.com` 指向 `ssh.github.com:443`。

## 2026-11-06 v1.3.2 自动光路追迹 + 重新打包

- 目标：Laser / 光纤耦合器作为光源，经镜、透镜、BS 自动算出光路，探测器处截止；波长决定颜色。
- 做法：新增 `src/lib/optics.ts`（q 参数传播）、`opticsMap.ts`（器件→光学行为）、`spectrum.ts`（波长→颜色）、
  `components/AutoBeams.tsx`（绘制）；`scripts/optics-test.mjs` 27 项断言；示例布局的器件朝向修正为物理自洽。 [文件]
- 结果：`npm run test:ui` 78 项（26+25+27）；`.app` 952 KB / `.dmg` 520 KB；冷启动 196 / 207 ms；v1.3.2（build 10302）。
- 结论：完成并交付。口径定了：**光路不存进工程文件**，每次由布局重算（`docs/AUTO-BEAMS.md`）。 [会话][文档]

## 2026-11-01 ~ 11-07 v1.3.1 文本不能缩放

- 现象：插入的文本只有旋转手柄、没有四角手柄；角手柄逻辑写的是 `w`/`h`，而文本尺寸只由 `size`（字号 mm）决定，
  所以即使有手柄也不会变。
- 做法：文本选中后给四角手柄，按对角锚定等比缩放 `size`；`Inspector` 的 `Size` 输入框本来就能用，未改动。
- 结果：实测 10 mm → 29.8 mm，对角保持不动。结论：完成（版本号由用户指定为 v1.3.1）。 [文档/MACOS-APP 版本记录]

## 2026-11-01 ~ 11-07 v1.3.0 macOS 原生壳（Swift）

- 决策过程：先摊开四条路（Tauri / Swift+WKWebView / launchd 常驻 / Electron）比体积与启动，然后选 B，
  并在开工前做了「一个 Swift 文件只加载测试页 + 测 `localStorage` + 量体积启动」的最小验证，避免在未验证的假设上堆 250 行代码。
- 做法：`macos/src/main.swift`（窗口、菜单、退出前 flush）、`NativeBridge.swift`（五条 op）、
  `WebSchemeHandler.swift`（`opticalbench://` 供页面）、`scripts/build-mac-app.sh`（一条命令出 .app + .dmg）。
- 结果：940 KB / 744 KB dmg，冷启动约 0.22 s；前端只动 `persist.ts`、`export.ts`、`Toolbar.tsx`、`store.ts`+`App.tsx`
  四处，浏览器路径原样保留，51 项回归一条没坏。
- 两个坑：`localStorage` 静默丢数据 → 改文件式自动存档；原生菜单抢 `⌘Z/⌘C/⌘V/⌘A` → 菜单项先问焦点是否在输入框。
- 否决记录：用户先说 Windows 那边用 Tauri 打包过，但明确「不是一定要用 Tauri，只是要体积小、启动快」，所以没锁定 Tauri。 [会话]

## 2026-11-01 macOS 迁移：Safari 路线，51 项回归

- 做法：`npm install` → `npm run build` → `scripts/serve.mjs` + Safari；加 `Optical Bench.command` 启动器；
  用 `PW_ENGINE=webkit` 跑同一套断言（Safari 同引擎）。
- 结果：26/26 + 25/25 在 Chromium 与 WebKit 上均通过；`MIGRATION-TO-MACOS.md` 状态改成「已执行完毕」，
  验收表与细节转到 `docs/MACOS-SAFARI.md`。
- Safari 专属修复：捏合手势（`gesturestart/change/end`）、剪贴板在手势内构造 `ClipboardItem`、
  `chord()` 快捷键文案、触控板滚动。 [会话][文档]

## v1.0–v1.2（Windows 时期，日期与过程待确认）

- 能确认的只有：需求书 `Draw Simple Optical Setup.md`（v1.0 之前写下）+ 一次 squash 导入 `9241c5d`（11-08）。
  Windows 侧的开发会话不在本机（原目录 `dsh_space/draw_simple_setup` 已不在磁盘，只剩一个 4 KB 空会话壳），
  所以这些版本的具体做法、放弃过什么，**没有可信来源，不补写**。
- 待确认：用户在迁移会话里提到 Windows 那边「用 tauri 打包过」，但本仓库 `windows/` 只有 `.bat` + `serve.mjs`，
  没有任何 tauri 配置或源码 —— tauri 那次的产物是否还在、要不要迁进来，需要问。 [会话]
