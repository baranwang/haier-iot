import EventEmitter from 'node:events';

interface HaierApiEvents {
  devDigitalModelUpdate: [deviceId: string, devDigitalModel: any];
}

export class HaierIoT extends EventEmitter<HaierApiEvents> {
  
}
