# haier-iot

## 1.2.2

### Patch Changes

- 5b5a98c: 增加 WebSocket 关闭事件处理，添加重连逻辑及错误日志

## 1.2.1

### Patch Changes

- 185bc80: 修复 getFamilyList 结果可能为空的情况

## 1.2.0

### Minor Changes

- 880dec3: 改进 DiskMap 类，增加内存缓存和防抖写入机制，优化数据加载和保存逻辑

### Patch Changes

- 38ee9ce: 增强 HaierHttp 类的 Token 获取逻辑，确保获取失败时抛出错误并更新请求头
- 471ebfc: 更新 DevDigitalModelPropertySchema 和 DevDigitalModelSchema，增强属性解析逻辑，添加可选和默认值处理

## 1.1.1

### Patch Changes

- 5690039: 修复 TokenInfo 的过期时间计算逻辑，确保 expiresAt 正确设置为当前时间戳加上过期时间

## 1.1.0

### Minor Changes

- 7300678: 优化 WebSocket 连接逻辑
