import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  COOKIE_NAME: z.string().default('beo_session'),
  COOKIE_MAX_AGE_MS: z.coerce.number().default(86_400_000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  PAYCHANGU_SECRET_KEY: z.string().min(1),
  PAYCHANGU_CALLBACK_URL: z.string().url(),
  PAYCHANGU_RETURN_URL: z.string().url(),

  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  RESEND_FROM_NAME: z.string().default('Building Entrepreneurs'),
  RESEND_DEV_EMAIL: z.string().email().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;