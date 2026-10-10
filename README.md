# pixivpp

开源 Pixiv 小说阅读器：在线获取作品，本地自由筛选、排序，按需读取正文。

解决两个问题：对已获取作品按收藏数、浏览数或日期自行排序；用可调排版减少小说阅读中的操作。排序只覆盖已获取的候选作品，不等于全站人气排名。图片与合集后续开发。

## 当前功能

- Pixiv 登录窗口、自动刷新登录、系统安全存储；支持已有 Refresh Token 登录。
- 真实小说搜索、分页去重、正文读取；标签与标题/简介关键词排除，收藏/浏览/字数区间，升降序排序。
- 设置页保存阅读偏好与默认搜索条件：主题、字体、字号、行距、段距、宽度、自定义颜色和高级 CSS。
- 虚构演示数据可在设置中选用；默认使用 Pixiv 在线作品。

已验证 macOS Apple Silicon 打包运行。真实账号的完整登录、搜索和正文流程仍需账号实测；其他平台尚未验收，Android 安全存储尚未接入。系列导航、阅读进度、插图、自动补页和缓存待开发。

## 开发

Node.js 24 LTS，以及 [Rust 与 Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
npm ci
npm run tauri dev  # 独立桌面应用
npm run check      # 前端类型、测试、构建
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build
```

技术栈：Tauri 2 / Rust / React / TypeScript / Vite。`npm run dev` 仅预览界面，浏览器不提供账号与在线接口功能。

[开发范围](docs/scope.md) · [接口与登录说明](docs/pixiv-api.md)

MIT License。非 Pixiv 官方项目，接口可能变更；许可证不适用于 Pixiv 作品内容。
