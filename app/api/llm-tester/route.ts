import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUsername } from "@/lib/auth.server";

export async function GET() {
  try {
    const username = await getUsername();
    const result = await pool.query(
      "SELECT *, created_at AT TIME ZONE 'Asia/Jakarta' AS created_at_wib FROM llm_test_history WHERE username = $1 ORDER BY created_at DESC",
      [username]
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
  const username = await getUsername();
  await pool.query(
    `INSERT INTO llm_test_history 
    (question, answer, intent, engine_summary, reasoning, verdict, note, username)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [body.question, body.answer, body.intent, body.engineSummary, body.reasoning, body.verdict, body.note, username]
  );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    
    if (body.id) {
      await pool.query("DELETE FROM llm_test_history WHERE id = $1", [body.id]);
    } else {
      await pool.query("DELETE FROM llm_test_history");
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

