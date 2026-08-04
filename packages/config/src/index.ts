import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000), WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'), COOKIE_SECRET: z.string().min(32).default('development-only-cookie-secret-32chars'),
  INTERNAL_JOB_SECRET: z.string().min(24).default('development-internal-job-secret'), DEMO_MODE: z.enum(['true', 'false']).default('true'),
  SUPABASE_URL: z.string().url().optional(), SUPABASE_SERVICE_ROLE_KEY: z.string().optional(), SUPABASE_JWT_ISSUER: z.string().url().optional()
});
export type AppEnv = z.infer<typeof envSchema>;
export const parseEnv = (input: NodeJS.ProcessEnv): AppEnv => envSchema.parse(input);
