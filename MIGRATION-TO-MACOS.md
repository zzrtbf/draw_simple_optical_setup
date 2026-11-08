# Optical Bench → macOS 迁移任务书

> 交给 MacBook 上的 DSH 执行。读完整份再动手；第 0 节是一分钟版。

> **状态（2026-11-01）：已执行完毕。** 目标浏览器改为 **Safari**（不是 Chrome/Edge），
> 不打包 `.app`，用开发态运行。实际操作说明与验收表在
> [docs/MACOS-SAFARI.md](docs/MACOS-SAFARI.md)；回归测试 51/51 在 Chromium 与
> WebKit（Safari 引擎）上均通过。本文档保留作为背景资料，第 5/6 节里与 Safari
> 有关的条目已在代码中处理。

---

## 0. 一分钟版

这个软件是**纯前端**（React + TypeScript + Vite）加**一个 Node 静态服务器**，没有任何原生模块、
没有 Electron、没有二进制依赖。**代码本身已经能在 macOS 上跑**，你在 Windows 上看到的每一条功能
都不依赖平台。

所以这次迁移**不是重写**，是四件事：

1. 把项目拷过来，`npm install`、`npm run build`，确认能跑；
2. 跑两套 Playwright 回归（共 51 项），全绿就说明功能对齐；
3. 处理平台细节：启动器（`.command` / `.app`）、图标（`.icns`）、触控板手势、快捷键提示；
4. 用第 7 节的清单做一遍人工验收。

**完成标准**：`npm run test:ui` 输出 `26/26` 和 `25/25`，且第 7 节的手工项全部通过。

---

## 1. 这是什么软件

一个 2D 光路排布设计器，给实验物理用：真实 mm 刻度、25 mm 孔阵、器件占位冲突检测、
带渐变光晕的光束、矢量/高清导出，预留了 3D（Blender）数据导出。

- 规模：`src/` 约 5900 行，190 个文件（其中 150 个是器件库的原始 SVG/PNG 素材）。
- 目录结构与每个文件的职责见 `README.md` 的「目录」一节，这里不再重复。
- 依赖：`react`、`react-dom`、`zustand`（运行时）；`vite`、`typescript`、`playwright-core`、`@vitejs/plugin-react`（开发）。
- 关键技术决策（改代码前务必知道）：
  - 画布是 **SVG DOM**，不是 canvas。世界坐标 1 单位 = 1 mm，y 轴向下。
  - 导出 = 克隆当前 `<svg>` → 剥掉 `data-ui` 元素 → 重设 viewBox → 序列化/栅格化。所以所见即所得。
  - 器件图形在构建期被洗进 `src/generated/library.ts`（一条条字符串），渲染时按实例给 `id` 加前缀。
  - 状态在 `src/store.ts`（zustand），撤销是快照栈。
  - 自动存档在 `localStorage`，键 `optical-bench.autosave.v1`。

---

## 2. 把文件拿过去

从 Windows 机器拷**整个项目目录**，但排除这三样（都可以重新生成）：

```
node_modules/     # 在 Mac 上 npm install 重新装（要 arm64 的）
dist/             # npm run build 重新生成
.tmp/             # 临时截图和调试脚本，别拷
```

可选精简：`ComponentLibrary_files/png/`（约 70 个 PNG）**只在我做器件对照图时用过，程序不读它**，
可以不拷，省 1 MB。程序只需要 `ComponentLibrary_files/svg/`（构建期 `npm run gen` 用）。
`Thumbs.db` 是 Windows 垃圾文件，删掉。

必需清单（缺一个都会出问题）：

```
package.json  package-lock.json  index.html  tsconfig.json  vite.config.ts
src/**                        # 全部源码
scripts/**                    # 构建、启动、测试脚本
assets/**                     # icon.svg、parts/x-objective.svg、app.iconset/
public/icon.svg
ComponentLibrary_files/svg/** # 器件库原始矢量图
docs/**  README.md            # 文档与截图，可选但建议留
Optical Bench.command         # Mac 启动器（见第 5 节）
```

**拷贝方式的影响**：

