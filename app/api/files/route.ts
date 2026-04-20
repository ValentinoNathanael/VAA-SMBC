import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, file_name, object_key, bucket, uploaded_at, username
       FROM uploaded_files
       ORDER BY uploaded_at DESC
       LIMIT 50`
    );
    return NextResponse.json({ items: rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "DB error" },
      { status: 500 }
    );
  }
}