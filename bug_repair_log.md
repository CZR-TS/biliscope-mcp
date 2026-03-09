# Bilibili MCP 字幕获取问题修复记录

- **记录时间**：2026-03-09 20:26:32
- **关联文件**：`src/bilibili/subtitle.ts`
- **问题反馈者**：USER
- **修复者**：Antigravity Agent

---

## 问题描述 (Bug Description)

在批量处理“独夫之心观天下”等频道的“充电专属”或“付费/合集”视频时，即使开启了 AI 字幕，MCP Server 也无法获取字幕内容。系统由于缺少关键素材，导致生成的日报质量大幅下降。

### 根本原因分析 (Root Cause)

1. **凭证失效 (Expired Cookie)**：
   用户的 `BILIBILI_SESSDATA` 等 Cookie 已过期。由于 B 站对于充电视频的外部接口调用（WBI 签名接口等）有严格的权限校验，未登录状态下返回的数据中不包含具体的字幕下载地址。

2. **逻辑误判 (Logical Short-circuit)**：
   在 `src/bilibili/subtitle.ts` 的 `getVideoInfoWithSubtitle` 函数中，代码存在以下逻辑：
   ```typescript
   if (videoData.need_login_subtitle || videoData.preview_toast?.includes("付费")) {
       // 直接返回简介，不尝试获取字幕
       return result;
   }
   ```
   代码假设如果 B 站标记了该视频“需要登录查看字幕”，则即便后续流程去获取也拿不到。但实际测试发现，只要用户提供了**有效的 Cookie**，即便 B 站在接口返回中标记了 `need_login_subtitle: true`，由于用户已经登录，B 站依然会在 `subtitle` 字段中下发数据。旧的代码逻辑由于这层“拦截”导致了无意义的降级。

---

## 解决方法 (Resolution)

### 步骤 1：手动更新凭证
用户更新了 `.env` 文件中的 `BILIBILI_SESSDATA`, `BILIBILI_BILI_JCT`, `BILIBILI_DEDEUSERID` 三个核心字段。

### 步骤 2：优化代码逻辑 (Hotfix)
修改 `subtitle.ts`，放宽对 `need_login_subtitle` 的拦截。不再根据该标志位直接返回 desc，而是允许程序继续向下尝试执行 `getVideoSubtitle(bvid, cid)`。只有在接口明确未返回任何可用字幕时，才最终降级。

**修改点摘要：**
- 修改文件：`c:\Users\ZX\bilibili-mcp\src\bilibili\subtitle.ts`
- 操作：将对 `need_login_subtitle` 的判断改为 `console.warn` 提示，不再中断流程。

### 步骤 3：编译重启
运行 `npm run build` 重新编译项目。

---

## 验证结果 (Verification)
修复后，对于标记为“充电”的视频，MCP Server 能够成功拉取并合并 `ai-zh` (AI 中文字幕) 文本，日报生成 Skill 回归正常，分析深度符合要求。
