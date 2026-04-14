# BiliScope MCP

BiliScope MCP 是一个面向 B 站内容读取的 MCP Server，重点解决三个问题：

- 在 ModelScope MCP 广场上用一段 JSON 快速部署。
- 通过 CookieCloud 自动读取 B 站登录 Cookie，不需要手动维护 `SESSDATA`。
- 提供稳定的 B 站读取型工具，例如搜索、视频详情、字幕、评论、弹幕、热门视频和相关推荐。

当前稳定版本：`biliscope-mcp@2.1.8`

## 当前状态

已经保留并测试通过的工具：

- `configure_cookiecloud`
- `search_videos`
- `resolve_video`
- `get_video_detail`
- `get_video_subtitles`
- `get_video_comments`
- `get_video_danmaku`
- `get_hot_videos`
- `get_related_videos`

已经移除的工具：

- `get_bangumi_timeline`：番剧时间表接口容易返回 `-400`，暂时移除。
- `get_up_info`：UP 主空间接口容易触发 B 站 `-352` / `412` 风控，暂时移除。

## 推荐部署方式：ModelScope STDIO 托管

ModelScope 的托管部署检测更适合使用 STDIO 配置。平台会通过 `npx` 启动 npm 包，调用 `initialize` 和 `tools/list`，检测通过后再给你一个远程 Streamable HTTP/SSE 地址。

请在 ModelScope MCP 服务配置里使用：

```json
{
  "mcpServers": {
    "biliscope-mcp": {
      "command": "npx",
      "args": ["-y", "biliscope-mcp@2.1.8", "stdio"],
      "env": {
        "CC_URL": "https://cookies.xm.mk",
        "CC_ID": "你的UUID",
        "CC_PASSWORD": "你的端对端加密密码"
      }
    }
  }
}
```

说明：

- `command` 必须是 `npx`。
- `args` 建议写死 `biliscope-mcp@2.1.8`，避免 ModelScope 缓存旧版本。
- `stdio` 是给 ModelScope 托管检测用的，不是本地 HTTP 地址。
- `env` 是首选配置方式，如果平台正确注入环境变量，字幕和评论工具可以直接使用 CookieCloud。
- `CC_URL`、`CC_ID`、`CC_PASSWORD` 是参考 WeRead MCP 的短变量名；本项目也兼容旧变量名 `COOKIECLOUD_ENDPOINT`、`COOKIECLOUD_UUID`、`COOKIECLOUD_PASSWORD`。

## ModelScope 已部署后的客户端配置

部署成功后，ModelScope 会给你一个类似这样的地址：

```json
{
  "mcpServers": {
    "biliscope-mcp": {
      "type": "streamable_http",
      "url": "https://mcp.api-inference.modelscope.net/你的实例ID/mcp"
    }
  }
}
```

这段 JSON 是给本地 MCP 客户端使用的，例如 Cherry Studio、Cursor、其他支持 Streamable HTTP 的客户端。

注意：这段 `streamable_http` 配置只包含远程地址，不会携带 CookieCloud 环境变量。CookieCloud 必须在 ModelScope 托管实例里配置好，或者通过 `configure_cookiecloud` 工具配置。

## 如果 ModelScope 不注入 env：使用 configure_cookiecloud

有些部署平台会出现这种情况：

```json
{
  "error": true,
  "code": "COOKIECLOUD_CONFIG_INVALID",
  "message": "CookieCloud 配置缺失：COOKIECLOUD_ENDPOINT 或 CC_URL, COOKIECLOUD_UUID 或 CC_ID, COOKIECLOUD_PASSWORD 或 CC_PASSWORD。"
}
```

这说明 MCP 服务已经启动，但运行实例没有收到环境变量。

从 `2.1.7` 开始，可以不重启实例，直接调用工具 `configure_cookiecloud` 来配置 CookieCloud。

调用参数示例：

```json
{
  "endpoint": "https://cookies.xm.mk",
  "uuid": "你的UUID",
  "password": "你的端对端加密密码"
}
```

成功时返回：

```json
{
  "ok": true,
  "cookie_source": "cookiecloud",
  "endpoint": "https://cookies.xm.mk",
  "uuid_tail": "******",
  "message": "CookieCloud 配置成功，已完成拉取和解密验证。"
}
```

这个工具的行为：

- 不需要重启 MCP 实例。
- 配置只保存在当前实例内存中。
- 不写入仓库，不写入文件，不保存 Cookie 明文。
- 实例重启、重建、扩缩容后可能需要重新调用一次。
- 如果你在 CookieCloud 插件里重新生成密码，也需要重新调用一次。

推荐使用顺序：

1. 先部署 MCP。
2. 调用 `configure_cookiecloud`。
3. 再调用 `get_video_subtitles` 或 `get_video_comments`。

## CookieCloud 插件设置

