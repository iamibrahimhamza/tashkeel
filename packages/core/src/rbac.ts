/** Role-based permissions within a workspace. Platform STAFF/SUPERADMIN are handled separately. */

export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "SUPPORT";

export type Permission =
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "members:manage"
  | "site:edit"
  | "site:publish"
  | "services:manage"
  | "bookings:read"
  | "bookings:manage"
  | "products:manage"
  | "posts:write"
  | "posts:publish"
  | "contacts:read"
  | "contacts:write"
  | "analytics:read"
  | "orders:read"
  | "billing:manage"
  | "payouts:read"
  | "payouts:request"
  | "payout-profiles:manage";

const ALL: readonly Permission[] = [
  "workspace:read", "workspace:update", "workspace:delete", "members:manage", "site:edit", "site:publish",
  "services:manage", "bookings:read", "bookings:manage", "products:manage", "posts:write", "posts:publish",
  "contacts:read", "contacts:write", "analytics:read", "orders:read", "billing:manage", "payouts:read", "payouts:request",
  "payout-profiles:manage",
];

const MATRIX: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  OWNER: new Set(ALL),
  // Admins run the business but cannot move money out, change where it goes, or delete the workspace.
  ADMIN: new Set(ALL.filter((p) => !["workspace:delete", "billing:manage", "payouts:request", "payout-profiles:manage"].includes(p))),
  EDITOR: new Set<Permission>(["workspace:read", "site:edit", "site:publish", "products:manage", "posts:write", "posts:publish", "analytics:read"]),
  SUPPORT: new Set<Permission>(["workspace:read", "bookings:read", "bookings:manage", "contacts:read", "contacts:write", "orders:read"]),
};

export function can(role: WorkspaceRole, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function permissionsOf(role: WorkspaceRole): Permission[] {
  return [...MATRIX[role]];
}
