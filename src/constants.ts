import type { AxiosResponse } from 'axios';
import { inspectToString } from './utils';
import cachedir from 'cachedir';

export const APP_ID = 'MB-UZHSH-0001';
export const APP_KEY = '5dfca8714eb26e3a776e58a8273c8752';

export const API_URL = {
  LOGIN: 'https://zj.haier.net/oauthserver/account/v1/login',
  GET_FAMILY_LIST: 'https://zj.haier.net/api-gw/wisdomfamily/family/v4/family/list',
  GET_DEVICES_BY_FAMILY_ID: 'https://zj.haier.net/api-gw/wisdomdevice/applent/device/v2/family/devices',
  GET_DEV_DIGITAL_MODEL: 'https://uws.haier.net/shadow/v1/devdigitalmodels',
  BATCH_SEND_COMMAND: 'https://uws.haier.net/stdudse/v1/sendbatchCmd/{deviceId}',
  GET_WSS_URL: 'https://uws.haier.net/gmsWS/wsag/assign',
};

export const MAX_RECONNECT_ATTEMPTS = 5;

export const DEFAULT_CACHE_DIR = cachedir('haier-iot');

export class HttpError extends Error {
  name = 'HttpError';

  retInfo = '';

  constructor(
    resp: AxiosResponse<{
      retCode: string;
      retInfo: string;
    }>,
  ) {
    super();
    this.message = `${resp.config.url} - [${resp.data.retCode}]: ${inspectToString(resp.data.retInfo)}\n ${
      resp.config.data
    }`;
    this.retInfo = resp.data.retInfo;
  }
}