- 从 U 盘 / 网盘 / 邮件下载的文件夹会带 `com.apple.quarantine` 扩展属性，双击 `.command` 会被
  Gatekeeper 拦住。解法：右键 → 打开，或者
  `xattr -dr com.apple.quarantine "/path/to/draw_optical_setup"`。
- AirDrop 传文件夹会丢 Unix 权限位，`.command` 的可执行位要重新加（见第 4 节 Step 5）。

---

## 3. 环境准备

| 项 | 要求 | 检查命令 |
| --- | --- | --- |
| Node.js | **22 或 24 LTS，Apple Silicon 用 arm64 版**（Vite 8 要求 ≥ 20.19） | `node -v && node -p process.arch` |
| npm | 随 Node 安装 | `npm -v` |
| 浏览器 | **Chrome 或 Edge**（推荐），Safari 见第 6 节 | `ls /Applications | grep -i -E "chrome|edge"` |

装 Node 推荐从 <https://nodejs.org> 下 LTS 的 `.pkg`，或者 `brew install node`。
确认 `process.arch` 是 `arm64`（如果是 `x64` 说明走的是 Rosetta 版，能跑但慢，建议重装）。

---

## 4. 分步执行

每一步都给了验收标准，不达标不要往下走。

### Step 1 — 安装依赖

```bash
cd "/path/to/draw_optical_setup"
npm install
```

验收：退出码 0，`node_modules/` 出现，`npm ls --depth=0` 无 `UNMET`。

### Step 2 — 跑开发模式

```bash
npm run dev
```

验收：日志出现 `VITE ready` + `http://127.0.0.1:5180/`；浏览器打开后能看到深色界面、
左侧器件库有缩略图、中间是 600×450 的板子。

> 顺手验一下：地址后加 `?demo` 会加载示例布局；`?demo&light` 是白色画布。
> 这两个是开发用的 URL 参数，正式功能里也有对应的按钮。

### Step 3 — 构建 + 静态服务器

```bash
npm run build          # 产出 dist/
node scripts/serve.mjs --open
```

验收：自动弹出**无地址栏**的浏览器窗口（Chrome/Edge 的 `--app` 模式），界面可用。
按 `Ctrl+C` 结束服务器。

### Step 4 — 回归测试（最重要）

另开一个终端，先 `npm run dev` 保持运行，然后：

```bash
npm run test:ui
```

验收：输出 `26/26 checks passed` 和 `25/25 checks passed`，退出码 0。
脚本会自动找 Chrome/Edge；找不到时用 `EDGE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` 指定。

> 这是判断"迁移成功"的最硬指标。任何一项 FAIL 都属于功能退化，必须先修。

### Step 5 — 启动器

`.command` 已经写好了，但拷过来之后可执行位可能丢了：

```bash
chmod +x "Optical Bench.command"
xattr -dr com.apple.quarantine .        # 如果双击提示"无法打开"
```

验收：双击 `Optical Bench.command` → 终端窗口打开并显示 `Optical Bench running at http://127.0.0.1:5180/`
→ 弹出无地址栏窗口。关掉终端窗口 = 退出软件。

### Step 6 — 做成 .app（可选，但是 Mac 上最舒服的形态）

```bash
npm run icon      # 生成 assets/app.iconset/（10 个尺寸的 PNG）
npm run app:mac   # 打包成 "Optical Bench.app"（内部调用 iconutil 生成 .icns）
open "Optical Bench.app"
```

验收：Finder 里出现带图标的 `Optical Bench.app`，双击能起窗口，Dock 里图标正确，
`Cmd+Q` 能退出。

> ⚠️ `scripts/make-mac-app.mjs` 是我在 Windows 上写的，**没有在 macOS 上验证过**。
> 如果失败，按下面的信息自己修：`.app` 结构是
> `Contents/{Info.plist, MacOS/run, Resources/app.icns}`，`run` 是可执行 shell 脚本，
> 里面 `exec <node 绝对路径> scripts/serve.mjs --open`。注意 `.app` 启动时的 PATH 只有
> `/usr/bin:/bin:/usr/sbin:/sbin`，所以**必须用绝对路径调 node**（脚本已经把 `process.execPath` 写进去了），
> 否则 `node: command not found`。

### Step 7 — 图标

