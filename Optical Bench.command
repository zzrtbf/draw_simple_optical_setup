#!/bin/bash
# Optical Bench — macOS 启动脚本
# 双击运行（若提示无法打开：右键 → 打开，或 chmod +x "Optical Bench.command"）。
#
# 走的是「本地静态服务器 + Safari」的开发态用法，不打包 .app。
# 想要 Vite 热更新，在终端里用：
#     cd "<本目录>" && npm run dev
# 然后浏览 http://127.0.0.1:5180/

cd "$(dirname "$0")" || exit 1

# Finder 启动 .command 时 PATH 可能没有 Homebrew 目录，补上再找 node。
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js。"
  echo "先从 https://nodejs.org 安装 LTS 版（Apple Silicon 选 arm64），再双击本文件。"
  read -r -p "按回车退出…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "第一次运行，先安装依赖…"
  npm install --no-fund --no-audit || { read -r -p "npm install 失败，按回车退出…"; exit 1; }
fi

if [ ! -f dist/index.html ]; then
  echo "构建中…"
  npm run build || { read -r -p "构建失败，按回车退出…"; exit 1; }
fi

echo "启动中…（关闭这个终端窗口 = 退出软件）"
exec node scripts/serve.mjs --open
