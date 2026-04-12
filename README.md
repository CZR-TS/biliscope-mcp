# BiliScope MCP

BiliScope MCP 是一个面向 B 站内容读取的 MCP 服务。默认使用 **Streamable HTTP** 远程部署方式，并通过 CookieCloud 自动同步 B 站登录 Cookie。

## 最终部署 JSON

大多数托管平台只需要你填 CookieCloud 的三个值：

```json
{
  "mcpServers": {
    "biliscope-mcp": {
      "command": "npx",
      "args": ["-y", "biliscope-mcp"],
      "env": {
        "COOKIECLOUD_ENDPOINT": "https://cookies.xm.mk",
        "COOKIECLOUD_UUID": "你的UUID",
        "COOKIECLOUD_PASSWORD": "你的密码"
      }
    }
  }
}
```

这三个字段分别对应 CookieCloud 插件里的：

- `COOKIECLOUD_ENDPOINT`：CookieCloud 服务器地址
- `COOKIECLOUD_UUID`：用户KEY / UUID
- `COOKIECLOUD_PASSWORD`：端对端加密密码

其他 HTTP 监听参数已经内置默认值，普通用户不需要手动配置：

- 默认传输模式：Streamable HTTP
- 默认监听地址：`0.0.0.0`
- 默认端口：`3000`
- 默认 MCP 端点：`/mcp`
- 兼容 SSE 端点：`/sse`
- SSE 消息端点：`/messages`

如果部署平台要求填写服务 URL，通常填：

```text
https://你的部署域名/mcp
```

## CookieCloud 该怎么设置

浏览器插件侧建议这样设置：

- 工作模式：上传到服务器
- 服务器地址：例如 `https://cookies.xm.mk`
- 同步域名关键词：`bilibili.com`
- 同步时间间隔：建议 10 分钟

同步域名关键词在 CookieCloud 插件里配置即可，部署 JSON 里不需要再写。

## 工具功能

- `search_videos`：搜索 B 站视频
- `resolve_video`：把关键词、BV、AV 或链接解析成标准视频对象
- `get_video_detail`：获取视频标题、简介、作者、统计、分 P 等详情
- `get_video_subtitles`：获取视频字幕，默认只返回一种语言
- `get_video_comments`：获取热门评论
- `get_video_danmaku`：获取弹幕
- `get_up_info`：获取 UP 主信息和最近投稿
- `get_hot_videos`：获取热门视频
- `get_bangumi_timeline`：获取番剧时间表
- `get_related_videos`：获取相关推荐

## 字幕语言选择

`get_video_subtitles` 不会一次性返回全部语言轨道，只会返回一种语言。

你可以传 `preferred_lang` 指定语言。不传时按下面优先级自动选择：

1. `zh-Hans`：人工简体中文字幕
2. `ai-zh`：AI 自动生成中文字幕
3. `zh-CN`：简体中文兼容标记
4. `zh-Hant`：繁体中文字幕
5. `en`：英文字幕

## 高级配置

一般不需要配置这些。如果平台有特殊要求，可以用环境变量覆盖：

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

需要本地 stdio 模式时才设置：

```json
{
  "BILISCOPE_TRANSPORT": "stdio"
}
```

## 本地开发

```bash
npm install
npm run build
npm run start:http
```

## 常见错误

### `COOKIECLOUD_DECRYPT_FAILED`

通常是 UUID 或端对端加密密码不正确。

### `BILIBILI_COOKIE_INVALID`

CookieCloud 返回的数据里没有完整的 B 站登录 Cookie，或浏览器里的 B 站登录态已经失效。

### 部署后访问不到

确认平台实际访问的是 `/mcp`，并且平台允许 HTTP 服务监听 `3000` 端口。如果平台指定了 `PORT` 环境变量，BiliScope 会自动读取它。
