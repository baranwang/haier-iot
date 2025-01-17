import fs from 'node:fs';
import path from 'node:path';
import { safeJsonParse } from './utils';

export class DiskMap<T> {
  constructor(
    private readonly cacheDir: string,
  ) {
    this.#initializeCacheDir();
  }

  // Ensure cache directory exists
  #initializeCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // Load a value from a file
  #loadFromFile(key: string): T | undefined {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        return safeJsonParse<T>(fs.readFileSync(filePath, 'utf-8')) || undefined;
      } catch (error) {
        console.error(`Failed to load cache for key: ${key}`, error);
        return undefined;
      }
    }
    return undefined;
  }

  // Save data to cache file
  #saveToFile(key: string, value: T) {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
    } catch (error) {
      console.error(`Failed to save cache for key: ${key}`, error);
    }
  }

  // Delete cache file
  #deleteFromFile(key: string) {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete cache for key: ${key}`, error);
    }
  }

  set(key: string, value: T) {
    this.#saveToFile(key, value);
  }

  get(key: string): T | undefined {
    return this.#loadFromFile(key);
  }

  has(key: string): boolean {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    return fs.existsSync(filePath);
  }

  delete(key: string): boolean {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    if (fs.existsSync(filePath)) {
      this.#deleteFromFile(key);
      return true;
    }
    return false;
  }

  clear() {
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
    return fs.readdirSync(this.cacheDir)
      .filter((file) => path.extname(file) === '.json')
      .map((file) => path.basename(file, '.json'));
  }

  values(): T[] {
    return this.keys().map((key) => this.get(key)).filter((value): value is T => value !== undefined);
  }

  entries(): [string, T][] {
    return this.keys()
      .map((key) => [key, this.get(key)] as [string, T])
      .filter(([, value]) => value !== undefined);
  }

  forEach(callbackfn: (value: T, key: string) => void) {
    for (const key of this.keys()) {
      const value = this.get(key);
      if (value !== undefined) {
        callbackfn(value, key);
      }
    }
  }

  get size(): number {
    return this.keys().length;
  }
}
