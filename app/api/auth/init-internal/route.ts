import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { pool } from "@/lib/db";

export async function POST() {
  try {
    const plainPassword = process.env.INTERNAL_PASSWORD;

    if (!plainPassword) {
      return NextResponse.json(
        { ok: false, error: "INTERNAL_PASSWORD tidak ditemukan di .env" },
        { status: 500 }
      );
    }

    // Cek apakah sudah pernah di-init
    const existing = await pool.query("SELECT id FROM internal_auth LIMIT 1");
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Internal password sudah pernah di-init." },
        { status: 400 }
      );
    }

    // Hash password lalu simpan ke DB
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    await pool.query(
      "INSERT INTO internal_auth (password_hash) VALUES ($1)",
      [passwordHash]
    );

    return NextResponse.json({ ok: true, message: "Internal password berhasil di-init ke database." });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}