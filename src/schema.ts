import { z } from 'zod';
import { safeJsonParse } from './utils';

export const HaierResponseSchema = z.object({
  retCode: z.string(),
  retInfo: z.string(),
  data: z.unknown(),
});

export const TokenInfoSchema = z
  .object({
    accountToken: z.string(),
    expiresIn: z.number().describe('Token 过期时间，单位秒'),
    tokenType: z.string(),
    refreshToken: z.string(),
    uhomeAccessToken: z.string(),
    uhomeUserId: z.string(),
    uocUserId: z.string(),

    expiresAt: z.number().optional().describe('Token 过期毫秒级时间戳，非 API 返回字段'),
  })
  .transform((data) => ({
    ...data,
    expiresAt: data.expiresIn * 1000 + Date.now(),
  }));

export const LoginRequestSchema = z.object({
  username: z.string(),
  password: z.string(),
  phoneType: z.string(),
});

export const LoginResponseSchema = HaierResponseSchema.extend({
  data: z.object({
    tokenInfo: TokenInfoSchema,
  }),
});

export const FamilyInfoSchema = z.object({
  familyId: z.string(),
  familyName: z.string(),
});

export const GetFamilyListResponseSchema = HaierResponseSchema.extend({
  data: z
    .object({
      createfamilies: z.array(FamilyInfoSchema).nullish(),
      joinfamilies: z.array(FamilyInfoSchema).nullish(),
    })
    .transform((data) => [...(data.createfamilies ?? []), ...(data.joinfamilies ?? [])]),
});

export const DevicePermissionSchema = z.object({
  auth: z
    .object({
      control: z.boolean().nullish(),
      set: z.boolean().nullish(),
      view: z.boolean().nullish(),
    })
    .nullish(),
  authType: z.string().nullish(),
});

export const DeviceBaseInfoSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  devName: z.string(),
  bindTime: z.string(),
  deviceType: z.string().nullish(),
  familyId: z.string(),
  ownerId: z.string(),
  permission: DevicePermissionSchema.nullish(),
  wifiType: z.string().nullish(),
  isOnline: z.boolean().nullish(),
  ownerInfo: z.unknown(),
  subDeviceIds: z.string().nullish(),
  parentsDeviceId: z.string().nullish(),
  deviceRole: z.unknown(),
  deviceRoleType: z.string().nullish(),
  deviceNetType: z.enum(['device', 'nonNetDevice']).nullish(),
  deviceGroupId: z.string().nullish(),
  deviceGroupType: z.string().nullish(),
});

export const DeviceExtendedInfoSchema = z.object({
  brand: z.string(),
  apptypeCode: z.string(),
  apptypeName: z.string(),
  apptypeIcon: z.string(),
  barcode: z.string(),
  room: z.string(),
  roomId: z.string(),
  devFloorId: z.string(),
  devFloorOrderId: z.string(),
  devFloorName: z.string(),
  model: z.string(),
  prodNo: z.string(),
  bindType: z.string().nullish(),
  categoryGrouping: z.string(),
  imageAddr1: z.string(),
  imageAddr2: z.string(),
  accessType: z.string().nullish(),
  configType: z.string(),
  comunicationMode: z.string().nullish(),
  detailsUrl: z.string().nullish(),
  noKeepAlive: z.number(),
  twoGroupingName: z.string(),
  appletProxAuth: z.number(),
});

export const DeviceInfoSchema = z.object({
  baseInfo: DeviceBaseInfoSchema,
  extendedInfo: DeviceExtendedInfoSchema,
});

export const GetFamilyDevicesResponseSchema = HaierResponseSchema.extend({
  data: z
    .object({
      deviceinfos: z.array(DeviceInfoSchema),
    })
    .transform((data) => data.deviceinfos),
});

export const DevDigitalModelPropertySchema = z.object({
  name: z.string(),
  desc: z.string(),
  invisible: z.boolean(),
  operationType: z.string().nullish(),
  readable: z.boolean(),
  writable: z.boolean(),
  defaultValue: z.string().nullish(),
  value: z.string().nullish(),
  valueRange: z.union([
    z.object({
      type: z.literal('STEP'),
      dataStep: z
        .object({
          dataType: z.string(),
          maxValue: z.string(),
          minValue: z.string(),
          step: z.string(),
        })
        .optional(),
    }),
    z.object({
      type: z.literal('LIST'),
      dataList: z
        .array(
          z.object({
            data: z.string(),
            desc: z.string().nullish(),
          }),
        )
        .default([]),
    }),
    z.object({
      type: z.literal('DATE'),
      dataDate: z.record(z.string().or(z.number())).nullish(),
    }),
    z.object({
      type: z.literal('TIME'),
      dataTime: z.record(z.string().or(z.number())).nullish(),
    }),
  ]),
});

export const DevDigitalModelSchema = z.object({
  alarms: z.array(z.unknown()),
  attributes: z.array(z.any()).transform((data) => {
    return data
      .map((item) => {
        const { success, data, error } = DevDigitalModelPropertySchema.safeParse(item);
        if (!success) {
          console.error('Failed to parse digital model property:', error);
        }
        return success ? data : null;
      })
      .filter((item) => item !== null);
  }),
});

export const GetDevDigitalModelResponseSchema = HaierResponseSchema.extend({
  detailInfo: z.record(z.string()).transform((data) => {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => {
        const { success, data, error } = DevDigitalModelSchema.safeParse(safeJsonParse(value));
        if (!success) {
          console.error(`Failed to parse digital model for device: ${key}`, error);
        }
        return [key, success ? data : undefined];
      }),
    );
  }),
});

const CommandArgumentSchema = z
  .record(z.string(), z.string())
  .refine((val) => Object.keys(val).length === 1, { message: 'Must have exactly one key-value pair' });

export const CommandParamsSchema = z.union([
  CommandArgumentSchema,
  z.object({
    cmdArgs: CommandArgumentSchema,
    delaySeconds: z.number().nullish().default(0),
  }),
]);

export const WebSocketMessageSchema = z.object({
  topic: z.string(),
  content: z.unknown(),
});

export const GenMsgDownSchema = z.object({
  businType: z.literal('DigitalModel'),
  data: z.string(),
});
