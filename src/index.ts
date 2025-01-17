import { randomBytes } from 'node:crypto';
import EventEmitter from 'node:events';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { type MessageEvent, WebSocket } from 'ws';
import { MAX_RECONNECT_ATTEMPTS } from './constants';
import { DiskMap } from './disk-map';
import { HaierHttp } from './http';
import { DevDigitalModelSchema, GenMsgDownSchema, WebSocketMessageSchema } from './schema';
import type { CommandParams, DevDigitalModel, Options, WebSocketMessage } from './types';
import { generateCommandArgs, generateSequenceId, inspectToString, safeJsonParse } from './utils';

export type { DeviceInfo, DevDigitalModel, DevDigitalModelProperty, CommandParams } from './types';

interface HaierApiEvents {
  devDigitalModelUpdate: [deviceId: string, devDigitalModel: DevDigitalModel];
  afterConnect: [];
}

interface WebSocketState {
  isConnecting: boolean;
  subscribedDevices: string[];
  heartbeatInterval?: NodeJS.Timeout;
  reconnectAttempts: number;
}

export class HaierIoT extends EventEmitter<HaierApiEvents> {
  #httpAPI!: HaierHttp;

  #_ws!: WebSocket;

  #digitalModelCache!: DiskMap<DevDigitalModel>;

