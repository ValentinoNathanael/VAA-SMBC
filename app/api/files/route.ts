import { NextResponse } from "next/server";
import { Pool } from "pg";



const pool = new Pool({
    host: "localhost",
    port: 5432,
    user: "vaa_user",
    password: "vaa_pass",
    database: "vaa_db",
});

export async function GET() {
try {
    const { rows } = await pool.query(
        `SELECT id, file_name, object_key, bucket, uploaded_at
        FROM uploaded_files
        ORDER BY uploaded_at DESC
        LIMIT 50`
    );
   return NextResponse.json({ items: rows });
} catch (e: any) {
    return NextResponse.json(
        { ok: false, error: e?.message ?? "DB error" },
        { status: 500 }
    );
}
}

