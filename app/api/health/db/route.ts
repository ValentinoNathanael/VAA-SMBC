import { NextResponse } from "next/server";
import { Client } from "pg";

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    const r = await client.query("SELECT NOW() as now");
    return NextResponse.json({ ok: true, now: r.rows[0].now });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "db error" }, { status: 500 });
  } finally {
    try { await client.end(); } catch {}
  }
}