# 正式数据接入

当前实现使用用户指定的 staging 接口，保留原 Sites 所有者私人可见权限。DataSage 继续作为无真实用户内容的演示分享页。

## 结构与运行

- `public/`：原 H5 页面、视觉和音乐资源；原 `dist/` 源文件已迁移到这里。
- `public/bootstrap.js`：默认读取同源 `/api/annual-data`；失败展示重试，不会悄悄回退示例数据。显式 `?demo=1` 进入演示。
- `server/annual-data.js`：纯数据适配器，只返回显示需要的字段；按可展示候选、安全状态、缺失状态筛选。
- `server/annual-service.mjs`：固定上游和固定联调用户的只读代理；前端不能通过 query/header 切换其他用户。
- `build/sites-worker.ts`：沿用 Sites 官方服务端运行与身份接线；私人接口拒绝未登录访问。本机开发模式仅供回环地址预览。
- `public/live-ui.js`：真实角色头像、足迹、可用故事、图片与唯一年度来电的界面。

`npm test` 执行相机、音乐、适配和代理回归；`npm run build` 生成 Sites Worker 与静态资源。`npm run dev` 使用官方本机预览运行方式。服务端凭证通过 Sites Secret 配置 `ANNUAL_API_TOKEN`、`ANNUAL_USER_ID` 与 `ANNUAL_OWNER_EMAIL`，源码、浏览器存储和发布包不保存值。正式上线需要后端将当前固定测试用户改为受信的登录用户身份映射；这版不是多用户生产鉴权实现。

## 当前显示规则

使用 annual 的活跃天数与 Bot 数；共写字数优先采用 `co_written_chars`，同时呈现估算标记，不把估算值称为精确全文字符统计。底部说明 cutoff 为不含当日的截止日期。星图读取九个类别和可用的 unknown 星云，名字缺失时使用临时中文配置（`nameSource=frontend`），不会将临时名称冒充服务端返回。

只使用 `galaxy_bots` 中的候选角色；完整 bots 仅用于补充和安全过滤。隐藏、删除、未成年、内容封禁角色不通过其他字段重新加入。safe_mode 时保守展示安全资料与统计片段，不恢复被省略的故事、图片或来电。此处的细分内容可见策略需要后端补充明确契约。

有依据且状态可用的 AI 总结与历史原话分开展示。图片和语音没有可用内容时不显示相应入口，不使用演示媒体冒充历史。来电只属于接口指定的唯一角色；音频通过当前用户授权的同源代理读取，不能凭任意 audio_id 访问。

本轮未触发数据构建、AI 生成、隐藏角色、拆盒锁定或分享记录等写接口。统计卡是只读重逢体验，不把查看统计卡伪装成已完成服务端开盒。

## 个性化播报

后端未提供五幕按用户生成的宇航员音频。真实模式暂采用音乐与字幕航行，避免播放带有旧示例昵称、328天、86位伙伴的预制音频，也不将真实内容自动发给设备语音服务。演示模式保留已有电影女声。待后端补齐对应音频后，可按约定接线。

## 部署与文档

私人预览：https://stellar-echo-annual-2026.liuke111437.chatgpt.site

共享演示：https://datasage.flow.chat/r/u369/stellar-echo-annual-2026

后端清单：https://kaonai.feishu.cn/docx/P1XtdqTfxo23wjxTXGZcdgJHn90

DataSage 静态包通过 `node scripts/package-demo.mjs /absolute/output-directory` 从 `public/` 导出，把 runtime-config 设为 demo；不包含服务端代码、原始响应或凭证。真实查询不会跨域直连；生产网关注入用户身份与 CORS 方案仍需后端确定。
