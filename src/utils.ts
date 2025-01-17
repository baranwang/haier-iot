import { inspect } from 'node:util';

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
}