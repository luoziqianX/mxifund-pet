# mxifund-pet 🖥️✨

> mxifund 模型一组研究员的一天 —— 3D 二次元桌面宠物

一个常驻桌面底部的透明桌宠：VRM 三渲二少女研究员，每天在「4 显示器 + 工学椅」的赛博工位上疯狂开卷，
早起查询「是否干翻凯读（Kendall Square Capital）」，99% 的日子只能继续卷，1% 的奇迹日直接永久开摆。

## 流程图（核心状态机）

```
开始 → 起 → 干凯读 → 是否干翻凯读？
         ↑              ├─ Y → 结束（永久开摆 🏖）
         │              └─ N → 必须躺了？
         │                      ├─ N → 干凯读（继续卷）
         └────── 躺（睡舱回体力）← Y
```

- 「必须躺了」由体力系统驱动：每轮开卷消耗 26~42 体力，低于 30 必须回睡舱躺。
- 干翻概率每次查询 1%（`src/js/config.js` 里 `winRate` 可改）。
- 天数、体力、凯读状态存在 localStorage，重启接着数。

## 下载安装（推荐）

去 [Releases](https://github.com/luoziqianX/mxifund-pet/releases) 下载：

- `mxifund-pet-Setup-x.x.x.exe` —— 一键安装版
- `mxifund-pet-x.x.x-win.zip` —— 免安装便携版，解压后运行 `mxifund-pet.exe`

## 从源码启动

```powershell
npm install
npm start
```

也可以双击 **启动桌宠.bat**（使用本地 node_modules 里的 Electron）。

## 打包 exe

```powershell
npm run dist   # 产物在 dist/：NSIS 安装包 + 便携 zip
```

## 玩法 / 交互

- 窗口全程鼠标穿透，不挡任何操作；只有鼠标悬到 **小人身上** 或 **顶部 HUD** 时才可交互。
- 点小人：冒爱心 + 吐槽台词。
- HUD 按钮：⏩ 快进当前阶段 ｜ 🛰 立刻查询战况 ｜ 🚀 开机启动开关 ｜ 📌 创建桌面快捷方式 ｜ 🫥 一键隐藏 ｜ ✕ 退出。
- **一键隐藏**：桌宠缩成一颗可拖动的小悬浮球（记住位置），点球或按 `Ctrl+Alt+H` 召回。
- **开机启动**：点 🚀 切换（亮起=已开启），写入当前用户注册表 Run 项，不需要管理员权限。
- **桌面快捷方式**：点 📌 一键在桌面生成「mxifund桌宠」图标。
- 干翻凯读后进入永久开摆模式，HUD 出现 🔄 轮回按钮（凯读复活，重新开卷）。

## 场景

睡舱-01 → MX CAFÉ 咖啡机 → 4 屏工位（K线/净值/代码/训练终端全部实时动画）→ 全息查询台 → 开摆区（躺椅+椰树+遮阳伞）。
白天/黑夜光照循环，睡觉冒 Zzz，庆祝撒彩带，屏幕在开摆日会切换成「涨停 +∞%」。

## 调参

- 节奏 / 概率 / 台词：`src/js/config.js`
- 姿势与落位微调：`src/js/app.js` 顶部 `TUNE`（支持 URL 参数覆盖）
- 调试摆拍：`src/index.html?tab=sit|sleep|lounge|query|walk|celebrate`，配合 `camx/camy/camd/camaz` 特写镜头
- 截图工具：`npx electron tools/capture.js "--tabs=sit,sleep"`（输出到 `shots/`）

## 换模型

把任意 VRM 0.x/1.0 模型放到 `assets/model.vrm` 即可（默认是 UniVRM 官方示例 Alicia Solid）。
若新模型朝向反了，改 `src/js/character.js` 的 `FACING_OFFSET`。

## 技术栈

Electron 33 + three.js + @pixiv/three-vrm，透明无边框置顶窗口，程序化骨骼动画（无外部动画文件）。
