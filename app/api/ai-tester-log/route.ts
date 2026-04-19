import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const c = await cookies();
    const username = c.get("vaa_username")?.value;
    if (!username) return NextResponse.json({ ok: false });

    await pool.query(
      "INSERT INTO ai_tester_access_log (username) VALUES ($1)",
      [username]
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}