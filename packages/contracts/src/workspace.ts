import { z } from "zod";
import { Currency, IanaTimezone, Slug } from "./common";

export const WorkspaceRole = z.enum(["OWNER", "ADMIN", "EDITOR", "SUPPORT"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRole>;

export const PlatformRole = z.enum(["USER", "STAFF", "SUPERADMIN"]);
export type PlatformRole = z.infer<typeof PlatformRole>;

export const PlanCode = z.enum(["FREE", "PRO", "BUSINESS"]);
export type PlanCode = z.infer<typeof PlanCode>;

export const SignupInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(200),
  locale: z.enum(["ar", "en"]).default("ar"),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const CreateWorkspaceInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: Slug,
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  timezone: IanaTimezone.default("Asia/Riyadh"),
  currency: Currency.default("USD"),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInput>;

export const UpdateWorkspaceInput = CreateWorkspaceInput.partial();
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceInput>;

export const WorkspaceDto = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  country: z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
  planCode: PlanCode,
  role: WorkspaceRole,
  createdAt: z.string(),
});
export type WorkspaceDto = z.infer<typeof WorkspaceDto>;

export const InviteMemberInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: WorkspaceRole.exclude(["OWNER"]),
});
export type InviteMemberInput = z.infer<typeof InviteMemberInput>;

export const SlugAvailability = z.object({ slug: z.string(), isAvailable: z.boolean() });
