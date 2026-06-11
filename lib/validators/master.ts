import { z } from "zod";
import { MASTER_KINDS } from "@/db/enums";

const NameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Name is too long");

export const MasterKindSchema = z.enum(MASTER_KINDS);
export const MasterIdSchema = z.string().uuid("Invalid id");

export const CreateMasterSchema = z.object({
  kind: MasterKindSchema,
  name: NameSchema,
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type CreateMasterInput = z.infer<typeof CreateMasterSchema>;

export const UpdateMasterSchema = z
  .object({
    name: NameSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateMasterInput = z.infer<typeof UpdateMasterSchema>;
