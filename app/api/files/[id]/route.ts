import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { ROLE_COOKIE, ACTIVE_FILE_COOKIE } from "@/lib/auth";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { chunkCache } from "@/lib/chunk-cache";


export const runtime = "nodejs";

export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await ctx.params;
    const id = Number(idStr);

    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { ok: false, error: "Invalid file id" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const role = cookieStore.get(ROLE_COOKIE)?.value ?? null;
    if (role !== "spoc") {
      return NextResponse.json(
        { ok: false, error: "Forbidden (SPOC only)" },
        { status: 403 }
      );
    }

    // 1) ambil metadata file
    const { rows } = await pool.query(
      `SELECT id, bucket, object_key FROM uploaded_files WHERE id=$1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "File not found" },
        { status: 404 }
      );
    }

    const bucket = rows[0].bucket as string;
    const objectKey = rows[0].object_key as string;

    // 2) hapus di S3 (best-effort)
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: bucket || S3_BUCKET,
        Key: objectKey,
      }));


    } catch (e) {
      console.warn("S3 removeObject failed:", e);
    }


    await pool.query(
      `DELETE FROM data_quality_issues WHERE file_id = $1`,
      [id]
    );
    // 3) hapus row di Postgres
    await pool.query(`DELETE FROM uploaded_files WHERE id=$1`, [id]);
    chunkCache.clear();


    // 4) jika active file = yang dihapus, clear cookie via response
    const active = cookieStore.get(ACTIVE_FILE_COOKIE)?.value;
    const res = NextResponse.json({ ok: true });

    if (active === String(id)) {
      res.cookies.set(ACTIVE_FILE_COOKIE, "", { path: "/", maxAge: 0 });
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Delete failed" },
      { status: 500 }
    );
  }
}