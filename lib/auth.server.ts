import { cookies } from "next/headers";
import { isValidRole, ROLE_COOKIE, type UserRole } from "./auth";
import { ACTIVE_FILE_COOKIE } from "./auth";


export async function getRole(): Promise<UserRole | null> {
  const c = await cookies();
  const role = c.get(ROLE_COOKIE)?.value;
  return isValidRole(role) ? role : null;
}

export async function getActiveFileId(): Promise<string | null> {
  const c = await cookies(); 
  return c.get(ACTIVE_FILE_COOKIE)?.value ?? null;
}