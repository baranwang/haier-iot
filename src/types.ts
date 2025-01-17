import type { z } from 'zod';
import type { CommandParamsSchema, DevDigitalModelSchema, TokenInfoSchema, WebSocketMessageSchema } from './schema';

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

export type DevDigitalModel = z.infer<typeof DevDigitalModelSchema>;

export type CommandParams = z.infer<typeof CommandParamsSchema>;

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
