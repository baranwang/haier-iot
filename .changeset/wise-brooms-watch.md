---
"haier-iot": patch
---

修复 TokenInfo 的过期时间计算逻辑，确保 expiresAt 正确设置为当前时间戳加上过期时间
