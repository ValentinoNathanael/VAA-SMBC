import { NextResponse } from "next/server";

export async function POST() {
const res = NextResponse.json({ ok: true });

  // untuk menghapus cookie role
res.cookies.set("vaa_role", "", { path: "/", maxAge: 0 });

return res;
}