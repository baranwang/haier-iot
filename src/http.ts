import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import type { AxiosInstance } from 'axios';
import axios from 'axios';
import { API_URL, APP_ID, APP_KEY, DEFAULT_CACHE_DIR, HttpError } from './constants';
import {
  GetDevDigitalModelResponseSchema,
  GetFamilyDevicesResponseSchema,
  GetFamilyListResponseSchema,
  LoginResponseSchema,
  TokenInfoSchema,
} from './schema';
import type { CommandParams, GetDevDigitalModelResponse, Options, TokenInfo } from './types';
import { generateCommandArgs, generateSequenceId, inspectToString, safeJsonParse } from './utils';

export type { DevDigitalModel, DeviceInfo } from './types';
export class HaierHttp {
  #axios!: AxiosInstance;

  #tokenInfo?: TokenInfo;
  #tokenRefreshPromise?: Promise<string>;

  constructor(private readonly options: Options) {
    this.#axios = axios.create({
      headers: {
        appId: APP_ID,
        appKey: APP_KEY,
        clientId: this.clientId,
        language: 'zh-CN',
        timezone: '+8',
      },
      timeout: 10000,
    });
    this.#axios.interceptors.request.use(async (config) => {
      try {
        if (config.url !== API_URL.LOGIN) {
          const accessToken = await this.getAccessToken();
          if (!accessToken) {
            throw new Error('获取 Token 失败');
          }
          config.headers.accessToken = accessToken;
        }
        const timestamp = Date.now();
        config.headers.timestamp = timestamp;
        config.headers.sequenceId = generateSequenceId(timestamp);

        const url = new URL(axios.getUri(config));
        const body = config.data ? JSON.stringify(config.data) : '';
        const signStr = `${url.pathname}${url.search}${body}${APP_ID}${APP_KEY}${timestamp}`;
        config.headers.sign = createHash('sha256').update(signStr).digest('hex');

        this.logger.debug('[Request]', url.toString(), config.data ? inspectToString(config.data) : '');
        return config;
      } catch (error) {
        this.logger.error('[Request Error]', error);
        return Promise.reject(error);
      }
    });
    this.#axios.interceptors.response.use(
      (res) => {
        if (res.data?.retCode !== '00000') {
          this.logger.error('[Response]', res.data.retCode, res.data.retInfo);
          throw new HttpError(res);
        }
        return res;
      },
      (err) => {
        this.logger.error('[Response error]', err);
        return Promise.reject(err);
      },
    );
  }

  get logger() {
    return this.options.logger || console;
  }

  get storageDir() {
    const storageDir = this.options.storageDir || DEFAULT_CACHE_DIR;
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    return storageDir;
  }

  get #tokenPath() {
    const tokenDir = path.resolve(this.storageDir, 'token');
    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true });
    }
    return path.resolve(tokenDir, `${this.options.username}.json`);
  }

  get clientId() {
    const cacheClientIdPath = path.resolve(this.storageDir, 'client-id');
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
    if (resp.config.headers.timestamp) {
      tokenInfo.expiresAt = Number.parseInt(resp.config.headers.timestamp) + tokenInfo.expiresIn * 1000;
    }
    return tokenInfo;
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
      this.logger.error('获取 Token 失败', error);
      throw error;
    } finally {
      this.#tokenRefreshPromise = undefined;
    }
  }

  async getFamilyList() {
    const resp = await this.#axios.post(API_URL.GET_FAMILY_LIST, {});
    const { success, data, error } = GetFamilyListResponseSchema.safeParse(resp.data);
    if (!success) {
      throw error;
    }
    return data?.data ?? [];
  }

  async getDevicesByFamilyId(familyId: string) {
    const resp = await this.#axios.get(API_URL.GET_DEVICES_BY_FAMILY_ID, { params: { familyId } });
    const { success, data, error } = GetFamilyDevicesResponseSchema.safeParse(resp.data);
    if (!success) {
      throw error;
    }
    return data?.data;
  }

  async getDevDigitalModel(deviceId: string) {
    const resp = await this.#axios.post<GetDevDigitalModelResponse>(API_URL.GET_DEV_DIGITAL_MODEL, {
      deviceInfoList: [{ deviceId }],
    });
    const { success, data, error } = GetDevDigitalModelResponseSchema.safeParse(resp.data);
    if (!success) {
      throw error;
    }
    return data.detailInfo[deviceId];
  }

  async sendCommands(deviceId: string, commands: CommandParams[]) {
    const { sn, commandList } = generateCommandArgs(deviceId, commands);
    await this.#axios.post(API_URL.BATCH_SEND_COMMAND.replace('{deviceId}', deviceId), {
      sn,
      cmdMsgList: commandList,
    });
  }

  async getWssUrl() {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return '';
    }
    const resp = await this.#axios.post<{
      agAddr: string;
      id: string;
      name: string;
    }>('https://uws.haier.net/gmsWS/wsag/assign', {});
    const url = new URL(resp.data.agAddr);
    url.protocol = 'wss:';
    url.pathname = '/userag';
    url.searchParams.set('token', accessToken);
    url.searchParams.set('agClientId', this.clientId);
    return url.toString();
  }
}
