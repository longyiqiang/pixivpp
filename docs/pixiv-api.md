# Pixiv 接口与登录

参考 [PixivPy](https://github.com/upbit/pixivpy)（MIT）中公开的 API 路径、参数和响应格式，以及 [ZipFile 的 PKCE 授权示例](https://gist.github.com/ZipFile/c9ebedb224406f4f11845ab700124362)。本项目以 Rust 实现适配层，不运行或嵌入第三方 Python 客户端。Pixiv 未承诺这些接口稳定，后续可能需要调整。

## 登录

1. Rust 生成随机 verifier 和 SHA-256 challenge，打开 Pixiv 官方 HTTPS 登录页面。
2. 用户在 Pixiv 页面输入账号信息。应用只拦截指定回调地址中的一次性授权码。
3. Rust 向 OAuth token endpoint 提交授权码与 verifier，获取 access/refresh token。
4. access token 保存在内存；refresh token 保存在系统钥匙串/凭据存储。启动时恢复并刷新，过期后自动刷新；注销删除本地凭据。

高级令牌输入供已有第三方客户端 refresh token 的用户使用；密码输入框不显示令牌，成功后清空。不要通过 Issue、截图或日志分享令牌。

公开的兼容客户端参数来自 PixivPy，不是用户密钥。账号密码不经过应用 Rust 命令。远端登录窗口没有应用数据访问权限，原生命令另外校验窗口身份，仅允许主窗口调用。

## 小说

| 用途         | 请求                                             |
| ------------ | ------------------------------------------------ |
| 登录入口     | `https://app-api.pixiv.net/web/v1/login`         |
| 授权码与刷新 | `POST https://oauth.secure.pixiv.net/auth/token` |
| 搜索         | `GET https://app-api.pixiv.net/v1/search/novel`  |
| 正文         | `GET https://app-api.pixiv.net/webview/v2/novel` |

搜索按 Pixiv `next_url` 翻页；分页地址只接受 HTTPS、Pixiv App API 域名和小说搜索路径，请求不跟随重定向。正文从 webview 响应中的 `novel` JSON 对象读取，保留原始文本后转为安全阅读文档，不执行页面脚本。标题、简介、正文均按文本处理。

请求设置连接与总超时，分别提示登录过期、访问拒绝、作品不存在、限流和网络错误；不把令牌或原始响应写入日志。HTTP 401 暂提示重新登录，自动刷新依据令牌有效期进行。

当前验证包含编译、数据适配测试、原生设置与演示阅读验证，以及登录页面/API 域名连通性。没有可用测试账号时，不将真实账号的完整流程标记为通过。
