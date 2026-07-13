# 夜航模组馆 · Nocturne Archive

一个无需构建工具的原创 TRPG 模组收藏网站。当前以《Null Grail / 零之圣杯》v3.2 为首个世界档案，除公开作品档案外，还包含可直接开团的完整作者版守秘人控制台。

守秘人控制台提供：七日 27 个场景节点、东湖市互动地图、19 名核心人物与英灵档案、六项核心真相、23 张按进度投送的视觉手卡、玩家投屏、战役轨道、自动保存、撤销与 JSON 备份。所有正式插画均位于 `assets/art/`，已使用 WebP 优化。

## 本地预览

电脑已安装 Node.js 时，在本目录运行：

```powershell
npm run dev
```

正式开团或把服务分享给其他人前，请先设置自己的守秘人访问密钥：

```powershell
$env:NG_ACCESS_KEY="换成你的长密钥"
npm run dev
```

也可以把密钥单独写入不会提交的 `.keeper-key` 文件。本地服务不会再提供公开默认密钥；通过验证后会写入 HttpOnly 会话，并保护 `gm-data.js` 与含剧透的 DOCX。玩家页不含未发放手卡正文，只接收守秘人主动投送的单张玩家字段，并仅保存在当前标签页会话中。

随后打开：

- `http://127.0.0.1:4173`：公开档案馆
- `http://127.0.0.1:4173/gm.html`：守秘人控制台
- `http://127.0.0.1:4173/player.html?mode=projection`：玩家投屏

## 添加新模组

在 `app.js` 顶部的 `entries` 数组中复制任意一条档案数据并修改。建议每份模组至少填写：

- `id`：只用英文小写、数字与短横线，作为分享链接标识
- `title`、`summary`、`description`
- `systems`：可用 `fate`、`coc`、`dnd`、`agnostic`
- `type`：可用 `campaign`、`guide`、`toolkit`、`handout`
- 人数、时长、时代、难度、标签与内容预警
- `resources`：可下载附件的相对路径

## 发布给其他人访问

GitHub Pages 等纯静态托管使用 `secure/` 中的 AES-256-GCM 加密包：守秘数据与五份剧透文档都只以密文发布，浏览器在输入正确密钥后本地解密。口令仅保存在当前标签页的 `sessionStorage`，不会写进网页、清单或仓库。

重新生成加密包：

```powershell
$env:NG_ARCHIVE_KEY="你的长密钥"
node scripts/build-secure-assets.mjs
node scripts/verify-secure-assets.mjs
```

发布时必须使用正向白名单，只上传网站运行文件、`secure/` 密文和以下明确允许公开的附件：

- `index.html`
- `styles.css`
- `app.js`
- 第三册玩家手册
- 玩家公开资料包
- 统一规则与跨册索引

第一册主模组、第二册 NPC 与英灵手册、第四册主持人工具书、分阶段线索索引和整包玩家手卡都含有未发放信息。公开仓库只能包含它们对应的 `.enc` 文件，不能包含明文文档、`.keeper-key` 或 `gm-data.js`。

## 文件说明

- `index.html`：页面结构与站点文案
- `styles.css`：视觉系统、动效和响应式布局
- `app.js`：档案数据与全部交互
- `gm.html` / `gm.css` / `gm.js`：完整作者版守秘人控制台
- `gm-data.js`：七日场景、人物、地点、线索与手卡数据
- `player.html` / `player.css` / `player.js` / `player-data.js`：独立 PLAYER SAFE 实时投屏，只接收守秘人已投送的单卡，不预载手卡正文
- `access.js` / `gm-gate.js`：身份选择与守秘人密钥验证
- `secure/`：可公开托管的守秘数据与文档密文
- `scripts/build-secure-assets.mjs`：从本地私有源生成加密发布包
- `assets/art/`：东湖市地图、七日场景、人物肖像、英灵阵列与手卡插画
- `server.mjs`：零依赖本地预览服务

字体默认通过 Google Fonts 加载；无法连接时会自动回退到系统宋体和黑体，不影响使用。