`npm run icon` 已经会同时生成 Windows 的 `.ico` 和 macOS 的 `.iconset`。
Mac 上再执行 `iconutil -c icns assets/app.iconset -o assets/app.icns` 就是 `.icns`。
`npm run app:mac` 会自动做这一步。

### Step 8 — 人工验收

按第 7 节的清单过一遍，重点是：字体、Retina 清晰度、触控板手势、白底画布、导出。

---

## 5. 平台相关代码：现状与还需要做的

我在 Windows 上已经把能通用的部分改好了，你主要做**验证 + 少量收尾**。

| 位置 | 现状 | Mac 上需要 |
| --- | --- | --- |
| `scripts/browser-path.mjs` | 新增。按平台探测 Edge/Chrome/Brave，支持 `EDGE_PATH`/`CHROME_PATH` 覆盖 | 验证能探测到 Chrome |
| `scripts/serve.mjs` | 已加 darwin 分支：`open -na "<browser>.app" --args --app=<url>` | 验证弹的是无边框窗口；浏览器缺失时退回默认浏览器（带地址栏） |
| `scripts/make-icon.mjs` | 已能同时产 `.ico` + `.iconset`（16…1024） | 验证 `npm run icon` 成功 |
| `scripts/make-mac-app.mjs` | 新增，**未验证** | 跑通，失败就按 Step 6 的说明修 |
| `scripts/ui-test*.mjs` | 已改用 `findBrowser()` | 验证 51/51 |
| `Optical Bench.command` | 新增 | `chmod +x`，验证双击启动 |
| `src/components/Stage.tsx` | 已加 `IS_MAC` 判断：Mac 上两指滑动 = 平移，捏合（`ctrl+wheel`）= 缩放；Windows 不变 | 验证触控板手感 |
| `src/App.tsx` | 快捷键用 `e.ctrlKey \|\| e.metaKey`，Cmd 和 Ctrl 都认 | 验证 `Cmd+Z/S/O/V/D` |
| `src/components/Stage.tsx` | `Ctrl/Cmd + 拖动` 都是拖动复制 | 验证 Cmd+拖动；注意 Mac 上 **Ctrl+点按 = 右键**，所以必须用 Cmd |
| `Optical Bench.bat` | Windows 启动器 | 保留即可，Finder 里不会响应 |

**建议（不强制）的收尾改动**：

1. 界面里所有写死 `Ctrl+Z`、`Ctrl+S` 的提示文案，在 Mac 上应显示 `⌘Z`、`⌘S`。
   位置：`src/components/Inspector.tsx` 的 Shortcuts 区块、`src/components/Toolbar.tsx` 的
   `title` 属性、`README.md`。用一个 `const MOD = IS_MAC ? '⌘' : 'Ctrl+'` 统一替换即可。
2. `README.md` 的「怎么打开」一节补上 Mac 的两种启动方式。

---

## 6. 兼容性风险清单

按"会不会真的咬人"排序。

### 6.1 Ctrl vs Cmd（中风险，已大部分处理）

- 代码里所有快捷键都写成 `e.ctrlKey || e.metaKey`，Cmd 可用。
- **拖动复制**必须用 Cmd：Mac 上 Ctrl+点按被系统当作右键，会触发 `button === 2` 的平移分支。
- 验证：`Cmd+Z` 撤销、`Cmd+S` 保存、`Cmd+拖动` 复制。
- 残留问题：提示文案写的是 Ctrl（纯显示问题，见第 5 节建议 1）。

### 6.2 触控板滚动（中风险，已处理）

- Mac 触控板两指滑动产生的是普通 `wheel` 事件（没有 ctrlKey），如果直接当缩放用，手感会非常怪。
- 现在的逻辑：**Mac 上普通滚动 = 平移，捏合（浏览器会带 ctrlKey）= 缩放**；装了鼠标的话
  按住 Cmd 滚动也可缩放。Windows 保持"滚轮即缩放"不变。
- 验证：两指滑动应该平铺画布而不是放大缩小；双指捏合应该缩放且以光标为中心。

### 6.3 浏览器选择（中风险）

