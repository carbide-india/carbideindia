import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
});