CookieCloud 插件里建议这样设置：

- 工作模式：上传到服务器。
- 服务器地址：例如 `https://cookies.xm.mk`。
- 用户 KEY / UUID：填入部署 JSON 的 `CC_ID` 或 `COOKIECLOUD_UUID`。
- 端对端加密密码：填入部署 JSON 的 `CC_PASSWORD` 或 `COOKIECLOUD_PASSWORD`。
- 同步域名关键词：建议填 `bilibili.com`。
- 是否同步 Local Storage：可以开启，但 BiliScope MCP 当前只读取 Cookie。
- 同步间隔：建议 10 分钟。

不建议在部署 JSON 里额外写 Cookie 域名列表。CookieCloud 插件本身已经能控制同步哪些网站的 Cookie，项目内部也默认只筛选 B 站相关 Cookie。

## 工具清单

### configure_cookiecloud

用途：在部署平台没有正确注入环境变量时，给当前实例配置 CookieCloud。

是否需要 CookieCloud：不需要。它本身就是配置 CookieCloud 的入口。

输入：

```json
{
  "endpoint": "https://cookies.xm.mk",
  "uuid": "你的UUID",
  "password": "你的端对端加密密码"
}
```

返回：

- `ok`：是否配置成功。
- `cookie_source`：固定为 `cookiecloud`。
- `endpoint`：当前使用的 CookieCloud 服务地址。
- `uuid_tail`：UUID 尾部几位，用于确认配置对象，不暴露完整 UUID。
- `message`：配置结果说明。

### search_videos

用途：按关键词搜索 B 站视频。

是否需要 CookieCloud：不需要。

输入：

```json
{
  "keyword": "土元神",
  "page": 1,
  "page_size": 10
}
```

字段说明：

- `keyword`：必填，搜索关键词。
- `page`：可选，页码，默认 `1`。
- `page_size`：可选，每页数量，默认 `10`，最大 `20`。

返回：

- `keyword`
- `page`
- `page_size`
- `total`
- `items`
- `items[].title`
- `items[].bvid`
- `items[].url`
- `items[].author`
- `items[].play_count`
- `items[].duration`
- `items[].publish_time`
- `items[].description`

### resolve_video

用途：把关键词、BV 号、AV 号或视频链接解析成标准视频对象。

是否需要 CookieCloud：不需要。

输入：

```json
{
  "input": "BV1YFQPB8Ee2"
}
```

也可以传：

```json
{
  "input": "https://www.bilibili.com/video/BV1YFQPB8Ee2"
}
```

返回：

- `title`
- `bvid`
- `aid`
- `url`
- `author`
- `duration`
- `publish_time`
- `description`

### get_video_detail

用途：获取视频详情。

是否需要 CookieCloud：不需要。

输入：

```json
{
  "input": "BV1YFQPB8Ee2"
}
```

返回：

- `title`
- `bvid`
- `aid`
- `cid`
- `url`
- `description`
- `cover`
- `author`
- `duration_seconds`
- `duration_text`
- `publish_time`
- `statistics`
- `tags`
- `pages`
- `login_required`

适合用于先了解视频基础信息，再决定是否拉字幕、评论或弹幕。

### get_video_subtitles

用途：获取视频字幕。

是否需要 CookieCloud：需要。

输入：

```json
{
  "input": "BV1hm4y1g7tC",
  "preferred_lang": "zh-Hans"
}
```

字段说明：

- `input`：必填，支持 BV、AV、视频链接或关键词。
- `preferred_lang`：可选，指定字幕语言。

字幕不会一次性返回全部语言，只返回一种语言，避免内容过长。

语言选择优先级：

1. `zh-Hans`：人工简体中文字幕，质量通常最高。
2. `ai-zh`：B 站 AI 自动生成中文字幕，覆盖率较高，但可能有识别错误。
3. `zh-CN`：简体中文兼容标记，用于兼容不同接口返回。
4. `zh-Hant`：繁体中文字幕。
5. `en`：英文字幕。

返回：

- `data_source`
- `video_info.title`
- `video_info.bvid`
- `video_info.subtitle_language`
- `video_info.subtitle_language_label`
- `video_info.subtitle_text`
- `video_info.subtitle_segments`
- `video_info.statistics`
- `video_info.pages`

如果视频没有字幕，工具会尽量返回视频简介作为 fallback。但如果 B 站明确要求登录态或 Cookie 失效，会返回标准错误。

### get_video_comments

用途：获取视频评论预览。

是否需要 CookieCloud：需要。

输入：

```json
{
  "input": "BV1YFQPB8Ee2",
  "detail_level": "brief"
}
```

字段说明：

- `input`：必填，BV 号或视频链接。
- `detail_level`：可选，`brief` 或 `detailed`。

返回：