- **推荐 Chrome / Edge**。Safari 能跑但有三个问题：
  1. 不支持 File System Access API（`showSaveFilePicker`）→ 保存会退化成"下载到 Downloads"，
     能用但没有原生对话框（代码里已有 try/catch 回退）。
  2. `navigator.clipboard.write` + `ClipboardItem` 在 Safari 上限制更多，"复制图片到剪贴板"可能失败
     （已 try/catch，失败会弹 toast，不会崩）。
  3. `dominant-baseline="central"` 等 SVG 文本属性在 WebKit 上的实现有差异，导出的 PNG 里文字
     可能整体上下偏几个像素。
- 结论：`.command` / `.app` 都优先拉 Chrome/Edge；装 Safari 兼容不是这次迁移的目标。

### 6.4 字体与文字度量（低风险，但要知道）

- `FONT_STACK = 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'`。Mac 上没有前两个，
  最终落到 `system-ui`（SF Pro）。
- 画布上的文字 bbox 是用 canvas `measureText` 量出来的，和 SVG 里渲染用的是同一个字体栈，
  所以**同一台机器上始终自洽**（框、命中区、选择框不会错位）。
- 但同一份 `.osopt.json` 在 Windows 和 Mac 上打开，文本标签的宽度会差一点（字体不同），
  这是正常现象。导出的 SVG 里写的是字体栈而不是具体字体，换机器会重新排版。

### 6.5 .app 里的 PATH（中风险，仅影响 .app 打包）

`.app` 的环境变量极简，找不到 Homebrew 安装的 node。`make-mac-app.mjs` 已经把
`process.execPath` 的绝对路径写进启动脚本；如果用户之后升级/切换了 Node 版本，需要重新
`npm run app:mac`。诊断方法：在 .app 里启动失败时看 `Console.app` 的日志，或在脚本里临时加
`echo $PATH > /tmp/ob-path.txt`。

### 6.6 Gatekeeper / 隔离属性（低风险，一次性）

`.command` 和 `.app` 都不是签名应用。从网络拷过来第一次打开会被拦。解法见第 2 节和第 4 节 Step 5。

### 6.7 端口与存档位置（低风险）

- 端口 5180，macOS 上一般没人占（AirPlay 用的是 5000/7000）。
- 自动存档绑在 origin 上：`http://127.0.0.1:5180` 和 `http://localhost:5180` 是**两个不同的存档**。
  启动脚本统一用 `127.0.0.1`，别手动改。
- **Windows 上已有的图纸不会自动过来**：在 Windows 上 `Cmd/Ctrl+S` 存成 `.osopt.json`，
  Mac 上 `Cmd+O` 打开即可。

### 6.8 Retina / 高 DPI（无风险）

画布是 SVG，系统自动按 `devicePixelRatio` 渲染；PNG 导出走的是"按目标 px 重新栅格化"，
和屏幕 DPI 无关。验证：Retina 屏上画布线条应该锐利；导出的 4× PNG 放大后依然清晰。

### 6.9 其它小项（无风险，已确认）

