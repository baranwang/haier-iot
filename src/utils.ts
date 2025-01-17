import { inspect } from 'node:util';
import { CommandParamsSchema } from './schema';
import type { CommandParams } from './types';

export const generateSequenceId = (time = Date.now()): string => {
  const date = new Date(time);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
    Math.floor(Math.random() * 1000000),
  ].join('');
};

export const inspectToString = (data: unknown) => inspect(data, false, Number.POSITIVE_INFINITY, true);

export const safeJsonParse = <T>(data: string): T | null => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export const generateCommandArgs = (deviceId: string, commands: CommandParams[]) => {
  const sn = generateSequenceId();
  const commandList = commands.map((command, index) => {
    const { success, data } = CommandParamsSchema.transform((data) => {
      if ('cmdArgs' in data && 'delaySeconds' in data && typeof data.cmdArgs === 'object') {
        return {
          cmdArgs: data.cmdArgs,
          delaySeconds: data.delaySeconds,
        };
      }
      return {
        cmdArgs: data as Record<string, string>,
        delaySeconds: 0,
      };
    }).safeParse(command);
    if (!success) {
      throw new Error(`Invalid command: ${inspectToString(command)}`);
    }
    return {
      sn,
      deviceId,
      index,
      subSn: `${sn}:${index}`,
      ...data,
    };
  });
  return {
    sn,
    commandList,
  };
};
