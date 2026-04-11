# BiliScope MCP

BiliScope MCP 是一个面向 MCP 客户端的 B 站读取型服务，支持：

- CookieCloud 自动拉取和刷新 B 站 Cookie
- 只用一段 `mcpServers` JSON 部署
- 搜索、视频详情、字幕、评论、弹幕、UP 主信息、热门视频、番剧时间表

## 部署

只支持 CookieCloud，不再支持手动 Cookie。

可直接粘贴到支持自定义 MCP JSON 的部署平台：

```json
{
  "mcpServers": {
    "biliscope-mcp": {
      "command": "npx",
      "args": ["-y", "biliscope-mcp"],
      "env": {
        "BILIBILI_COOKIE_SOURCE": "cookiecloud",
        "COOKIECLOUD_ENDPOINT": "https://cookies.xm.mk",
        "COOKIECLOUD_UUID": "你的UUID",
        "COOKIECLOUD_PASSWORD": "你的密码",
        "COOKIECLOUD_DOMAINS": "bilibili.com,.bilibili.com,www.bilibili.com",
        "COOKIE_REFRESH_INTERVAL_MINUTES": "10"
      }
    }
  }
}
```

## CookieCloud 配置

浏览器插件建议这样配置：

- 服务器地址：你的 CookieCloud 服务地址，例如 `https://cookies.xm.mk`
- 工作模式：上传到服务器
- 同步域名关键词：`bilibili.com`
- 同步时间间隔：建议 10 分钟

MCP 启动后会先向 CookieCloud 拉取并解密 Cookie，成功后才会启动。运行过程中遇到 `-101`、`401`、`412` 或明显的未登录错误时，会自动强制刷新一次 Cookie；若刷新后仍失败，工具会直接返回标准化鉴权错误。

## 字幕语言选择

`get_video_subtitles` 默认只返回一种语言字幕，不会一次性返回全部语言轨道。

- 传入 `preferred_lang`：优先返回你指定的语言
- 不传或留空：按内置优先级自动选择第一条可用字幕

当前优先级如下：

1. `zh-Hans`
   人工简体中文字幕，最适合大多数中文阅读场景
2. `ai-zh`
   AI 自动生成的中文字幕，很多视频只有这一轨
3. `zh-CN`
   简体中文的兼容语言标记
4. `zh-Hant`
   繁体中文字幕
5. `en`
   英文字幕

常见示例：

- `preferred_lang=zh-Hans`：优先简体中文字幕
- `preferred_lang=zh-Hant`：优先繁体中文字幕
- `preferred_lang=en`：优先英文字幕
- 留空：自动按上面的顺序挑一个

## 工具

- `search_videos`
- `resolve_video`
- `get_video_detail`
- `get_video_subtitles`
  默认只返回一种语言字幕，可通过 `preferred_lang` 指定；返回字幕全文、时间片段和所选语言
- `get_video_comments`
- `get_video_danmaku`
- `get_up_info`
- `get_hot_videos`
- `get_bangumi_timeline`
- `get_related_videos`

## 本地开发

```bash
npm install
npm run build
npm run check
```

本地调试时也只通过环境变量提供 CookieCloud 参数：

```bash
COOKIECLOUD_ENDPOINT=https://cookies.xm.mk
COOKIECLOUD_UUID=你的UUID
COOKIECLOUD_PASSWORD=你的密码
COOKIECLOUD_DOMAINS=bilibili.com,.bilibili.com,www.bilibili.com
COOKIE_REFRESH_INTERVAL_MINUTES=10
```

## 常见问题

### 1. 启动时报 `COOKIECLOUD_DECRYPT_FAILED`

通常是 `COOKIECLOUD_UUID` 或 `COOKIECLOUD_PASSWORD` 不正确。

### 2. 启动时报 `BILIBILI_COOKIE_INVALID`

CookieCloud 虽然返回了数据，但其中没有完整的 `SESSDATA`、`bili_jct`、`DedeUserID`，或者浏览器里的 B 站登录态已经失效。

### 3. 为什么不保留手动 Cookie 兜底

这个版本按部署平台约束设计，目标是纯 CookieCloud 自动同步。一旦 Cookie 失效就直接报错，避免部署端出现“旧 Cookie 悄悄继续工作但状态不一致”的问题。
