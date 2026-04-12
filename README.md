# BiliScope MCP

BiliScope MCP 是一个面向 B 站内容读取的 MCP 服务，支持搜索、视频详情、UP 主信息、热门视频、字幕、弹幕、评论预览等工具。登录态只来自 CookieCloud 自动同步，不支持手动 Cookie 兜底；CookieCloud 拉取失败或 B 站登录态失效时会直接报错。

## ModelScope 托管部署 JSON

如果你要提交到 ModelScope MCP 广场，并希望平台帮你托管部署，使用下面这段 STDIO 配置。ModelScope 会通过 `npx` 启动包并检测 `list_tools`，托管成功后平台会再给你可远程调用的 Streamable HTTP/SSE 地址。

服务启动和 `list_tools` 不会预拉 CookieCloud，避免平台托管检测因为没有用户 Cookie 而失败。真正调用需要 B 站登录态的工具时，才会读取 CookieCloud；如果 CookieCloud 配置缺失、解密失败或 B 站登录态失效，工具会直接返回明确错误。

```json
{
  "mcpServers": {
    "biliscope-mcp": {
      "command": "npx",
      "args": ["-y", "biliscope-mcp@latest", "stdio"],
      "env": {
        "COOKIECLOUD_ENDPOINT": "https://cookies.xm.mk",
        "COOKIECLOUD_UUID": "你的UUID",
        "COOKIECLOUD_PASSWORD": "你的密码"
      }
    }
  }
}
```

这三个环境变量分别对应 CookieCloud 插件里的：

- `COOKIECLOUD_ENDPOINT`：CookieCloud 服务器地址
- `COOKIECLOUD_UUID`：用户 KEY / UUID
- `COOKIECLOUD_PASSWORD`：端对端加密密码

不需要在 JSON 里配置 Cookie 域名。CookieCloud 插件本身可以设置同步域名关键词，建议只同步 `bilibili.com`。

## 自托管 Streamable HTTP

如果你自己有公网服务器，可以直接启动 HTTP 服务：

```bash
npx -y biliscope-mcp@latest http
```

默认监听：

- 地址：`0.0.0.0`
- 端口：`3000`，如果平台提供 `PORT` 环境变量会自动使用
- Streamable HTTP 端点：`/mcp`
- SSE 兼容端点：`/sse`
- SSE 消息端点：`/messages`

公网服务已经部署好以后，客户端或平台可使用：

```json
{
  "mcpServers": {
    "biliscope-mcp": {
      "type": "streamable_http",
      "url": "https://你的域名/mcp"
    }
  }
}
```

## CookieCloud 设置

浏览器插件侧建议这样设置：

- 工作模式：上传到服务器
- 服务器地址：例如 `https://cookies.xm.mk`
- 同步域名关键词：`bilibili.com`
- 是否同步 Local Storage：可以开启，但本项目只读取 Cookie
- 同步时间间隔：建议 10 分钟

`UUID` 和 `端对端加密密码` 就是 CookieCloud 插件页面里显示的“用户 KEY / UUID”和“端对端加密密码”。

## 工具功能

- `search_videos`：搜索 B 站视频，返回标题、BV 号、链接、作者、播放量、时长、发布时间和简介。
- `resolve_video`：把关键词、BV、AV 或链接解析成标准视频对象。
- `get_video_detail`：获取视频标题、简介、作者、统计、分 P、标签等详情。
- `get_video_subtitles`：获取视频字幕，默认只返回一种语言，避免返回过长。
- `get_video_comments`：获取热门评论或前几页评论预览。
- `get_video_danmaku`：获取弹幕，默认限制条数。
- `get_hot_videos`：获取热门视频。
- `get_related_videos`：获取相关推荐。

## 字幕语言选择

`get_video_subtitles` 不会一次性返回全部语言轨道，只会返回一种语言。

可以传 `preferred_lang` 指定语言。不传时按下面优先级自动选择：

1. `zh-Hans`：人工简体中文字幕，质量通常最高。
2. `ai-zh`：B 站 AI 自动生成中文字幕，覆盖率较高但可能有识别错误。
3. `zh-CN`：简体中文兼容标记，用于兼容不同接口返回。
4. `zh-Hant`：繁体中文字幕。
5. `en`：英文字幕。

## 可选高级环境变量

普通部署不需要配置这些变量。只有在你自己部署服务或平台有特殊要求时才使用：

```json
{
  "BILISCOPE_TRANSPORT": "http",
  "BILISCOPE_HTTP_HOST": "0.0.0.0",
  "BILISCOPE_HTTP_PORT": "3000",
  "BILISCOPE_HTTP_MCP_PATH": "/mcp",
  "BILISCOPE_HTTP_SSE_PATH": "/sse",
  "BILISCOPE_HTTP_MESSAGES_PATH": "/messages",
  "COOKIE_REFRESH_INTERVAL_MINUTES": "10"
}
```

也可以用显式命令选择传输方式：

```bash
npx -y biliscope-mcp@latest stdio
npx -y biliscope-mcp@latest http
```

## 常见错误

### `COOKIECLOUD_DECRYPT_FAILED`

通常是 UUID 或端对端加密密码不正确。

### `BILIBILI_COOKIE_INVALID`

CookieCloud 返回的数据里没有完整的 B 站登录 Cookie，或浏览器里的 B 站登录态已经失效。

### ModelScope 检测失败

确认 README 或表单里第一段服务配置是 `command: "npx"`，并且 `args` 包含 `biliscope-mcp@latest` 和 `stdio`。ModelScope 的快速创建当前主要识别 STDIO 配置；Streamable HTTP/SSE 配置需要你已经提前准备好公网服务链接。

如果部署平台不展示日志，先确认 npm 版本不低于 `2.1.3`。`2.1.3` 起启动和 `list_tools` 不依赖 CookieCloud，更适合 ModelScope 的托管检测。

## 本地开发

```bash
npm install
npm run build
npm run start:http
```
