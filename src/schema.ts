import { z } from 'zod';

export const HaierResponseSchema = z.object({
  retCode: z.string(),
  retInfo: z.string(),
  data: z.unknown(),
});

export const TokenInfoSchema = z.object({
  accountToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.string(),
  refreshToken: z.string(),
  uhomeAccessToken: z.string(),
  uhomeUserId: z.string(),
  uocUserId: z.string(),
  expiresAt: z.number(),
});

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
      createfamilies: z.array(FamilyInfoSchema),
      joinfamilies: z.array(FamilyInfoSchema),
    })
    .transform((data) => [...data.createfamilies, ...data.joinfamilies]),
});
