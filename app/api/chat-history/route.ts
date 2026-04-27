import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

// ini yang buat ngatur waktu dia kedeletnya
const EXPIRY_MINUTES = 20/60;

// GET — ambil chat history yang belum expired
export async function GET() {
  try {
    await pool.query(
      `DELETE FROM chat_history WHERE created_at < NOW() - INTERVAL '${EXPIRY_MINUTES} minutes'`
    );
    const result = await pool.query(
      "SELECT id, question, answer, intent, created_at FROM chat_history ORDER BY created_at DESC"
    );
    return NextResponse.json({ success: true, items: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST — simpan chat history baru
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, answer, intent } = body;
    if (!question || !answer) {
      return NextResponse.json({ success: false, error: "question and answer required" }, { status: 400 });
    }
    await pool.query(
      "INSERT INTO chat_history (question, answer, intent) VALUES ($1, $2, $3)",
      [question, answer, intent || null]
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE — hapus semua chat history (tetap ada untuk keperluan internal)
export async function DELETE() {
  try {
    await pool.query("DELETE FROM chat_history");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}