import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACTIVE_FILE_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
    const { fileId } = await req.json();
const c = await cookies();
    c.set(ACTIVE_FILE_COOKIE, String(fileId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
});
return NextResponse.json({ ok: true });
}

export async function GET() {
const c = await cookies();
const fileId = c.get(ACTIVE_FILE_COOKIE)?.value ?? "";
return NextResponse.json({ ok: true, fileId });
}
