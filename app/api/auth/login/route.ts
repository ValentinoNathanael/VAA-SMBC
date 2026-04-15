import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { pool } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { role, password } = body as { role?: string; password?: string };

  if (role === "internal") {
    if (!password) {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }
    const result = await pool.query("SELECT password_hash FROM internal_auth LIMIT 1");
    if (result.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Internal user belum di-inisialisasi." }, { status: 500 });
    }
    const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!isValid) {
      return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, role: "internal" });
    res.cookies.set("vaa_role", "internal", { httpOnly: true, path: "/" });
    return res;
  }

  if (role === "spoc") {
    if (!password) {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }

    // Ambil password hash dari DB
    const result = await pool.query("SELECT password_hash FROM spoc_auth LIMIT 1");
    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "SPOC belum di-inisialisasi. Jalankan /api/auth/init-spoc terlebih dahulu." },
        { status: 500 }
      );
    }

    const { password_hash } = result.rows[0];
    const isValid = await bcrypt.compare(password, password_hash);

    if (!isValid) {
      return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, role: "spoc" });
    res.cookies.set("vaa_role", "spoc", { httpOnly: true, path: "/" });
    return res;
  }

  return NextResponse.json({ ok: false, error: "Role tidak valid" }, { status: 400 });
}