export type UserRole = "spoc" | "internal";
export const ROLE_COOKIE = "vaa_role";
export const ACTIVE_FILE_COOKIE = "vaa_active_file";

export function isValidRole(v: string | undefined | null): v is UserRole {
  return v === "spoc" || v === "internal";
}

export function canUpload(role: UserRole | null) {
  return role === "spoc";
}