import fs from 'node:fs';
import path from 'node:path';
import { safeJsonParse } from './utils';

export class DiskMap<T> {
  readonly #memoryCache = new Map<string, T>();
  readonly #writeQueue = new Map<string, T>();
  #writeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cacheDir: string,
    private readonly debounceTime = 1000,
  ) {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    this.#loadFromDisk();
  }

  // 改进文件路径处理
  #getFilePath(key: string): string {
    const sanitizedKey = encodeURIComponent(key);
    return path.join(this.cacheDir, `${sanitizedKey}.json`);
  }

  // 从磁盘加载数据到内存
  #loadFromDisk() {
    const files = fs.readdirSync(this.cacheDir).filter((file) => path.extname(file) === '.json');
    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      try {
        const key = decodeURIComponent(path.basename(file, '.json'));
        const value = safeJsonParse<T>(fs.readFileSync(filePath, 'utf-8')) ?? undefined;
        if (value !== undefined) {
          this.#memoryCache.set(key, value);
        }
      } catch (error) {
        console.error(`Failed to load cache file: ${filePath}`, error);
      }
    }
  }

  // 批量保存到磁盘
  #flushWriteQueue() {
    for (const [key, value] of this.#writeQueue.entries()) {
      const filePath = this.#getFilePath(key);
      try {
        fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
      } catch (error) {
        console.error(`Failed to save cache for key: ${key}`, error);
      }
    }
    this.#writeQueue.clear();
    this.#writeTimer = null;
  }

  // 启动防抖写入
  #scheduleWrite(key: string, value: T) {
    this.#writeQueue.set(key, value);
    if (this.#writeTimer === null) {
      this.#writeTimer = setTimeout(() => this.#flushWriteQueue(), this.debounceTime);
    }
  }

  set(key: string, value: T) {
    this.#memoryCache.set(key, value);
    this.#scheduleWrite(key, value);
  }

  get(key: string): T | undefined {
    return this.#memoryCache.get(key);
  }

  has(key: string): boolean {
    return this.#memoryCache.has(key);
  }

  delete(key: string): boolean {
    const exists = this.#memoryCache.delete(key);
    if (exists) {
      this.#writeQueue.delete(key); // 从写入队列中移除
      this.#deleteFromDisk(key);
    }
    return exists;
  }

  #deleteFromDisk(key: string) {
    const filePath = this.#getFilePath(key);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete cache for key: ${key}`, error);
    }
  }

  clear() {
    this.#memoryCache.clear();
    this.#writeQueue.clear();
    if (this.#writeTimer) {
      clearTimeout(this.#writeTimer);
      this.#writeTimer = null;
    }
    fs.readdirSync(this.cacheDir).forEach((file) => {
      const filePath = path.join(this.cacheDir, file);
      try {
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Failed to delete cache file: ${filePath}`, error);
      }
    });
  }

  keys(): string[] {
    return Array.from(this.#memoryCache.keys());
  }

  values(): T[] {
    return Array.from(this.#memoryCache.values());
  }

  entries(): [string, T][] {
    return Array.from(this.#memoryCache.entries());
  }

  forEach(callbackfn: (value: T, key: string) => void) {
    this.#memoryCache.forEach(callbackfn);
  }

  get size(): number {
    return this.#memoryCache.size;
  }
}
