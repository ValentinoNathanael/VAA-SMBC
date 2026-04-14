import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ROLE_COOKIE } from "@/lib/auth";

export async function GET() {
  const c = await cookies();
  const role = c.get(ROLE_COOKIE)?.value ?? null;
  return NextResponse.json({ role });
}