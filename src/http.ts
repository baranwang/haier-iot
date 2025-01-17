import type { AxiosInstance } from 'axios';
import axios from 'axios';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { API_URL, APP_ID, APP_KEY, HttpError } from './constants';
import { GetFamilyListResponseSchema, LoginResponseSchema, TokenInfoSchema } from './schema';
import type { Options, TokenInfo } from './types';
import { generateSequenceId, inspectToString, safeJsonParse } from './utils';

export class HaierHttp {
  #axios!: AxiosInstance;

  #tokenInfo?: TokenInfo;
  #tokenRefreshPromise?: Promise<string>;

  constructor(private readonly options: Options) {
    this.#axios = axios.create({
      headers: {
        appId: APP_ID,
        appKey: APP_KEY,
        language: 'zh-CN',
        timezone: '+8',
      },
      timeout: 10000,
    });
    this.#axios.interceptors.request.use(async (config) => {
      try {
        if (config.url !== API_URL.LOGIN) {
          config.headers.accessToken = await this.getAccessToken();
        }
        const timestamp = Date.now();
        config.headers.timestamp = timestamp;
        config.headers.sequenceId = generateSequenceId(timestamp);

        const url = new URL(axios.getUri(config));
        const body = config.data ? JSON.stringify(config.data) : '';
        const signStr = `${url.pathname}${url.search}${body}${APP_ID}${APP_KEY}${timestamp}`;
        config.headers.sign = createHash('sha256').update(signStr).digest('hex');

        this.#logger.debug('[Request]', url.toString(), config.data ? inspectToString(config.data) : '');
        return config;
      } catch (error) {
        this.#logger.error('[Request Error]', error);
        return Promise.reject(error);
      }
    });
    this.#axios.interceptors.response.use(
      (res) => {
        if (res.data?.retCode !== '00000') {
          this.#logger.error('[Response]', res.data.retCode, res.data.retInfo);
          throw new HttpError(res);
        }
        return res;
      },
      (err) => {
        this.#logger.error('[Response error]', err);
        return Promise.reject(err);
      },
    );
  }

  get #logger() {
    return this.options.logger || console;
  }

  get #storageDir() {
    const storageDir = this.options.storageDir || path.resolve(path.dirname(__dirname), '.haier-iot');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    return storageDir;
  }

  get #tokenPath() {
    const tokenDir = path.resolve(this.#storageDir, 'token');
    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true });
    }
    return path.resolve(tokenDir, `${this.options.username}.json`);
  }

  get clientId() {
    const cacheClientIdPath = path.resolve(this.#storageDir, 'client-id');
    if (fs.existsSync(cacheClientIdPath)) {
      return fs.readFileSync(cacheClientIdPath, 'utf-8');
    }
    const clientId = randomUUID();
    fs.writeFileSync(cacheClientIdPath, clientId);
    this.#tokenInfo = undefined;
    return clientId;
  }

  get tokenInfo() {
    if (!this.#tokenInfo && fs.existsSync(this.#tokenPath)) {
      const { data } = TokenInfoSchema.safeParse(safeJsonParse<TokenInfo>(fs.readFileSync(this.#tokenPath, 'utf-8')));
      this.#tokenInfo = data;
    }
    if (this.#tokenInfo?.expiresAt && this.#tokenInfo.expiresAt > Date.now()) {
      return this.#tokenInfo;
    }
    return undefined;
  }
  set tokenInfo(tokenInfo: TokenInfo | undefined) {
    fs.writeFileSync(this.#tokenPath, JSON.stringify(tokenInfo));
    this.#tokenInfo = tokenInfo;
  }

  async login() {
    const { username, password } = this.options;
    if (!username || !password) {
      throw new Error('用户名或密码为空');
    }
    const resp = await this.#axios.post(API_URL.LOGIN, {
      username,
      password,
      phoneType: 'iPhone16,2',
    });
    const { data } = LoginResponseSchema.safeParse(resp.data);
    if (!data) {
      throw new Error('登录失败');
    }
    const { tokenInfo } = data.data;
    return {
      ...tokenInfo,
      expiresAt: Number.parseInt(resp.config.headers.timestamp) + tokenInfo.expiresIn * 1000,
    };
  }

  async #refreshToken(): Promise<string> {
    const tokenInfo = await this.login();
    if (!tokenInfo) {
      return '';
    }
    this.tokenInfo = tokenInfo;
    return tokenInfo.uhomeAccessToken;
  }

  async getAccessToken(): Promise<string> {
    if (this.#tokenRefreshPromise) {
      return this.#tokenRefreshPromise;
    }

    if (this.tokenInfo?.uhomeAccessToken) {
      return this.tokenInfo.uhomeAccessToken;
    }
    try {
      this.#tokenRefreshPromise = this.#refreshToken();
      const token = await this.#tokenRefreshPromise;
      return token;
    } catch (error) {
      this.#logger.error('获取 Token 失败', error);
      return '';
    } finally {
      this.#tokenRefreshPromise = undefined;
    }
  }

  async getFamilyList() {
    const resp = await this.#axios.post(API_URL.GET_FAMILY_LIST, {});
    const { data } = GetFamilyListResponseSchema.safeParse(resp.data);
    return data?.data ?? []
  }
}
