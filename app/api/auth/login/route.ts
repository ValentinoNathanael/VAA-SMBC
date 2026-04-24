import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { pool } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { role, username, password } = body as { role?: string; username?: string; password?: string };

  if (role === "internal") {
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
    }
    const result = await pool.query(
      "SELECT password_hash FROM internal_auth WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Username not found" }, { status: 401 });
    }
    const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!isValid) {
      return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, role: "internal" });
    res.cookies.set("vaa_role", "internal", { httpOnly: true, path: "/" });
    res.cookies.set("vaa_username", username, { httpOnly: true, path: "/" });
    await pool.query(
      "INSERT INTO login_history (username, role) VALUES ($1, $2)",
      [username, "internal"]
    );
    return res;
  }

  if (role === "spoc") {  
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
    }
    const result = await pool.query(
      "SELECT password_hash FROM spoc_auth WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Username not found" }, { status: 401 });
    }
    const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!isValid) {
      return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, role: "spoc" });
    res.cookies.set("vaa_role", "spoc", { httpOnly: true, path: "/" });
    res.cookies.set("vaa_username", username, { httpOnly: true, path: "/" });
    await pool.query(
      "INSERT INTO login_history (username, role) VALUES ($1, $2)",
      [username, "spoc"]
    );
    return res;
  }

  return NextResponse.json({ ok: false, error: "Role tidak valid" }, { status: 400 });
}