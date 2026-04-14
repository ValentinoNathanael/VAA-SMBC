import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT * FROM llm_test_history ORDER BY created_at DESC"
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await pool.query(
      `INSERT INTO llm_test_history 
       (question, answer, intent, engine_summary, reasoning, verdict, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [body.question, body.answer, body.intent, body.engineSummary, body.reasoning, body.verdict, body.note]
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await pool.query("DELETE FROM llm_test_history");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}