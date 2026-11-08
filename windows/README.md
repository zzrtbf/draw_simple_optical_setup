# windows/ — Windows 壳（预留位）

这个目录现在**还没有原生外壳源码**。Windows 版目前是能用的，走的是「免安装」那条路：

```
Optical Bench.bat
  └─ node scripts/serve.mjs --open      # 起本地静态服务器（127.0.0.1:5180）
       └─ Edge / Chrome --app=http://…  # 无地址栏的独立窗口，看起来像原生 App
```

也就是说，**Windows 现在缺的只是「原生壳」这一层**，编辑器本体（`../src/`）和 macOS 版
是同一份代码，功能完全对齐。

## 为什么先留空

和 macOS 当初的顺序一致：先让「服务器 + 浏览器窗口」这条路跑稳、把交互回归测完，
再决定用什么技术做壳。壳的选择会决定这个目录里放 `.cs` 还是 `.rs`，提前铺一个空结构没有意义。

现在这个目录的作用是**占位与约定**：让仓库结构明确表达「Windows 版是一等公民，
将来会有自己的壳」，而不是让 Windows 的支持散落在根目录的 `.bat` 和 `scripts/` 里。

## 将来填什么

按 [`docs/PLATFORMS.md`](../docs/PLATFORMS.md) 的结论，推荐 **WebView2 原生壳**（方案 A），
因为它和 `../macos/` 的 Swift + `WKWebView` 完全对称，产物体积也只有几百 KB：

```
windows/
  README.md            # 本文件
  src/                 # 外壳源码（C#/WPF 或 Rust，二选一）
  build-win-app.ps1    # 一条命令出 build/Optical Bench.exe（或安装包）
```

壳必须实现 `src/lib/native.ts` 里约定的五个 op：`saveFile` / `openFile` /
`readAutosave` / `writeAutosave` / `copyImage`。细节见
[`docs/PLATFORMS.md` 的「桥接口约定」](../docs/PLATFORMS.md#桥接口约定windows-壳必须实现这几条)。

在壳写好之前，`.bat` 这条路不要删——它是 Windows 用户现在唯一能用的入口。
