import type { z } from 'zod';
import type { TokenInfoSchema } from './schema';

export interface Logger {
  info(message: string, ...parameters: any[]): void;
  success(message: string, ...parameters: any[]): void;
  warn(message: string, ...parameters: any[]): void;
  error(message: string, ...parameters: any[]): void;
  debug(message: string, ...parameters: any[]): void;
}

export interface Options {
  username: string;
  password: string;
  storageDir?: string;
  logger?: Logger;
}



export type TokenInfo = z.infer<typeof TokenInfoSchema>;
