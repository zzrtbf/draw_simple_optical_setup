# macOS 原生应用（v1.3.2）

`Optical Bench.app` 是这份编辑器的桌面版：一个原生 Swift 外壳 + 系统自带 `WKWebView` 渲染，
前端仍是同一份 `dist/`。**不打包浏览器内核**，所以体积只有几百 KB。

## 实测数字

| 指标 | 实测值 |
| --- | --- |
| `.app` 体积 | **952 KB**（其中前端资源 448 KB） |
| `.dmg` 体积 | **520 KB** |
| 冷启动到窗口可见 | **196–241 ms**（多次实测；v1.3.2 为 196 / 207 ms） |
| 首次启动（构建后第一回） | 616–770 ms（dyld 缓存与 LaunchServices 首次注册） |
| 常驻内存 | 约 99 MB RSS（主进程；网页渲染在 WebKit 独立进程里，由系统共享） |
| 架构 / 最低系统 | arm64 / macOS 11 |
| 版本 | 1.3.2（build 10302），ad-hoc 签名 |

对照：现在这条 Safari 路径（`Optical Bench.command`）要先把 Node 服务拉起来再开浏览器窗口，
冷启动 2–4 秒，且带地址栏。

## 打开方式

1. **构建**：

   ```bash
   npm run app:build          # 前端 + Swift + .app + .dmg
   npm run app:build -- --skip-web   # 只重编 Swift，复用现有 dist
   ```

   产物在 `build/`：`Optical Bench.app`、`Optical Bench 1.3.2.dmg`。

2. **首次安装**：把 `build/Optical Bench.app` 拖进 `/Applications`（或直接从 `build/` 里双击）。
   dmg 双击挂载后同样拖过去即可。

   这个包是 **ad-hoc 签名、未公证**。在本机构建/拷贝运行没问题；如果经由网盘、AirDrop
   或邮件传给别人，对方第一次打开会被 Gatekeeper 拦一次，右键 → 打开，或：
   `xattr -dr com.apple.quarantine "/Applications/Optical Bench.app"`。

## 里面的东西和 Safari 版不一样的地方

| 能力 | Safari 版 | 原生 App |
| --- | --- | --- |
| 保存工程 | 存到「下载」文件夹 | **真正的「另存为」对话框**（`NSSavePanel`） |
| 打开工程 | 文件选择器 | 原生打开面板，并记住上次目录 |
| 导出 PNG / SVG / 3D JSON | 下载 | 原生保存对话框 |
| 复制图片到剪贴板 | WebKit 限制，可能失败并降级为下载 | `NSPasteboard`，稳定可用 |
| 自动存档 | `localStorage` | **文件**：`~/Library/Application Support/Optical Bench/autosave.json` |
| 菜单栏 | Safari 的菜单 | 自己的 `App / File / Edit / Window`，`⌘Q` 退出 |
| 地址栏 / 标签页 | 有 | 没有 |

### 自动存档为什么换成文件

WebKit 的 `localStorage` 是**延迟落盘**的。实测：写完马上退出，这次写入会丢（连续启动时计数器
每两次才进一位）；把退出前的等待拉到 3 秒后就每次都能持久化。用户在编辑后立刻 `⌘Q` 属于常见操作，
靠不住这一点就等于偶尔丢图纸。所以打包版把自动存档写成真实文件——**立刻落盘、可直接备份**。
退出时外壳还会让页面先 flush 一次再退出（最多等 1.5 秒），所以 `⌘Q` 不会丢最后一次改动。

浏览器/Safari 版仍然用 `localStorage`，行为不变。

### 存档不继承

两个版本的 origin 不同（`opticalbench://app` 与 `http://127.0.0.1:5180`），自动存档互不相通。
要带图纸过去：Safari 版里 `⌘S` 存成 `.osopt.json`，App 里 `⌘O` 打开，之后 App 自己会接着自动存档。

## 快捷键与菜单

`⌘Z` / `⌘C` / `⌘V` / `⌘X` / `⌘A` 在**画布上**是编辑器自己的操作（撤销、复制器件、粘贴器件、
全选器件）；在**输入框里**是系统文本编辑。实现方式是菜单项不直接执行动作，而是先问页面
"现在焦点在输入框吗"：在输入框就交给 AppKit，否则回调编辑器。否则原生菜单会抢在页面之前
吃掉这些按键（这是 Electron/Tauri 类应用常见的坑）。

其余快捷键（`⌘S` / `⌘O` / `⌘D` / 空格拖拽 / `B` / `T` / `0`）都由页面直接处理，不进菜单。

## 代码位置

```
macos/
  Info.plist                 # 版本号占位 __VERSION__/__BUILD__，构建时替换
  src/main.swift             # 窗口、菜单、退出前 flush
  src/NativeBridge.swift     # JS↔Swift 桥：保存/打开面板、自动存档文件、剪贴板
  src/WebSchemeHandler.swift # 把 Contents/Resources/web 以 opticalbench:// 提供
scripts/build-mac-app.sh     # 一条命令出 .app 和 .dmg
src/lib/native.ts            # 前端侧的桥接封装（浏览器里全部退化为 no-op）
```

前端只有三处调用原生能力：`lib/persist.ts`（存/开工程）、`lib/export.ts`（导出即另存为）、
`components/Toolbar.tsx`（复制图片）。其余代码不知道自己在浏览器里还是在 App 里。

## 已知限制

- **arm64 only**：Intel Mac 跑不了。需要的話可以在 `build-mac-app.sh` 里加
  `x86_64-apple-darwin` 目标做 universal（体积大约翻倍）。
- **未签名/未公证**：只适合自己用和本机分发。
- **没有自动更新**：升级就是重新 `npm run app:build` 再覆盖 `/Applications` 里的旧包；
  自动存档在 Application Support 里，覆盖安装不会丢。
- **崩溃日志**：`~/Library/Logs/DiagnosticReports/`；打开开发者工具：
  `OB_DEBUG=1 open -a "Optical Bench"` 然后在窗口里右键 → 检查元素。

## 版本记录

**v1.3.2**
- 新增**自动光路追迹**：激光 / 光纤耦合器出射准直光束，反射镜按反射定律折转、薄透镜按
  `1/q' = 1/q - 1/f` 聚焦或发散、BS/PBS 分成两束（同色、同发散），探测器处终止；光束宽度按
  高斯光束包络绘制。波长决定颜色（380–780 nm 按光谱取色，红外用暗红并标注）。详见
  [AUTO-BEAMS.md](AUTO-BEAMS.md)。
- 手绘光束的颜色选择也换成波长驱动（老工程保持原色，直到重新选波长）。
- 新增 27 项光学引擎回归测试（`npm run test:optics`），`npm run test:ui` 现在总计 78 项。
- 示例布局的器件朝向修正为物理自洽（M1 / BS / PD1 / 光纤支路）。

**v1.3.1**
- 修：**插入的文本无法调节大小**。文本选中后只有旋转手柄、没有四角缩放手柄；而且角手柄的拖拽逻辑
  写的是 `w`/`h`，但文本的尺寸只由 `size`（字号，mm）决定，所以即使有手柄也不会变。
  现在文本选中后有四角手柄，拖动按对角锚定等比缩放字号（实测 10 mm → 29.8 mm，对角保持不动）；
  Inspector 的 `Size` 输入框本来就能用，未改动。

**v1.3.0**
- 首个原生 App 外壳（Swift + WKWebView），940 KB / 744 KB dmg，冷启动约 0.22 秒。
- 原生保存/打开面板、原生剪贴板、文件式自动存档（不再依赖 WebKit 的延迟落盘）。