- `comments`
- `comments[].author`
- `comments[].content`
- `comments[].likes`
- `comments[].has_timestamp`
- `comments[].timestamp`
- `summary.total_comments`
- `summary.comments_with_timestamp`

说明：

- `brief` 默认最多取较短评论结果。
- `detailed` 会包含更多评论和部分高赞回复。
- 评论接口容易受 B 站风控影响，所以它走 CookieCloud。

### get_video_danmaku

用途：获取视频弹幕。

是否需要 CookieCloud：不需要。

输入：

```json
{
  "input": "BV1YFQPB8Ee2",
  "limit": 100
}
```

字段说明：

- `input`：必填，支持 BV、链接或关键词。
- `limit`：可选，默认 `100`，最大 `200`。

返回：

- `bvid`
- `cid`
- `total`
- `returned`
- `truncated`
- `items`
- `items[].time_seconds`
- `items[].time_text`
- `items[].content`

### get_hot_videos

用途：获取当前热门视频。

是否需要 CookieCloud：不需要。

输入：

```json
{
  "limit": 10
}
```

字段说明：

- `limit`：可选，默认 `10`，最大 `20`。

返回：

- `total`
- `items[].title`
- `items[].bvid`
- `items[].url`
- `items[].author`
- `items[].play_count`
- `items[].duration`
- `items[].publish_time`
- `items[].description`

### get_related_videos

用途：获取某个视频的相关推荐。

是否需要 CookieCloud：不需要。

输入：

```json
{
  "input": "BV1YFQPB8Ee2"
}
```

返回：

- `bvid`
- `total`
- `items`
- `items[].title`
- `items[].bvid`
- `items[].url`
- `items[].author`
- `items[].play_count`
- `items[].duration`

## 哪些工具需要登录

不需要 CookieCloud 的工具：

- `search_videos`
- `resolve_video`
- `get_video_detail`
- `get_video_danmaku`
- `get_hot_videos`
- `get_related_videos`

需要 CookieCloud 的工具：

- `get_video_subtitles`
- `get_video_comments`

配置工具：

- `configure_cookiecloud`

## CookieCloud 变量命名兼容

本项目参考了 `freestylefly/mcp-server-weread` 的 CookieCloud 配置风格，支持更短的变量名：

```json
{
  "env": {
    "CC_URL": "https://cookies.xm.mk",
    "CC_ID": "你的UUID",
    "CC_PASSWORD": "你的端对端加密密码"
  }
}
```

同时保留原来的长变量名：

```json
{
  "env": {
    "COOKIECLOUD_ENDPOINT": "https://cookies.xm.mk",
    "COOKIECLOUD_UUID": "你的UUID",
    "COOKIECLOUD_PASSWORD": "你的端对端加密密码"
  }
}
```

优先级：

1. 如果同时存在长变量名和短变量名，优先使用长变量名。
2. 如果只配置短变量名，服务会正常读取 `CC_URL`、`CC_ID`、`CC_PASSWORD`。
3. `configure_cookiecloud` 工具不受变量名影响，它直接使用工具参数写入当前实例内存。

## 自托管 Streamable HTTP

如果你不是用 ModelScope 托管，而是自己有公网服务器，可以直接启动 HTTP 服务：

```bash
npx -y biliscope-mcp@2.1.8 http
```

默认监听：

- Host：`0.0.0.0`
- Port：`3000`
- Streamable HTTP：`/mcp`
- SSE：`/sse`
- SSE messages：`/messages`

如果平台提供 `PORT` 环境变量，服务会自动使用它。

自托管成功后，客户端配置：

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

## 环境变量

核心环境变量：

```text
CC_URL
CC_ID
CC_PASSWORD
```

兼容的长变量名：

```text
COOKIECLOUD_ENDPOINT
COOKIECLOUD_UUID
COOKIECLOUD_PASSWORD
```

两组变量含义相同。推荐优先使用短变量名，和 `mcp-server-weread` 的 CookieCloud 配置风格一致：

- `CC_URL` 等价于 `COOKIECLOUD_ENDPOINT`
- `CC_ID` 等价于 `COOKIECLOUD_UUID`
- `CC_PASSWORD` 等价于 `COOKIECLOUD_PASSWORD`

可选环境变量：

```text
COOKIE_REFRESH_INTERVAL_MINUTES=10
BILISCOPE_TRANSPORT=http
BILISCOPE_HTTP_HOST=0.0.0.0
BILISCOPE_HTTP_PORT=3000
BILISCOPE_HTTP_MCP_PATH=/mcp
BILISCOPE_HTTP_SSE_PATH=/sse
BILISCOPE_HTTP_MESSAGES_PATH=/messages
BILIBILI_REQUEST_TIMEOUT_MS=10000
BILIBILI_RATE_LIMIT_MS=500
BILIBILI_CACHE_SIZE=100
USER_AGENT=自定义 UA
```