- 路径全部用 `node:path` 拼接，没有硬编码 `\`。
- 没有原生模块、没有 postinstall 编译、没有 GPU 依赖。
- 文件系统大小写不敏感：所有 import 大小写和文件名严格一致，无影响。
- 端口占用时启动脚本会检测 `EADDRINUSE` 并直接打开已有服务，不会报错退出。

---

## 7. 功能验收清单

**A 组**由 `npm run test:ui` 自动覆盖（两套共 51 条断言），跑绿即可，不用手工重复。
下表按**功能**归类，一行可能对应多条断言。
**B 组**需要人工看一眼。全部通过 = 功能对齐。

### A 组（自动，`npm run test:ui`）

| # | 功能 | 覆盖点 |
| --- | --- | --- |
| A1 | 示例布局加载 | 9 个器件 / 5 条光束 |
| A2 | 拖动 + 25 mm 吸附 | 拖动后坐标落在孔位上 |
| A3 | 撤销 | 复原到位 |
| A4 | 四角缩放 | W/H 改变 |
| A5 | 旋转手柄 | 角度改变 |
| A6 | 画光束 | 光束数 +1，端点吸附 |
| A7 | 光束端点手柄 | 拖动改变端点 |
| A8 | 文本插入 + 双击就地编辑 | 内容提交 |
| A9 | 框选多选 | 选中多个 |
| A10 | 六向对齐（Left） | 所有左边缘落齐 |
| A11 | 器件库点击放置 | 数量 +1 且自动选中 |
| A12 | 删除 | 数量复原 |
| A13 | 无限点阵 / 面包板切换 | 模式变化 |
| A14 | PNG 导出（4×） | 下载成功且非空 |
| A15 | SVG 导出 | 有 viewBox、mm 单位、无编辑器痕迹 |
| A16 | 3D scene JSON 导出 | schema 正确 |
| A17 | 工程保存 | JSON 结构正确可回读 |
| A18 | 连续撤销 | 不崩 |
| A19 | `?export` 预览 | 能渲染 |
| A20 | 物镜器件 | 库里有、能放置 |
| A21 | 白底画布 | 主题切换 + 文字自动变深 |
| A22 | 标签拖动 | 可移动且保持水平 |
| A23 | Cmd/Ctrl 拖动复制 | 数量 +1、原件不动 |
| A24 | Alt 取消吸附 | 落点不在 25 的倍数上 |
| A25 | 每个器件的吸附开关 | 关掉后自由移动 |
| A26 | 光束长度/角度输入 | 数值生效 |
| A27 | 拖动不再有对齐参考线 | 0 条引导线 |
| A28 | 左右侧栏收起/展开 | 面板消失/恢复 |

### B 组（人工，5 分钟）

| # | 检查 | 期望 |
| --- | --- | --- |
| B1 | 触控板两指滑动 | 画布**平移**，不是缩放 |
| B2 | 触控板捏合 | 以光标为中心缩放 |
| B3 | `Cmd+Z` / `Cmd+S` / `Cmd+O` / `Cmd+C` / `Cmd+V` / `Cmd+D` | 都生效 |
| B4 | 空格 + 拖动 | 平移；光标变成抓手 |
| B5 | 器件库缩略图 | 66 个全部显示，无裂图 |
| B6 | Retina 屏清晰度 | 线条锐利，文字不糊 |
| B7 | 白色画布（工具栏太阳按钮） | 板子变白、点阵变浅灰、文字自动变深 |
| B8 | 白底导出 | 弹"Export"→ 背景选 white → PNG：白底、黑字、光束正常 |
| B9 | 导出 4× PNG 放大看 | 矢量边缘清晰，不是放大的截图 |
| B10 | 保存到磁盘 | Chrome/Edge 弹原生保存对话框；Safari 退化为下载（可接受） |
| B11 | 关闭终端/.app 后 | 网页失去连接（预期行为，说明服务器已停） |
| B12 | Dock 图标（如果做了 .app） | 是新图标，不是默认白纸 |

---

## 8. 不要做的事

- **不要重写渲染层**。SVG DOM 方案是刻意的（导出所见即所得、矢量、DOM 命中测试），换 canvas 会
  把导出和选择逻辑全部推翻。
- **不要把 `.bat` 删掉改写成 `.command`**。两个文件并存，各自的平台用各自的。
- **不要动 `src/generated/library.ts`**。它是 `npm run gen` 的产物，改了会在下次生成时被覆盖。
- **不要升级依赖大版本**（Vite/React）。Windows 上验证过的是现在这组版本，迁移期不需要引入变量。
- **不要为了"Mac 优化"改数据模型**。`.osopt.json` 要和 Windows 版互通。

---

## 9. 已知未做（不属于本次迁移）

- Electron 安装包（现在的"桌面应用" = 本地服务器 + 浏览器 app 窗口）。
- 器件资源库 / 模型导入（Blender 那条线只做了数据结构和 `scene3d.json` 导出）。
- 多段光路串成一条、测距/标注工具。

---

## 10. 完成后回传什么

给用户一份短报告，包含：

1. `npm run test:ui` 的原始输出（两段 `xx/xx checks passed`）；
2. B 组 12 项的通过情况，没通过的写现象；
3. 你实际改动的文件列表和原因；
4. 如果 `make-mac-app.mjs` 有修改，附上新版本，Windows 那边需要同步。
