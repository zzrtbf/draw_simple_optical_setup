# 在 macOS 上用 Safari 跑 Optical Bench

> **v1.3.0 起有了更省事的路径**：原生 App（`npm run app:build`），940 KB、冷启动约 0.2 秒、
> 带真正的「另存为」对话框，见 [MACOS-APP.md](MACOS-APP.md)。本文档保留作为「不打包、
> 只用 Safari」的方案说明——改前端代码时调试仍推荐这条路（热更新）。

这份文档对应「不打包成 .app、用开发态先跑起来」的方案。**Safari 是主用浏览器**，
不需要装 Chrome/Edge。

启动方式只有两条，选一条就行：

```bash
# 方式 A：开发态（改代码即时热更新，适合调功能）
cd "/Users/zzrtbf/Documents/WorkSpace/dsh_space/draw_optical_setup"
npm install          # 只需要一次
npm run dev          # 然后 Safari 打开 http://127.0.0.1:5180/
```

```bash
# 方式 B：双击启动（跑已构建的 dist，页面更稳）
# Finder 里双击 "Optical Bench.command"
```

方式 B 会启动本地静态服务器（`scripts/serve.mjs`，端口 5180）并自动用 Safari 打开。
关掉那个终端窗口 = 退出软件。`dist/` 不存在时会自动 `npm run build` 一次。

> 想同时保留两个：dev 服务器占着 5180 时，`.command` 会检测到端口占用，直接打开已有服务，不报错。

**从 Windows 带过来的图纸**：Windows 上 `Ctrl+S` 存成 `.osopt.json`，Mac 上 `⌘O` 打开即可。
自动存档绑在 origin 上，`127.0.0.1` 与 `localhost` 是两个不同的存储，启动脚本统一用 `127.0.0.1`，别手动改。

---

## 想要独立窗口（可选，仍然不用打包）

Safari 没有 Chrome 那种 `--app` 无边框模式，但有等价物：

1. Safari 打开 `http://127.0.0.1:5180/`；
2. **文件 → 添加到程序坞…**（Safari 17 及以上）。

桌面/程序坞里会多一个图标，双击直接开一个只有画布的窗口，没有地址栏和标签页。
第一次打开时服务器要在运行；所以顺序是「先双击 `.command`，再点程序坞里的图标」。

---

## Safari 上实际改了什么

| 问题 | Safari 上的表现 | 处理方式 |
| --- | --- | --- |
| 快捷键文案 | 提示写着 `Ctrl+Z`，按的是 `⌘Z` | 新增 `src/lib/platform.ts`，界面文案在 Mac 上统一显示 `⌘Z` / `⇧⌘Z` |
| 复制图片到剪贴板 | WebKit 只允许「用户手势内同步创建」的 `ClipboardItem`，原来的写法会抛 `NotAllowedError` | 改成先把栅格化做成 Promise 再同步构造 `ClipboardItem`；仍被拒时自动降级为下载 PNG |
| 触控板捏合缩放 | Safari 不发 `ctrl+wheel`，而是发非标准的 `gesturestart/gesturechange`，原代码只认 `ctrl+wheel`，捏合无效 | `Stage.tsx` 增加 `gesture*` 事件（按 `scale` 增量缩放、以光标为中心），并屏蔽 Safari 整页缩放 |
| 两指滑动 | 已经是「平移」，无需改 | — |
| 保存工程 | Safari 没有 File System Access API，`⌘S` 会退化成"下载"；且 WebKit 会忽略未插入文档的 `<a download>` | `persist.ts` 把 `<a>` 插入文档再点击，并区分「原生对话框保存」和「存到下载文件夹」两种提示 |
| 回归测试 | 机器上只有 Safari，没有 Chromium 可驱动 | 测试脚本支持 `PW_ENGINE=webkit`，直接在 Safari 同款引擎（WebKit）上跑全部 51 项 |

**没有改、但需要知道的四点（Safari 的系统限制，不是 bug）**：

