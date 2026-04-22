# BiliScope MCP

面向 B 站内容读取的 MCP Server，基于 CookieCloud 获取登录态，提供视频搜索、解析、详情、字幕、评论、弹幕、热门视频和相关推荐能力。

当前版本：`2.2.1`

## 特性

- 支持 `BV`、`AV`、视频链接、短链接和关键词作为视频输入
- 使用 CookieCloud 自动拉取并刷新 B 站 Cookie
- `configure_cookiecloud` 会写入项目根 `.env`，并立即完成拉取与解密验证
- `resolve_video`、`get_video_detail`、`get_video_subtitles`、`get_video_danmaku` 支持通过 `page` 指定分P
- 参数错误会返回字段级说明、合法范围和当前工具的期望参数结构

## 安装

```bash
npm install
npm run build
```

## 本地启动

默认启动 Streamable HTTP：

```bash
npm start
```

启动 stdio：

```bash
node dist/cli.js stdio
```

检查 CookieCloud 配置：

```bash
node dist/cli.js check
```

## 环境变量

优先读取项目根 `.env`：

```env
COOKIECLOUD_ENDPOINT=https://cookies.xm.mk
COOKIECLOUD_UUID=your-uuid
COOKIECLOUD_PASSWORD=your-password
```

兼容短变量名：

- `CC_URL`
- `CC_ID`
- `CC_PASSWORD`

可选配置：

- `COOKIECLOUD_DOMAINS`
- `COOKIE_REFRESH_INTERVAL_MINUTES`
- `BILIBILI_REQUEST_TIMEOUT_MS`
- `BILIBILI_RATE_LIMIT_MS`
- `BILISCOPE_TRANSPORT`
- `BILISCOPE_HTTP_HOST`
- `BILISCOPE_HTTP_PORT`

## 工具列表

### `configure_cookiecloud`

为当前服务实例配置 CookieCloud，并将配置写入项目根 `.env`。

输入：

```json
{
  "endpoint": "https://cookies.xm.mk",
  "uuid": "your-uuid",
  "password": "your-password"
}
```

成功返回：

```json
{
  "ok": true,
  "cookie_source": "cookiecloud",
  "endpoint": "https://cookies.xm.mk",
  "uuid_tail": "123456",
  "persisted": true,
  "env_path": "/path/to/.env",
  "message": "CookieCloud 配置成功，已写入项目根 .env，并完成拉取与解密验证。"
}
```

### `search_videos`

按关键词搜索视频。

输入：

```json
{
  "keyword": "Python 教程",
  "page": 1,
  "page_size": 10
}
```

### `resolve_video`

将关键词、BV、AV 或链接解析为标准视频对象，并支持指定分P。

输入：

```json
{
  "input": "BV1YFQPB8Ee2",
  "page": 2
}
```

返回中包含：

- `pages`
- `selected_page`
- `selected_cid`
- `selected_part`

### `get_video_detail`

获取视频详情，并标记当前分P。

输入：

```json
{
  "input": "BV1YFQPB8Ee2",
  "page": 2
}
```

### `get_video_subtitles`

获取指定视频分P的字幕。

输入：

```json
{
  "input": "BV1hm4y1g7tC",
  "preferred_lang": "zh-Hans",
  "page": 2
}
```

返回中包含：

- `video_info.subtitle_language`
- `video_info.subtitle_language_label`
- `video_info.subtitle_text`
- `video_info.subtitle_segments`
- `video_info.pages`
- `video_info.selected_page`
- `video_info.selected_cid`
- `video_info.selected_part`

### `get_video_comments`

获取视频评论。

输入：

```json
{
  "input": "BV1YFQPB8Ee2",
  "detail_level": "brief"
}
```

### `get_video_danmaku`

获取指定视频分P的弹幕。

输入：

```json
{
  "input": "BV1YFQPB8Ee2",
  "limit": 100,
  "page": 2
}
```

返回中包含：

- `selected_page`
- `selected_part`

### `get_hot_videos`

获取当前热门视频。

输入：

```json
{
  "limit": 10
}
```

### `get_related_videos`

获取某个视频的相关推荐。

输入：

```json
{
  "input": "BV1YFQPB8Ee2"
}
```

## 参数错误返回

参数错误时，返回结构会带字段级说明：

```json
{
  "error": true,
  "code": "VALIDATION_ERROR",
  "message": "page 超出当前视频的分P范围。",
  "retryable": false,
  "cookie_source": "cookiecloud",
  "suggestion": "请按字段说明修正参数后重试。",
  "tool": "get_video_subtitles",
  "field_errors": [
    {
      "field": "page",
      "message": "当前视频共有 4 个分P，可选 1, 2, 3, 4。",
      "received": 9,
      "expected": "1 到 4 的分P序号",
      "allowed_values": [1, 2, 3, 4]
    }
  ],
  "expected": {
    "input": "必填；BV/AV/视频链接/关键词",
    "preferred_lang": "可选；字幕语言，如 zh-Hans、zh-CN、en",
    "page": "可选；视频分P序号，默认 1"
  }
}
```

## 分P说明

- `page` 为 1-based 分P序号
- 未传时默认取第 `1` P
- 如果视频只有单P，传 `page=1` 与不传行为一致
- 如果 `page` 超出范围，会返回 `VALIDATION_ERROR`

## 开发

构建：

```bash
npm run build
```

发布前会自动执行：

```bash
npm run prepublishOnly
```