普通 ModelScope 部署通常不需要配置可选环境变量。

## 常见错误

### COOKIECLOUD_CONFIG_INVALID

含义：运行实例没有拿到 CookieCloud 配置。

常见原因：

- ModelScope 没有把 `env` 注入到托管实例。
- 环境变量名写错。
- 只复制了客户端 `streamable_http` JSON，没有在服务端实例里配置 CookieCloud。

解决：

- 先调用 `configure_cookiecloud`。
- 或者在 ModelScope 部署实例环境变量里补齐 `COOKIECLOUD_ENDPOINT`、`COOKIECLOUD_UUID`、`COOKIECLOUD_PASSWORD`。

### COOKIECLOUD_DECRYPT_FAILED

含义：CookieCloud 拉取到了数据，但解密失败。

常见原因：

- UUID 写错。
- 端对端加密密码写错。
- 重新生成了 CookieCloud 密码，但 MCP 里仍是旧密码。

解决：

- 回到 CookieCloud 插件，复制最新的“用户 KEY / UUID”和“端对端加密密码”。
- 重新调用 `configure_cookiecloud`。

### BILIBILI_COOKIE_INVALID

含义：CookieCloud 可用，但 B 站 Cookie 不完整或登录态失效。

常见原因：

- 浏览器里 B 站已经退出登录。
- CookieCloud 没有同步 `bilibili.com`。
- CookieCloud 同步的是旧 Cookie。

解决：

- 浏览器重新登录 B 站。
- CookieCloud 插件里确认同步域名关键词包含 `bilibili.com`。
- 手动同步一次 CookieCloud。
- 再调用 `configure_cookiecloud` 或等待自动刷新。

### API_ERROR

含义：B 站接口返回业务错误。

说明：

- B 站接口会受风控、频率、地区、登录态影响。
- 当前版本已经移除了稳定性较差的 `get_up_info` 和 `get_bangumi_timeline`。
- 如果公开工具偶发失败，稍后重试通常即可。

## 为什么工具失败后 AI 有时不继续说话

有些 MCP 客户端或 AI Agent 在看到工具返回 `isError: true` 时，会直接中断后续推理，不再给你解释。

BiliScope MCP 当前对可预期的外部 API 错误做了处理：尽量返回结构化 JSON，而不是让客户端硬中断。返回内容通常包含：

```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "错误说明",
  "retryable": false,
  "cookie_source": "cookiecloud",
  "suggestion": "处理建议"
}
```

这样 AI 客户端更容易继续解释错误原因和下一步做法。

## 本地开发

项目结构：

```text
.
├── .well-known/mcp/server-card.json  # MCP 服务卡片，供平台识别工具元信息
├── assets/                           # 项目图标
├── src/
│   ├── bilibili/                     # B 站接口封装、字幕、评论、弹幕逻辑
│   ├── types/                        # 类型补充
│   ├── utils/                        # CookieCloud、错误模型、缓存、重试、校验
│   ├── cli.ts                        # npx 命令入口，支持 stdio/http/check
│   ├── config.ts                     # 环境变量和默认配置
│   ├── http-server.ts                # Streamable HTTP/SSE 服务
│   ├── index.ts                      # 包入口
│   └── server.ts                     # MCP 工具注册和调用分发
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

仓库里不提交 `node_modules/` 和 `dist/`。发布 npm 前会通过 `prepublishOnly` 自动执行 `npm run clean && npm run build`，确保包里只有最新编译产物。

安装依赖：

```bash
npm install
```

构建：

```bash
npm run build
```

本地 STDIO：

```bash
npx -y . stdio
```

本地 HTTP：

```bash
npm run start:http
```

检查 CookieCloud：

```bash
set COOKIECLOUD_ENDPOINT=https://cookies.xm.mk
set COOKIECLOUD_UUID=你的UUID
set COOKIECLOUD_PASSWORD=你的密码
npm run check
```

PowerShell 示例：

```powershell
$env:COOKIECLOUD_ENDPOINT="https://cookies.xm.mk"
$env:COOKIECLOUD_UUID="你的UUID"
$env:COOKIECLOUD_PASSWORD="你的密码"
npm run check
```

## 安全说明

- 不要把 CookieCloud UUID 和密码提交到 GitHub。
- 不要把真实 Cookie 写入 README、`.env.example` 或 issue。
- `configure_cookiecloud` 只把配置放在当前进程内存里，不落盘。
- 如果你已经公开过 CookieCloud 密码，建议在 CookieCloud 插件里重新生成。
- B 站 Cookie 等同于登录态，请按账号凭据对待。

## 发布信息

npm 包：

```text
biliscope-mcp
```

推荐版本：

```text
2.1.8
```

推荐 ModelScope 启动命令：

```bash
npx -y biliscope-mcp@2.1.8 stdio
```