1. **保存工程没有原生对话框**：`⌘S` 存到 `~/Downloads`，界面会提示「saved to your Downloads folder」。
   要指定目录，用 `⌘O` 打开时选，或手动从下载文件夹挪走。
2. **导出 PNG/SVG 也是下载**，同样进 `~/Downloads`。Safari 第一次会问是否允许该站点下载，
   选「允许」以后不再问。
3. **同一份 `.osopt.json` 在 Windows 和 Mac 上打开，文本标签宽度会有几像素差异**——
   字体栈最后落到 `system-ui`（Mac 是 SF Pro）。框、命中区、选择框都和文字用的是同一套度量，
   同一台机器上始终自洽。
4. **Safari 导出的 PNG 里，文字比屏幕上窄约 9%（高度基本不变）**。这是 WebKit 自己的不一致：
   同一串文字，canvas 的 `measureText` 与「SVG 当成图片再栅格化」两条路径在 WebKit 里解析
   `system-ui` / `-apple-system` 这类关键字时选到了不同字面。实测（12 mm 字号，"Demo layout — mm scale"）：
   Chromium 渲染宽度 281 px vs 其 `measureText` 141.6 单位（一致）；
   WebKit 渲染宽度 257 px vs 同一 `measureText` 141.6 单位（窄 9.3%）。
   换成**具体字体名**（`Helvetica` / `Arial`）时两条路径一致到 0.6% 以内。
   影响：导出的图里标签字距略紧，但因为 `text-anchor` 为居中/起始，不会错位或裁切。
   想要像素级一致，把 `src/lib/geom.ts` 的 `FONT_STACK` 前面加一个具体字体名即可。

---

## 回归测试（判断"没退化"的硬指标）

两套断言共 51 项，需要 dev 服务器在跑。

```bash
# 终端 1
npm run dev

# 终端 2：Safari 引擎（WebKit）
npx playwright-core install webkit chromium      # 只需要一次，约 300 MB
PW_ENGINE=webkit npm run test:ui

# 或者在有 Chrome/Edge 的机器上
EDGE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:ui
```

Mac 上断言按键用的是 `⌘`（`Meta`），Windows 上是 `Ctrl`——脚本按平台自动选。

期望输出：`26/26 checks passed` 和 `25/25 checks passed`，退出码 0。

> 测试引擎放在 `~/Library/Caches/ms-playwright/`，是测试基础设施，和软件本身运行无关；
> 你日常用 Safari 跑这个软件不需要它。

---

## 手工验收（Safari 上花两分钟）

| 检查 | 期望 |
| --- | --- |
| 两指滑动 | 画布平移，不是缩放 |
| 双指捏合 | 以光标为中心缩放，且 Safari 整页不缩放 |
| `⌘Z` / `⌘S` / `⌘O` / `⌘C` / `⌘V` / `⌘D` | 都生效（`⌘C/⌘V` 是软件内部的复制粘贴） |
| `⌘` + 拖动 | 拖动复制；注意 Mac 上 **Ctrl+点按 = 右键**，所以这里必须是 `⌘` |
| 空格 + 拖动 | 平移，光标变抓手 |
| 器件库缩略图 | 66 个全部显示，无裂图 |
| Retina 清晰度 | 线条锐利 |
| 白色画布（工具栏太阳按钮） | 板子变白、点阵变浅灰、文字自动变深 |
| 导出 4× PNG | 白底/深底正常，放大看是矢量边缘 |
| 关掉终端窗口 | 页面失去连接（说明服务器已停，符合预期） |

---

## 已知不做的事

- **不打包 `.app`**（当前阶段）。`scripts/make-mac-app.mjs` 保留着，哪天真要打包再验证。
- 不改成 Electron。现在的「桌面应用」= 本地服务器 + 浏览器窗口。
- 不为了 Safari 改数据结构：`.osopt.json` 必须和 Windows 版互通。
