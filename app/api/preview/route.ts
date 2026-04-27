import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import { pool } from "@/lib/db";
import { getObjectBuffer } from "@/lib/s3";
import { ACTIVE_FILE_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// ✅ tambah parameter request untuk support ?all=true dan ?sheet=NamaSheet
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();

    const fileId = cookieStore.get(ACTIVE_FILE_COOKIE)?.value;
    if (!fileId) {
      return NextResponse.json({ ok: false, error: "No active file selected" }, { status: 400 });
    }
    const { rows } = await pool.query(
        `SELECT id, file_name, bucket, object_key
        FROM uploaded_files
        WHERE id = $1
        LIMIT 1`,
      [Number(fileId)]
    );

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "File not found in DB" }, { status: 404 });
    }

    const meta = rows[0];

    const objectKey = meta.object_key;
    const buf = await getObjectBuffer(objectKey);
    const wb = XLSX.read(buf, { type: "buffer" });

    // ✅ ambil semua nama sheet
    const sheetNames = wb.SheetNames;

    // ✅ ?sheet=NamaSheet → pakai sheet yang dipilih, fallback ke sheet pertama
    const url = new URL(request.url);
    const requestedSheet = url.searchParams.get("sheet");
    const sheetName =
      requestedSheet && sheetNames.includes(requestedSheet)
        ? requestedSheet
        : sheetNames[0];

    const ws = wb.Sheets[sheetName];

    const json: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const columns = json.length ? Object.keys(json[0]) : [];

    // ✅ ?all=true → return semua rows (untuk Visualization)
    // tanpa parameter → tetap 50 rows (untuk Data Preview & Ask AI — tidak berubah)
    const allRows = url.searchParams.get("all") === "true";
    const rowsPreview = allRows ? json : json.slice(0, 50);

    return NextResponse.json({
      ok: true,
      fileId: String(meta.id),
      fileName: meta.file_name,
      sheetName,
      sheetNames,   
      totalRows: json.length,
      columns,
      rows: rowsPreview,
    });


  } catch (e: any) {
    console.error("preview error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Preview failed" }, { status: 500 });
  }
}