  #state: WebSocketState = {
    isConnecting: false,
    subscribedDevices: [],
    reconnectAttempts: 0,
  };

  constructor(private readonly options: Options) {
    super();
    this.#httpAPI = new HaierHttp(options);
    this.#digitalModelCache = new DiskMap<DevDigitalModel>(path.resolve(this.#httpAPI.storageDir, 'digital-model'));
  }

  get #ws() {
    return this.#_ws;
  }

  set #ws(ws: WebSocket) {
    this.#setupWebSocket(ws);
    this.#_ws = ws;
  }

  get #logger() {
    return this.#httpAPI.logger;
  }

  async login() {
    await this.#httpAPI.login();
  }

  async getFamilyList() {
    try {
      return this.#httpAPI.getFamilyList();
    } catch (error) {
      return [];
    }
  }

  async getDevicesByFamilyId(familyId: string) {
    try {
      return this.#httpAPI.getDevicesByFamilyId(familyId);
    } catch (error) {
      return [];
    }
  }

  async connect() {
    const url = await this.#httpAPI.getWssUrl();
    if (!url) {
      this.#logger.error('获取 WebSocket 地址失败');
      return;
    }

    this.#cleanupWebSocket();
    this.#ws = new WebSocket(url);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket 连接超时'));
      }, 10000);

      this.#ws.once('open', () => {
        clearTimeout(timeout);
        this.#logger.info('WebSocket 连接成功');
        this.emit('afterConnect');
        resolve();
      });

      this.#ws.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async sendMessage(topic: string, content: Record<string, unknown>) {
    const { success, data, error } = WebSocketMessageSchema.safeParse({ topic, content });
    if (!success) {
      this.#logger.error('WebSocket 消息格式错误:', error);
    }
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      this.#logger.error('WebSocket 连接未建立');
      return;
    }
    this.#ws.send(
      JSON.stringify({
        agClientId: this.#httpAPI.clientId,
        ...data,
      }),
      (err) => {
        if (err) {
          this.#logger.error('WebSocket 消息发送失败:', err);
        }
      },
    );
    this.#logger.debug('⬆️', `[${topic}]`, inspectToString(content));
  }

  subscribeDevices(deviceIds: string[]) {
    this.#state.subscribedDevices = deviceIds;
    this.sendMessage('BoundDevs', {
      devs: deviceIds,
    });
  }

  async getDevDigitalModel(deviceId: string) {
    if (this.#digitalModelCache.has(deviceId)) {
      return this.#digitalModelCache.getAsync(deviceId);
    }
    const devDigitalModel = await this.#httpAPI.getDevDigitalModel(deviceId);
    if (devDigitalModel) {
      this.#digitalModelCache.setAsync(deviceId, devDigitalModel);
    }
    return devDigitalModel;
  }

  sendCommands(deviceId: string, commands: CommandParams[]) {
    try {
      if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket 连接未建立');
      }
      const { sn, commandList } = generateCommandArgs(deviceId, commands);

      this.sendMessage('BatchCmdReq', {
        sn,
        trace: randomBytes(16).toString('hex'),
        data: commandList,
      });

      this.#digitalModelCache
        .getAsync(deviceId)
        .then((digitalModel) => {
          if (!digitalModel) {
            return;
          }
          commandList.forEach((command) => {
            Object.entries(command.cmdArgs).forEach(([key, value]) => {
              const property = digitalModel.attributes.find((item) => item.name === key);
              if (property && 'value' in property) {
                property.value = value;
              }
            });
          });
          this.#digitalModelCache.setAsync(deviceId, digitalModel);
        })
        .catch(() => {
          // 弱依赖，不处理错误
        });
    } catch (error) {
      this.#logger.warn('指令发送失败，尝试使用 HTTP API 发送');
      return this.#httpAPI.sendCommands(deviceId, commands);
    }
  }
  #setupWebSocket(ws: WebSocket) {
    ws.addEventListener('open', this.#heartbeat.bind(this));
    ws.addEventListener('message', this.#handleMessage.bind(this));
    ws.addEventListener('error', (event) => this.#logger.error('WebSocket error:', event));
    ws.addEventListener('close', (event) => this.#logger.error('WebSocket closed:', event));
  }

  #cleanupWebSocket() {
    if (this.#state.heartbeatInterval) {
      clearInterval(this.#state.heartbeatInterval);
    }
    if (this.#ws) {
      try {
        this.#ws.close();
        this.#ws.removeAllListeners();
      } catch (error) {
        this.#logger.error('WebSocket 关闭失败:', error);
      }
    }
  }

  async #reconnectWebSocket() {
    if (this.#state.isConnecting || this.#state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }
    this.#state.isConnecting = true;
    this.#state.reconnectAttempts += 1;
    try {
      const delay = 2000 * 2 ** this.#state.reconnectAttempts;
      await new Promise((resolve) => setTimeout(resolve, delay));

      this.#logger.info('正在重新连接 WebSocket...');
      await this.connect();

      if (this.#state.subscribedDevices.length > 0) {
        this.#logger.info('重新订阅设备:', this.#state.subscribedDevices);
        this.subscribeDevices(this.#state.subscribedDevices);
      }

      this.#state.reconnectAttempts = 0;
    } catch (error) {
      this.#logger.error('WebSocket 重连失败:', error);
      this.#reconnectWebSocket();
    } finally {
      this.#state.isConnecting = false;
    }
  }

  #heartbeat() {
    if (this.#state.heartbeatInterval) {
      clearInterval(this.#state.heartbeatInterval);
    }
    this.#state.heartbeatInterval = setInterval(() => {
      try {
        this.sendMessage('HeartBeat', {
          sn: generateSequenceId(),
          duration: 0,
        });
      } catch (error) {
        this.#logger.error('心跳消息发送失败', error);
        this.#reconnectWebSocket();
      }
    }, 60 * 1000);
  }

  #handleMessage(event: MessageEvent) {
    const resp = safeJsonParse<WebSocketMessage>(event.data.toString());
    if (!resp) {
      this.#logger.error('WebSocket 消息解析失败:', event.data);
      return;
    }
    const { success, data, error } = WebSocketMessageSchema.safeParse(resp);
    if (!success) {
      this.#logger.error('WebSocket 消息解析失败:', error);
      return;
    }
    this.#logger.debug('⬇️', `[${data.topic}]`);

    switch (data.topic) {
      case 'HeartBeatAck':
        this.#logger.debug('💓', data.content);
        break;
      case 'GenMsgDown':
        this.#handleGenMsgDown(data.content);
        break;
      default:
        this.#logger.debug('Unhandled WebSocket message:', data);
        break;
    }
  }

  #handleGenMsgDown(content: unknown) {
    const { success, data, error } = GenMsgDownSchema.safeParse(content);
    if (!success) {
      this.#logger.error('GenMsgDown 解析失败:', error);
      return;
    }
    try {
      if (data.businType === 'DigitalModel') {
        const parsedBase64Data = safeJsonParse<{ args: string; dev: string }>(
          Buffer.from(data.data, 'base64').toString('utf-8'),
        );
        if (!parsedBase64Data) {
          return;
        }
        const argsBuffer = Buffer.from(parsedBase64Data.args, 'base64');
        const decompressedData = gunzipSync(argsBuffer).toString('utf-8');
        const parsedDigitalModel = safeJsonParse<DevDigitalModel>(decompressedData);
        const validatedDigitalModel = DevDigitalModelSchema.safeParse(parsedDigitalModel);
        if (!validatedDigitalModel.success) {
          this.#logger.error('DigitalModel 解析失败:', validatedDigitalModel.error);
          return;
        }
        this.emit('devDigitalModelUpdate', parsedBase64Data.dev, validatedDigitalModel.data);
      }
    } catch (error) {
      this.#logger.error('GenMsgDown 解析失败:', error);
    }
  }
}

export default HaierIoT;
