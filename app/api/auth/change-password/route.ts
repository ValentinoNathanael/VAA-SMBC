import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { pool } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  // Hanya SPOC yang boleh ganti password
  const c = await cookies();
  const role = c.get("vaa_role")?.value;
  if (role !== "spoc") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

 const body = await req.json().catch(() => ({}));
  const { oldPassword, newPassword, username } = body as { oldPassword?: string; newPassword?: string; username?: string };

  if (!oldPassword || !newPassword || !username) {
    return NextResponse.json({ ok: false, error: "Username, oldPassword dan newPassword wajib diisi" }, { status: 400 });
  }

    const passwordRules = [
      { test: newPassword.length >= 8, msg: "minimal 8 karakter" },
      { test: /[A-Z]/.test(newPassword), msg: "minimal 1 huruf besar" },
      { test: /[a-z]/.test(newPassword), msg: "minimal 1 huruf kecil" },
      { test: /[0-9]/.test(newPassword), msg: "minimal 1 angka" },
      { test: /[^A-Za-z0-9]/.test(newPassword), msg: "minimal 1 karakter spesial (!@#$%^&* dll)" },
    ];
    const failed = passwordRules.filter((r) => !r.test);
    if (failed.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Password baru harus memiliki: ${failed.map((r) => r.msg).join(", ")}.` },
        { status: 400 }
      );
    }

  // Ambil hash berdasarkan username
  const result = await pool.query(
    "SELECT id, password_hash FROM spoc_auth WHERE username = $1",
    [username]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const { id, password_hash } = result.rows[0];

  // Verifikasi password lama
  const isValid = await bcrypt.compare(oldPassword, password_hash);
  if (!isValid) {
    return NextResponse.json({ ok: false, error: "Password lama salah" }, { status: 401 });
  }

  // Hash password baru dan update DB
  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    "UPDATE spoc_auth SET password_hash = $1, updated_at = NOW() WHERE id = $2",
    [newHash, id]
  );

  return NextResponse.json({ ok: true, message: "Password berhasil diubah." });
}