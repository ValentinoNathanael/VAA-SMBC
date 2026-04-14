import { NextResponse } from "next/server";
import { putObject, getObjectBuffer, S3_BUCKET } from "@/lib/s3";
import { pool } from "@/lib/db";
import { parseExcelBufferToChunks } from "@/lib/excel-parser";
import { askNova } from "@/lib/bedrock";

export const runtime = "nodejs";

function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, "_");
}

// ===== LLM Quality Check =====
async function runQualityCheck(objectKey: string, fileName: string, fileId: string) {
  try {
    console.log("[QualityCheck] Mulai untuk:", fileName);

    const buffer = await getObjectBuffer(objectKey);
    const chunks = parseExcelBufferToChunks(buffer, fileName);

    const sample = chunks.map(c => {
      const row: Record<string, any> = {};
      for (const [key, val] of Object.entries(c.row)) {
        const keyLower = key.toLowerCase();
        if (
          keyLower.includes('date') || keyLower.includes('tanggal') ||
          keyLower.includes('rto') || keyLower.includes('rpo') ||
          keyLower.includes('januari') || keyLower.includes('februari') ||
          keyLower.includes('maret') || keyLower.includes('april') ||
          keyLower.includes('mei') || keyLower.includes('juni') ||
          keyLower.includes('juli') || keyLower.includes('agustus') ||
          keyLower.includes('september') || keyLower.includes('oktober') ||
          keyLower.includes('november') || keyLower.includes('desember') ||
          typeof val === 'number'
        ) continue;
        row[key] = val;
      }
      return row;
    });

    const headers = Object.keys(sample[0] || {});

    const csvSample = [
      headers.join(","),
      ...sample.map(row => {
        return headers.map(h => {
          const val = String(row[h] ?? "");
          return `"${val.replace(/"/g, "'")}"`;
        }).join(",");
      })
    ].join("\n");

    const systemPrompt = `Kamu adalah sistem validasi data Excel.
    Tugasmu HANYA mencari baris yang MAYORITAS kolomnya berisi nilai JELAS RANDOM, TIDAK BERMAKNA, atau berisi karakter acak seperti keyboard mashing.
    
    CONTOH nilai yang JELAS RANDOM (harus di-flag kalau mayoritas kolom seperti ini):
    - "dsdsds", "asdads", "dsd", "sdsds", "qwerty", "xxx", "zzz", "aaa"
    
    JANGAN flag baris yang:
    - Hanya 1-2 kolom yang aneh, sisanya normal
    - Nilai kosong atau tanda "-" (itu normal)
    - Nama aplikasi, vendor, tempat yang masuk akal
    - Kode teknis, spesifikasi hardware/software
    - Nilai yang sama di beberapa baris (normal untuk multi-row data)
    - Typo kecil di nama kolom header
    - App_ID formatnya huruf+angka seperti App_ID001
    
    Flag baris hanya kalau kamu yakin 80%+ kolomnya berisi nilai random/tidak bermakna.
    
    Jawab HANYA dengan JSON array, tidak ada teks lain sama sekali.
    Format: [{"column": "nama kolom yang paling jelas random", "value": "nilai aneh", "row": "App_ID baris tersebut", "reason": "alasan singkat"}]
    Kalau tidak ada yang aneh kembalikan tepat: []`;

    const userPrompt = `Analisis data berikut dan flag nilai yang aneh/random/tidak wajar:\n\n${csvSample}`;

    const result = await askNova({ systemPrompt, userPrompt, maxTokens: 1000 });
    console.log("[QualityCheck] Raw result:", result);

    let issues: any[] = [];
    try {
      const cleaned = result.replace(/```json|```/g, "").trim();
      issues = JSON.parse(cleaned);
    } catch {
      console.warn("[QualityCheck] Gagal parse hasil LLM");
      return;
    }

    if (!issues.length) {
      console.log("[QualityCheck] Tidak ada issue ditemukan");
      return;
    }

    const filteredIssues = issues.filter((issue: any) =>
      issue.value &&
      issue.value.trim() !== "" &&
      !issue.reason?.toLowerCase().includes("kosong") &&
      !issue.reason?.toLowerCase().includes("empty") &&
      !issue.reason?.toLowerCase().includes("null")
    );

    for (const issue of filteredIssues) {
      await pool.query(
        `INSERT INTO data_quality_issues (file_id, file_name, column_name, value, row_identifier, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT DO NOTHING`,
        [fileId, fileName, issue.column, issue.value, issue.row, issue.reason]
      );
    }

    console.log(`[QualityCheck] ${filteredIssues.length} issue disimpan untuk ${fileName}`);
  } catch (err) {
    console.warn("[QualityCheck] Error:", err);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "File is required" },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(file.name);
    const objectKey = `uploads/${safeName}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload ke AWS S3
    await putObject(objectKey, buffer, file.type || "application/octet-stream");

    // UPSERT ke Postgres
    const result = await pool.query(
      `
      INSERT INTO uploaded_files (file_name, object_key, bucket, uploaded_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (file_name)
      DO UPDATE SET
        object_key = EXCLUDED.object_key,
        bucket = EXCLUDED.bucket,
        uploaded_at = NOW()
      RETURNING id
      `,
      [safeName, objectKey, S3_BUCKET]
    );

    // Auto reindex di background
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/ai/reindex`, { method: "POST" })
      .then(() => console.log("[Upload] Auto reindex selesai"))
      .catch((err) => console.warn("[Upload] Auto reindex gagal:", err));

    // Auto quality check di background
    runQualityCheck(objectKey, safeName, String(result.rows[0].id))
      .catch(err => console.warn("[Upload] Quality check gagal:", err));

    return NextResponse.json({
      ok: true,
      fileId: String(result.rows[0].id),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}