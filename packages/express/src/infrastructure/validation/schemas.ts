import { z } from 'zod';

/**
 * Input validation schemas using Zod
 */

// Auth schemas
export const loginRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less').trim(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Centrifugo proxy schemas
export const centrifugoConnectRequestSchema = z.object({
  client: z.string(),
  transport: z.string(),
  protocol: z.string(),
  encoding: z.string(),
  data: z
    .object({
      userId: z.string().optional(),
      userName: z.string().optional(),
    })
    .optional(),
});

export const centrifugoSubscribeRequestSchema = z.object({
  client: z.string(),
  transport: z.string(),
  protocol: z.string(),
  encoding: z.string(),
  user: z.string(),
  channel: z.string(),
  data: z.unknown().optional(),
});

export const centrifugoPublishRequestSchema = z.object({
  client: z.string(),
  transport: z.string(),
  protocol: z.string(),
  encoding: z.string(),
  user: z.string(),
  channel: z.string(),
  data: z.object({
    text: z.string().min(1, 'Message text is required').max(5000, 'Message too long'),
  }),
});

// Validation helper
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
):
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorMessage = result.error.errors.map((e) => e.message).join(', ');
  return { success: false, error: errorMessage };
}
