# Changelog

All notable changes to the **Bilibili MCP Server** will be documented in this file.

---

## [1.3.7] - 2026-03-09

### 🚀 Added
- **Intelligent Cookie Expiration Detection**: When the subtitle interface returns an empty list, the tool now calls `/x/web-interface/nav` to verify the current login status before deciding whether to trigger a `COOKIE_EXPIRED` error.
  - If **Logged In** but no subtitles → Gracefully falls back to the description (normal behavior).
  - If **Not Logged In** (Cookie expired) → Throws a clear error to prevent "silent degradation," making it easier for users and AI to troubleshoot.
- *Security Note*: Error messages only contain status descriptions and are **strictly de-identified, never leaking actual Cookie content**.

---

## [1.3.5] - 2026-03-08
- Initial stable release with support for basic video info and comment fetching.
