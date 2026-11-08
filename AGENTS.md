# Optical Bench — 2D 光路排布设计器

搭光路前用来排布器件的桌面应用：真实 mm 刻度、25 mm 孔阵、器件冲突检测、自动高斯光束追迹、
矢量/高清导出。**一份前端（`src/`）+ 两个平台壳**：`macos/`（Swift + WKWebView，已实现）、
`windows/`（当前只有 `.bat` 路径，原生壳待做）。

## 命令

| 用途 | 命令 |
| --- | --- |
| 装依赖 | `npm install` |
| 开发（热更新） | `npm run dev` → http://127.0.0.1:5180 |
| 类型检查 / 构建 | `npm run typecheck` · `npm run build` |
| 回归测试 | 先起 `npm run dev`，另开终端 `npm run test:ui`（26+25+27 = 78 项） |
| 只跑光学引擎 | `npm run test:optics` |
| 换浏览器引擎 | 前缀 `PW_ENGINE=webkit`（Safari 同引擎，判断 Safari 退化的硬指标） |
| macOS 打包 | `npm run app:build` → `build/Optical Bench.app` + `.dmg`；`-- --skip-web` 只重编 Swift |
| 重洗器件库 | 改 `assets/parts/*.svg` 或库素材后 `npm run gen` |

## 硬约定（违反会让双平台仓库腐烂）

- **版本号只有 `package.json` 一处**。`macos/Info.plist` 用 `__VERSION__`/`__BUILD__` 占位，构建时替换。
- **平台判断只能写在 `src/lib/platform.ts` 和壳目录里**；组件里不写 `navigator.platform` 分支。
- **产物不进 git**：`dist/`、`build/`、`*.dmg`、`*.exe` 由脚本重建，二进制走 GitHub Releases。
- **`src/generated/library.ts` 是生成物，不要手改**。加器件 = 放 SVG 进 `assets/parts/` + `npm run gen`
  + 在 `src/model/catalog.ts` 加一行名字/分类。
- **中英 README 必须同步改**：`README.md` 与 `README.en.md` 一一对应。
- **原生能力只经 `src/lib/native.ts`**（`window.__ob` 五条 op），浏览器里全部退化成 no-op。

## 物理与坐标约定

- 世界坐标 **1 单位 = 1 mm**，y 轴向下（SVG 习惯）；孔阵间距 25 mm，孔坐标是 25 的整数倍。
- `z` = 光轴高度（桌面以上，默认 25.4 mm）；`rot` = 绕 z 轴角度；工程文件 schema `optical-setup/1`。
- 自动光路 = 2D 傍轴高斯光束：自由传播 $q \to q + d$，薄透镜 $1/q' = 1/q - 1/f$，平面镜只改方向不改 $q$，
  分束器两支继承同一 $q$。完整模型、器件朝向表与限制见 `docs/AUTO-BEAMS.md`。
- 器件朝向：激光/光纤耦合器沿本地 **+x** 出射；镜、透镜、探测器有效面是本地 **y**；BS 有效面是画出的对角线；
  镜架等支架对光**透明**（要挡光就放 Beam Dump）。

## 许可

代码 MIT；器件图形 CC BY-NC 3.0（Alexander Franzen, ComponentLibrary）——**`LICENSE` 管不到
`ComponentLibrary_files/` 与 `src/generated/library.ts` 里的图形**。

## 工作状态约定（本文件不记录易变内容）

- 易变状态在 `STATE.md`，尝试与决策的来龙去脉在 `LOG.md`；两者只留本地、不进 git。
- 新会话先读 `STATE.md`，从「下一步」接着做，不要从头复述背景。
- 阶段结束或关键决策改变时，更新 `STATE.md` 的「已定决策」「下一步」，可放弃的尝试记一行进 `LOG.md`。
