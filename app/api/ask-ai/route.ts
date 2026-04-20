import { NextRequest, NextResponse } from "next/server";
import { listExcelObjects, getObjectBuffer } from "@/lib/s3";
import { parseExcelBufferToChunks, ExcelChunk } from "@/lib/excel-parser";
import { retrieveRelevantChunks } from "@/lib/ai-retrieval";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/ai-prompt";
import { askNova, askNovaJSON } from "@/lib/bedrock";
import { buildSchemaFromChunks, formatSchemaForLLM, SchemaMap } from "@/lib/schema-detector";
import { cachedSchema } from "@/app/api/ai/reindex/route";
import { pool } from "@/lib/db";
import { executeInstruction, detectDataIssues } from "@/lib/excel-engine";

let localCachedSchema: SchemaMap | null = null;
import { chunkCache } from "@/lib/chunk-cache";

const CACHE_TTL_MS = 1000 * 60 * 30;

async function getChunks(): Promise<ExcelChunk[]> {
  const now = Date.now();
  const objects = await listExcelObjects();
  const fingerprint = objects.map((o) => o.name).sort().join("|");

  if (
    chunkCache.chunks &&
    chunkCache.timestamp &&
    now - chunkCache.timestamp < CACHE_TTL_MS &&
    chunkCache.fingerprint === fingerprint
  ) {
    console.log("[Cache] Menggunakan cached chunks:", chunkCache.chunks.length);
    return chunkCache.chunks;
  }

  console.log("[Cache] Parsing ulang dari S3... fingerprint:", fingerprint);
  const allChunks: ExcelChunk[] = [];
  for (const object of objects) {
    const fileBuffer = await getObjectBuffer(object.name);
    const chunks = parseExcelBufferToChunks(fileBuffer, object.name);
    allChunks.push(...chunks);
  }

  chunkCache.set(allChunks, fingerprint);
  console.log("[Cache] Cache diperbarui:", allChunks.length, "chunks");
  return allChunks;
}

async function getSchema(chunks: ExcelChunk[]): Promise<SchemaMap> {
  if (chunkCache.schema) {
    console.log("[Schema] Menggunakan cached schema");
    return chunkCache.schema;
  }
  console.log("[Schema] Building schema dari chunks...");
  const schema = buildSchemaFromChunks(chunks);
  chunkCache.schema = schema;
  return schema;
}

function buildAnalysisSystemPrompt(schemaMap: SchemaMap): string {
  return `
Kamu adalah sistem analisis query untuk database Excel.
Tugasmu HANYA menganalisis pertanyaan user dan menentukan operasi yang dibutuhkan.

STRUKTUR DATA YANG TERSEDIA:
${formatSchemaForLLM(schemaMap)}

INSTRUKSI:
Jawab HANYA dengan JSON array, tidak ada teks lain sama sekali.
Jika pertanyaan membutuhkan LEBIH DARI SATU filter/kondisi, kembalikan MULTIPLE instruksi.
Instruksi dieksekusi BERURUTAN — output step 1 menjadi input step 2.

Format JSON yang harus dikembalikan:
[
  {
    "operation": "filter" | "sum" | "count" | "lookup" | "list" | "most_frequent" | "date_filter" | "average" | "general",
    "groupBy": "nama kolom untuk pengelompokan rata-rata atau null",
    "file": "nama file yang relevan atau null",
    "column": "nama kolom yang relevan atau null",
    "value": "nilai yang dicari untuk filter atau null",
    "logic": "OR" | "AND",
    "entity": "nama aplikasi atau App_ID spesifik atau null",
    "reasoning": "alasan singkat"
  }
]

PANDUAN OPERASI:
- "filter" → user minta list/daftar berdasarkan kondisi tertentu
- "list"   → user minta SEMUA nilai dari kolom tertentu TANPA filter spesifik (contoh: "hostname apa saja", "semua vendor", "daftar lokasi")
- "sum" → user minta total/jumlah nilai angka
- "count" → user minta berapa banyak item
- "lookup" → user minta detail info aplikasi/entity spesifik
  Contoh: "info App_ID001" → operation: "lookup", entity: "App_ID001"
  Contoh: "nama aset dari code AS001" → operation: "lookup", entity: "AS001"
  Contoh: "info aset code AE652" → operation: "lookup", entity: "AE652"
  Contoh: "detail aset dengan kode AN167" → operation: "lookup", entity: "AN167"
  Gunakan "lookup" untuk SEMUA pertanyaan yang menyebut kode spesifik (App_ID, asset code, invoice number, serial number, dll)
  Contoh: "vendor Jenius" → operation: "lookup", entity: "Jenius", file: null, column: null
  Contoh: "vendor aplikasi BTPN" → operation: "lookup", entity: "BTPN", file: null, column: null
  Contoh: "hostname server Jago" → operation: "lookup", entity: "Jago", file: null, column: null
- Jika user menyebut nama hardware/perangkat/aset spesifik (contoh: "Server Lenovo ThinkSystem", "Backup Appliance HPE", "Network Switch Cisco", "Lisensi Windows") → gunakan operation: "filter", file: "template_activo.xlsx", column: "asset name"
  JANGAN gunakan "lookup" untuk kasus ini karena filter akan otomatis join ke nama aplikasi
- "general" → pertanyaan umum yang butuh analisis LLM
- "most_frequent" → user minta nilai yang paling banyak/sering muncul dari suatu kolom
  Contoh: "vendor paling banyak?" → operation: "most_frequent", column: "vendor", file: "template_opex.xlsx"
  Contoh: "lokasi paling banyak?" → operation: "most_frequent", column: "Lokasi Data Center", file: "template_server.xlsx"
- "date_filter" → user minta filter berdasarkan kondisi tanggal
  Contoh: "masa garansi expired" → operation: "date_filter", column: "Masa Garansi", value: "expired"
  Contoh: "kontrak yang belum habis" → operation: "date_filter", column: "Tanggal Kedaluwarsa", value: "active"
  Contoh: "aplikasi live setelah 2020" → operation: "date_filter", column: "Date_LIve", value: "after:2020"
  Contoh: "aset dibeli tahun 2024" → operation: "date_filter", column: "Tanggal Pembelian", value: "year:2024"
- "average" → user minta rata-rata nilai dari suatu kolom
  Contoh: "rata-rata Nilai Depresiasi" → operation: "average", column: "Nilai Depresiasi", file: "template_activo.xlsx"
  Contoh: "rata-rata Harga Perolehan per kategori aset" → operation: "average", column: "Harga Perolehan", file: "template_activo.xlsx", groupBy: "Tipe/Kategori Aset"
  Contoh: "rata-rata biaya OPEX per vendor" → operation: "average", column: null, file: "template_opex.xlsx", groupBy: "vendor"
  Gunakan "groupBy" untuk mengelompokkan rata-rata berdasarkan kategori tertentu

PENTING:
- Gunakan nama file dan kolom PERSIS seperti yang ada di schema
- Nilai filter harus sesuai dengan sample values yang ada di schema
- Jangan tambahkan penjelasan apapun diluar JSON array
- Untuk filter kondisi seperti Status=Active, SELALU gunakan operation "filter"
- Maksimal 3 instruksi saja, jangan lebih
- JANGAN tambahkan instruksi "count" atau "lookup" setelah "filter" jika tidak diperlukan
- Jika pertanyaan minta jumlah DAN info detail (lokasi, hostname, dll) dari 1 aplikasi spesifik, JANGAN gunakan "count". Gunakan "lookup" dengan entity diisi nama aplikasinya — sistem otomatis tampilkan semua data termasuk jumlah dan detail
- Gunakan "count" HANYA kalau user minta angka jumlah saja tanpa butuh detail lainnya. Contoh: "berapa aplikasi yang active?" → count. "berapa server Jenius dan di mana?" → lookup
- Jika pertanyaan minta jumlah SEKALIGUS detail/daftar dalam 1 kalimat → JANGAN generate "count", cukup "filter" saja. Sistem otomatis hitung jumlah dari hasil filter.
- JANGAN generate instruksi filter dengan value null
- Semua file dihubungkan by App_ID — sistem akan otomatis join data antar file
- Untuk pertanyaan yang butuh data dari 2 file berbeda (contoh: "app owner dari aset X"), JANGAN generate 2 instruksi lookup berantai. Cukup 1 instruksi filter dengan value yang dicari, sistem otomatis join semua file by App_ID
- JANGAN generate instruksi dengan entity berisi teks deskriptif seperti "App_ID dari hasil lookup sebelumnya" — itu tidak valid, entity harus berisi nama aplikasi atau App_ID yang spesifik
- JANGAN generate instruksi "general" dengan semua field null
- Untuk pertanyaan tentang biaya/total/jumlah angka, SELALU gunakan operation "sum", JANGAN "general"
- Untuk pertanyaan biaya suatu aplikasi, LANGSUNG gunakan 1 instruksi sum dengan entity diisi nama aplikasinya
- JANGAN pisah sum per bulan — cukup 1 instruksi sum tanpa column, sistem otomatis sum semua bulan
- Jika pertanyaan mengandung "info lengkap", "detail", "semua data", "semua info" → SELALU gunakan "lookup", meskipun ada kata "biaya" atau "cost"
- Untuk pertanyaan "application type", gunakan file template_aplikasi.xlsx kolom "Application TYpe"
- JANGAN gunakan template_activo.xlsx untuk pertanyaan tentang tipe aplikasi
- Untuk pertanyaan tentang atribut spesifik suatu aplikasi (vendor, hostname, owner, lokasi, dll) yang menyebut nama aplikasi → SELALU gunakan "lookup" dengan entity diisi nama aplikasinya, file: null, column: null. Gunakan lookup HANYA kalau ada nama aplikasi/entity spesifik yang disebutkan.
- Jika user menyebut kata kunci yang tidak persis sama dengan nama kolom di schema → cari kolom yang paling relevan berdasarkan konteks dan schema yang tersedia. Jangan gagal hanya karena nama kolom tidak persis sama dengan yang disebutkan user.

PENTING UNTUK KONDISI "BUKAN/TIDAK/SELAIN" (NOT):
- Jika pertanyaan mengandung kata "bukan", "tidak", "selain", "kecuali" untuk suatu nilai kolom
  → gunakan logic: "NOT" dengan value diisi nilai yang dikecualikan
  Contoh: "Importance Rank bukan A" → column: "Importance rank risk", value: "A", logic: "NOT"
  Contoh: "aplikasi yang bukan cloud" → column: "Deployment_type", value: "Cloud", logic: "NOT"
  Contoh: "status bukan Active" → column: "Status", value: "Active", logic: "NOT"
  Contoh: "aplikasi selain LOB Digital Banking" → column: "LOB", value: "Digital Banking", logic: "NOT"
- logic: "NOT" berarti exclude semua item yang nilainya SAMA dengan value
- JANGAN gunakan logic: "NOT" untuk pertanyaan yang tidak mengandung kata pengecualian


PENTING UNTUK MULTI-KONDISI BEDA KOLOM:
- Jika pertanyaan mengandung 2 kondisi BEDA KOLOM dengan kata "dan"/"and" → kembalikan 2 instruksi filter TERPISAH dengan logic "AND"
  Contoh: "aplikasi yang statusnya mati dan servernya di Bangka" →
  [
    {"operation": "filter", "file": "template_aplikasi.xlsx", "column": "Status", "value": "Decommissioned", "logic": "AND"},
    {"operation": "filter", "file": "template_server.xlsx", "column": "Lokasi Data Center", "value": "Bangka", "logic": "AND"}
  ]
  Contoh: "aplikasi active dan deployment cloud" →
  [
    {"operation": "filter", "file": "template_aplikasi.xlsx", "column": "Status", "value": "Active", "logic": "AND"},
    {"operation": "filter", "file": "template_server.xlsx", "column": "Deployment_type", "value": "Cloud", "logic": "AND"}
  ]

- Jika pertanyaan mengandung 2 kondisi BEDA KOLOM dengan kata "atau"/"or" → kembalikan 2 instruksi filter TERPISAH dengan logic "OR"
  Contoh: "aplikasi yang statusnya mati atau servernya di Bangka" →
  [
    {"operation": "filter", "file": "template_aplikasi.xlsx", "column": "Status", "value": "Decommissioned", "logic": "OR"},
    {"operation": "filter", "file": "template_server.xlsx", "column": "Lokasi Data Center", "value": "Bangka", "logic": "OR"}
  ]

- Jika pertanyaan mengandung 2 kondisi KOLOM SAMA dengan kata "atau"/"or" → kembalikan 2 instruksi filter dengan kolom & file sama, logic "OR"
  Contoh: "aplikasi yang statusnya Active atau Decommissioned" →
  [
    {"operation": "filter", "file": "template_aplikasi.xlsx", "column": "Status", "value": "Active", "logic": "OR"},
    {"operation": "filter", "file": "template_aplikasi.xlsx", "column": "Status", "value": "Decommissioned", "logic": "OR"}
  ]

PENTING UNTUK "sum":
- Tentukan file target berdasarkan KOLOM yang diminta, gunakan schema di atas sebagai acuan utama
- Jika user sebut nama aplikasi atau App_ID spesifik → gunakan "entity"
  Contoh: "biaya Jenius" → entity: "Jenius", file: "template_opex.xlsx"
  Contoh: "biaya App_ID001" → entity: "App_ID001", file: "template_opex.xlsx"
- Jika user sebut atribut/nilai dari kolom manapun → gunakan "value", BUKAN "entity"
  Contoh: "biaya LOB Digital Banking" → value: "Digital Banking", file: "template_opex.xlsx"
  Contoh: "biaya deployment Cloud" → value: "Cloud", file: "template_opex.xlsx"
  Contoh: "total harga perolehan aset ERP" → value: "Aplikasi ERP", file: "template_activo.xlsx"
  Contoh: "total nilai depresiasi status Active" → value: "Active", file: "template_activo.xlsx"
- SELALU lihat schema untuk tentukan file yang tepat — kolom ada di file mana, file itulah yang dipakai
- Jangan asumsikan file tanpa lihat schema terlebih dahulu

PENTING UNTUK "list":
- Gunakan "list" ketika user minta daftar nilai dari 1 kolom tanpa kondisi filter
- Isi field "column" dengan nama kolom yang diminta PERSIS seperti di schema
- Field "value" dan "entity" biarkan null
- Isi field "file" dengan nama file yang punya kolom tersebut
- Contoh: "hostname apa saja?" → operation: "list", column: "Host name", file: "template_server.xlsx"
- Contoh: "vendor apa saja?" → operation: "list", column: "vendor", file: "template_server.xlsx"
- Contoh: "tipe aplikasi apa saja?" → operation: "list", column: "Application TYpe", file: "template_aplikasi.xlsx"
- Contoh: "lokasi data center apa saja?" → operation: "list", column: "Lokasi Data Center", file: "template_server.xlsx"
- Contoh: "deployment type apa saja?" → operation: "list", column: "Deployment_type", file: "template_server.xlsx"
- Jika user minta data dari BEBERAPA App_ID sekaligus (contoh: "app id 1-3", "app id 1 sampai 5"),
  SELALU gunakan 1 instruksi "lookup" dengan entity diisi semua App_ID dipisah koma
  Contoh: "app id 1-3" → operation: "lookup", entity: "App_ID001,App_ID002,App_ID003"
  JANGAN generate filter terpisah per App_ID
- JANGAN tambahkan instruksi "list" setelah "filter" — hasil filter sudah otomatis ditampilkan sistem
- Jika user pakai kata "atau", "or" → gunakan logic: "OR" untuk filter kolom yang sama
- Jika user pakai kata "dan", "sekaligus", "juga" → gunakan logic: "AND" untuk filter kolom yang sama

PENTING UNTUK BIAYA DARI ATRIBUT NON-APLIKASI:
- Jika user tanya biaya berdasarkan atribut yang bukan nama aplikasi atau App_ID
  (contoh: vendor, LOB, lokasi, status, deployment type, hostname, asset code, dll)
  → generate 2 instruksi BERURUTAN:
  Step 1: filter untuk cari App_ID berdasarkan atribut tersebut
  Step 2: sum di template_opex.xlsx tanpa entity/value (sistem otomatis pakai hasil filter)

  Contoh: "biaya vendor PT Valerian" →
  [
    {"operation": "filter", "file": "template_opex.xlsx", "column": "vendor", "value": "PT Valerian"},
    {"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null}
  ]
  Contoh: "biaya aplikasi LOB Digital Banking" →
  [
    {"operation": "filter", "file": "template_aplikasi.xlsx", "column": "LOB", "value": "Digital Banking"},
    {"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null}
  ]
  Contoh: "biaya server di Bandung" →
  [
    {"operation": "filter", "file": "template_server.xlsx", "column": "Lokasi Data Center", "value": "Bandung"},
    {"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null}
  ]
  Contoh: "biaya aset yang statusnya Active" →
  [
    {"operation": "filter", "file": "template_activo.xlsx", "column": "Status Aset", "value": "Active"},
    {"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null}
  ]

PENTING UNTUK PERTANYAAN "PALING TINGGI/RENDAH/LAMA/CEPAT" KOLOM NON-BIAYA:
- Jika user tanya nilai tertinggi/terendah/terlama/tercepat dari kolom yang BUKAN biaya (contoh: RTO, RPO, tanggal, angka teknis)
  → gunakan operation: "filter" dengan field tambahan "sort" dan "limit"
  Contoh: "RTO paling lama" → operation: "filter", file: "template_aplikasi.xlsx", column: "RTo", value: null, sort: "desc", limit: 1
  Contoh: "RTO paling cepat" → operation: "filter", file: "template_aplikasi.xlsx", column: "RTo", value: null, sort: "asc", limit: 1
  Contoh: "RPO terkecil" → operation: "filter", file: "template_aplikasi.xlsx", column: "RPO", value: null, sort: "asc", limit: 1
  Contoh: "top 3 RTO terlama" → operation: "filter", file: "template_aplikasi.xlsx", column: "RTo", value: null, sort: "desc", limit: 3
- JANGAN gunakan "sum" untuk kolom non-biaya seperti RTO, RPO, dan kolom angka teknis lainnya


PENTING UNTUK PERTANYAAN "PALING MAHAL/MURAH/TERTINGGI/TERENDAH" BIAYA:
- Jika user tanya "paling mahal", "termahal", "biaya tertinggi", "paling banyak biaya", "terbesar biayanya", "paling sedikit biaya", "termurah", "paling hemat", "biaya terkecil", "terbesar", "terkecil"
  → SELALU merujuk ke biaya OPEX di template_opex.xlsx KECUALI user eksplisit sebut:
  - "harga perolehan" → template_activo.xlsx kolom "Harga Perolehan"
  - "nilai depresiasi" → template_activo.xlsx kolom "Nilai Depresiasi"
  - "aset paling mahal" → template_activo.xlsx kolom "Harga Perolehan"

- Untuk pertanyaan ranking biaya → gunakan operation "sum" dengan field tambahan "sort" dan "limit":
  Contoh: "aplikasi paling mahal" →
  [{"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null, "sort": "desc", "limit": 1}]

  Contoh: "aplikasi paling murah" →
  [{"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null, "sort": "asc", "limit": 1}]

  Contoh: "top 5 aplikasi paling mahal" →
  [{"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null, "sort": "desc", "limit": 5}]

  Contoh: "aplikasi paling mahal di bulan Januari" →
  [{"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null, "sort": "desc", "sortColumn": "Januari", "limit": 1}]

  Contoh: "aplikasi paling murah di Maret" →
  [{"operation": "sum", "file": "template_opex.xlsx", "column": null, "value": null, "entity": null, "sort": "asc", "sortColumn": "Maret", "limit": 1}]

- Field "sort": "desc" = tertinggi ke terendah, "asc" = terendah ke tertinggi
- Field "limit": angka berapa aplikasi yang ditampilkan
- Field "sortColumn": nama bulan jika user sebut bulan spesifik, kosongkan jika sort by total setahun
- Jika user tidak sebut angka (contoh: "beberapa", "sejumlah") → gunakan limit: 5 sebagai default
- Jika user sebut "paling" tanpa angka → gunakan limit: 1
- JANGAN gunakan "lookup" atau "most_frequent" untuk pertanyaan ranking biaya

HIERARKI PRIORITAS UNTUK KOLOM AMBIGU:
- Kolom "status" tanpa keterangan → prioritaskan template_aplikasi.xlsx kolom "Status"
- Kolom "status aset" → template_activo.xlsx kolom "Status Aset"
- Kolom "vendor" konteks biaya → template_opex.xlsx kolom "vendor"
- Kolom "vendor" konteks aset/hardware → template_activo.xlsx (jika user sebut aset/hardware)
- Kolom "lokasi" tanpa keterangan → template_server.xlsx kolom "Lokasi Data Center"
- Kolom "lokasi fisik" atau "lokasi aset" → template_activo.xlsx kolom "Lokasi Fisik"
- Jika masih ambigu → pilih file yang paling relevan dengan konteks pertanyaan
- Kata "deployment" tanpa "type" → tetap merujuk ke kolom "Deployment_type" di template_aplikasi.xlsx, BUKAN template_server.xlsx
  Contoh: "deployment cloud" → column: "Deployment_type", file: "template_aplikasi.xlsx", value: "Cloud"
  Contoh: "deployment on-premise" → column: "Deployment_type", file: "template_aplikasi.xlsx", value: "On-Premise"

  `.trim();
}

async function saveChatHistory(question: string, answer: string, intent?: string) {
  try {
    await pool.query(
      "INSERT INTO chat_history (question, answer, intent) VALUES ($1, $2, $3)",
      [question, answer, intent || null]
    );
  } catch (err) {
    console.error("[ChatHistory] Gagal simpan:", err);
  }
}

async function getDBQualityIssues(fileNames: string[]): Promise<any[]> {
  try {
    if (!fileNames.length) return [];
    const placeholders = fileNames.map((_, i) => `$${i + 1}`).join(",");
    const result = await pool.query(
      `SELECT file_name, column_name, value, row_identifier, reason
       FROM data_quality_issues
       WHERE file_name = ANY(ARRAY[${placeholders}])
       ORDER BY created_at DESC`,
      fileNames
    );
    return result.rows.map(r => ({
      file: r.file_name,
      type: "Nilai Tidak Wajar",
      detail: `${r.row_identifier} — kolom "${r.column_name}": "${r.value}" (${r.reason})`,
    }));
  } catch (err) {
    console.warn("[QualityCheck] Gagal ambil dari DB:", err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body?.question || "").trim();

    if (!question) {
      return NextResponse.json(
        { success: false, error: "Question is required" },
        { status: 400 }
      );
    }

    // 1. Ambil chunks & schema
    const allChunks = await getChunks();
    const schemaMap = await getSchema(allChunks);

    console.log("[Schema]", formatSchemaForLLM(schemaMap));

    // 2. LLM TAHAP 1 — analisis pertanyaan
    console.log("[LLM Tahap 1] Menganalisis pertanyaan...");
    const rawInstructions = await askNovaJSON(buildAnalysisSystemPrompt(schemaMap), question);
    
    const rawList = Array.isArray(rawInstructions) ? rawInstructions : [rawInstructions];
    

    const INFO_KEYWORDS = ["info lengkap", "detail", "semua data", "semua info", "lengkap"];
    const questionLower = question.toLowerCase();
    const isInfoRequest = INFO_KEYWORDS.some((kw) => questionLower.includes(kw));

    const sumInstructions = rawList.filter((i: any) => i.operation === "sum");
    const nonSumInstructions = rawList.filter((i: any) => i.operation !== "sum" && i.operation !== "general");

    let instructions = rawList;

    if (isInfoRequest) {
      const entity = rawList.find((i: any) => i.entity)?.entity || null;
      const collapsed = {
        operation: "lookup",
        file: null,
        column: null,
        value: null,
        entity,
        reasoning: "Hardcode: info lengkap → lookup semua file sekaligus",
      };
      instructions = [collapsed] as any[];
      console.log("[Collapse] Info request di-collapse jadi 1 lookup:", collapsed);
    } else if (sumInstructions.length > 1) {
      const entityFromFilter = nonSumInstructions.find((i: any) => i.operation === "filter")?.value || null;
      const entityFromSum = sumInstructions[0]?.entity || null;
      const collapsed = {
        operation: "sum",
        file: sumInstructions[0]?.file || null,
        column: null,
        value: null,
        entity: entityFromSum || entityFromFilter,
        reasoning: "Collapsed: sum semua bulan sekaligus",
      };
      instructions = [...nonSumInstructions, collapsed];
      console.log("[Collapse] Sum di-collapse jadi 1 instruksi:", collapsed);
    }

    const hasFilter = instructions.some((i: any) => i.operation === "filter");
    if (hasFilter) {
      instructions = instructions.filter((i: any) => i.operation !== "list");
      console.log("[Collapse] List dihapus karena ada filter sebelumnya");
    }

    const topNMatch = questionLower.match(/top\s+(\d+)|(\d+)\s+teratas|(\d+)\s+terbesar|(\d+)\s+termahal/i);
if (topNMatch) {
  const n = parseInt(topNMatch[1] || topNMatch[2] || topNMatch[3] || topNMatch[4]);
  instructions = instructions.map((i: any) => {
    if (i.operation === "sum" && !i.sort) {
      return { ...i, sort: "desc", limit: n };
    }
    return i;
  });
}


    console.log("[LLM Tahap 1] Instruksi final:", instructions);

    // Auto-fix: kalau sum di activo dengan column Harga Perolehan
    const biayaKeywords = ["biaya", "cost", "opex", "pengeluaran", "maintenance"];
    const isBiayaQuery = biayaKeywords.some(kw => questionLower.includes(kw));

    instructions = instructions.map((i: any) => {
      if (
        i.operation === "sum" &&
        i.file?.toLowerCase().includes("activo") &&
        i.column?.toLowerCase().includes("harga") &&
        isBiayaQuery
      ) {
        console.log("[Auto-fix] Redirect sum dari activo ke opex karena query biaya");
        return {
          ...i,
          file: "template_opex.xlsx",
          column: null,
          entity: i.value || i.entity || null,
          value: null,
        };
      }
      return i;
    });

    // Data quality check
    const ruleBasedIssues = detectDataIssues(allChunks);
    const usedFileNames = [...new Set(
      allChunks.map(c => c.fileName.split("/").pop() || c.fileName)
    )];
    const dbIssues = await getDBQualityIssues(usedFileNames);
    const dataIssues = [...ruleBasedIssues, ...dbIssues];

    const invalidAppIds = new Set(
      dbIssues
        .filter(i =>
          i.detail.toLowerCase().includes('app_id') &&
          i.file.toLowerCase().includes('template_server.xlsx')
        )
        .map(i => {
          const match = i.detail.match(/^([^\s—]+)/);
          return match ? match[1].toLowerCase().trim() : "";
        })
        .filter(Boolean)
    );
    console.log("[Debug] invalidAppIds:", [...invalidAppIds]);

    const validChunks = invalidAppIds.size > 0
      ? allChunks.filter(chunk => {
          const appId = String(chunk.row["App_ID"] || chunk.row["app_id"] || "").toLowerCase().trim();
          return !invalidAppIds.has(appId);
        })
      : allChunks;

    // 3. Eksekusi instruksi BERURUTAN
    let workingChunks = [...validChunks];
    let engineResult: any = null;

    const filterInstructions = instructions.filter((i: any) => i.operation === "filter");

    // Cek apakah parallel filter (kolom & file sama)
    const isParallelFilter =
      filterInstructions.length > 1 &&
      filterInstructions.every(
        (i: any) => i.column === filterInstructions[0].column && i.file === filterInstructions[0].file
      );

    // ===== BARU: Cek multi-filter beda kolom =====
    const isMultiColumnFilter =
      filterInstructions.length > 1 && !isParallelFilter;

    if (isMultiColumnFilter) {
      const isAND = filterInstructions.some((i: any) => i.logic === "AND");
      console.log(`[Engine] Multi-column filter terdeteksi — mode: ${isAND ? "AND" : "OR"}`);

      if (isAND) {
        // AND beda kolom: intersect App_ID dari semua filter
        console.log("[Engine] AND multi-column intersect");
        let intersectedIds: Set<string> | null = null;

        for (const instruction of filterInstructions) {
          console.log("[Engine] Executing (AND multi-col):", instruction);
          const result = executeInstruction(allChunks, instruction, allChunks);
          console.log("[Engine]", result.summary);
          const ids = new Set(
            (result.items || []).map((item: any) =>
              String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim()
            ).filter(Boolean)
          );
          intersectedIds = intersectedIds === null
            ? ids
            : new Set([...(intersectedIds as Set<string>)].filter(id => ids.has(id)));
        }

        const validIds = intersectedIds || new Set<string>();
        console.log(`[Engine] AND intersect result: ${validIds.size} App_ID`);

        if (validIds.size === 0) {
          engineResult = { items: [], totalCount: 0, summary: "Tidak ada data yang memenuhi semua kondisi." };
        } else {
          workingChunks = allChunks.filter(c =>
            validIds.has(String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase().trim())
          );

          // Jalankan filter pertama lagi untuk ambil full item data
          const firstResult = executeInstruction(workingChunks, filterInstructions[0], allChunks);
          engineResult = {
            items: firstResult.items,
            totalCount: validIds.size,
            summary: `Ditemukan ${validIds.size} aplikasi yang memenuhi semua kondisi.`,
          };
        }

      } else {
        // OR beda kolom: gabung App_ID dari semua filter
        console.log("[Engine] OR multi-column union");
        const mergedItemsMap = new Map<string, any>();
        let totalBarisOR = 0;

        for (const instruction of filterInstructions) {
          console.log("[Engine] Executing (OR multi-col):", instruction);
          const result = executeInstruction(allChunks, instruction, allChunks);
          console.log("[Engine]", result.summary);
          totalBarisOR += result.totalRows || result.totalCount || 0;

          for (const item of result.items || []) {
            const itemAppId = String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim();
            const key = itemAppId || JSON.stringify(item);
            if (!mergedItemsMap.has(key)) {
              mergedItemsMap.set(key, { ...item });
            } else {
              const existing = mergedItemsMap.get(key)!;
              for (const [k, v] of Object.entries(item)) {
                if (!v || v === "-" || v === "") continue;
                if (!existing[k] || existing[k] === "-" || existing[k] === "") {
                  existing[k] = v;
                } else if (String(existing[k]) !== String(v)) {
                  const existingVals = String(existing[k]).split(", ").map((x: string) => x.trim());
                  const newVals = String(v).split(", ").map((x: string) => x.trim());
                  existing[k] = [...new Set([...existingVals, ...newVals])].filter(Boolean).join(", ");
                }
              }
            }
          }
        }

        const mergedItems = Array.from(mergedItemsMap.values());
        engineResult = {
          items: mergedItems,
          totalCount: mergedItems.length,
          summary: `Ditemukan ${mergedItems.length} aplikasi unik (${totalBarisOR} baris data) dengan filter OR.`,
        };

        if (mergedItems.length > 0) {
          const foundAppIds = new Set(
            mergedItems.map((item: any) =>
              String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim()
            ).filter(Boolean)
          );
          workingChunks = allChunks.filter((chunk) => {
            const chunkAppId = String(chunk.row["App_ID"] || chunk.row["app_id"] || "").toLowerCase().trim();
            return foundAppIds.has(chunkAppId);
          });
        }
      }

      // Eksekusi instruksi non-filter setelah multi-column filter
      for (const instruction of instructions.filter((i: any) => i.operation !== "filter")) {
        if (instruction.operation === "general" && !instruction.file && !instruction.column && !instruction.value && !instruction.entity) continue;
        console.log("[Engine] Executing (post multi-col filter):", instruction);
        const stepResult = executeInstruction(workingChunks, instruction, allChunks);
        if (instruction.operation === "count") {
          engineResult = {
            ...engineResult,
            summary: stepResult.summary,
            totalCount: stepResult.totalCount,
          };
        } else {
          engineResult = stepResult;
        }
        console.log("[Engine]", engineResult.summary);
      }

    } else if (isParallelFilter) {
      // ===== EXISTING: Parallel filter kolom sama =====
      const isAND = filterInstructions.some((i: any) => i.logic === "AND");

      if (isAND) {
        console.log("[Engine] AND intersect terdeteksi");
        let intersectedIds: Set<string> | null = null;

        for (const instruction of filterInstructions) {
          console.log("[Engine] Executing (AND):", instruction);
          const result = executeInstruction(allChunks, instruction, allChunks);
          console.log("[Engine]", result.summary);
          const ids = new Set(
            (result.items || []).map((item: any) =>
              String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim()
            ).filter(Boolean)
          );
          intersectedIds = intersectedIds === null
            ? ids
            : new Set([...(intersectedIds as Set<string>)].filter(id => ids.has(id)));
        }

        const validIds = intersectedIds || new Set<string>();
        const intersectedItems = [...validIds]
          .map(id => workingChunks.find(c =>
            String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase().trim() === id
          ))
          .filter(Boolean)
          .map((c: any) => ({ ...c.row, fileName: c.fileName, rowNumber: c.rowNumber }));

        if (intersectedItems.length === 0) {
          console.log("[Engine] AND intersect kosong — fallback ke OR");
        } else {
          engineResult = {
            items: intersectedItems,
            totalCount: intersectedItems.length,
            summary: `Ditemukan ${intersectedItems.length} item (AND intersect).`,
          };
          workingChunks = allChunks.filter(c =>
            validIds.has(String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase().trim())
          );
          for (const instruction of instructions.filter((i: any) => i.operation !== "filter")) {
            if (instruction.operation === "general" && !instruction.file && !instruction.column && !instruction.value && !instruction.entity) continue;
            console.log("[Engine] Executing (post-AND):", instruction);
            engineResult = executeInstruction(workingChunks, instruction, allChunks);
            console.log("[Engine]", engineResult.summary);
          }
        }
      }

      if (!isAND || engineResult === null) {
        console.log("[Engine] Parallel filter terdeteksi — menggabungkan hasil (OR)");
        const mergedItemsMap = new Map<string, any>();
        let totalBarisOR = 0;
        for (const instruction of filterInstructions) {
          console.log("[Engine] Executing (parallel):", instruction);
          const result = executeInstruction(allChunks, instruction, allChunks);
          console.log("[Engine]", result.summary);
          totalBarisOR += result.totalRows || result.totalCount || 0;

          for (const item of result.items || []) {
            const itemAppId = String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim();
            const isInWorkingChunks = workingChunks.some(c =>
              String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase().trim() === itemAppId
            );
            if (isInWorkingChunks) {
              const key = itemAppId || JSON.stringify(item);
              if (!mergedItemsMap.has(key)) {
                mergedItemsMap.set(key, { ...item });
              } else {
                const existing = mergedItemsMap.get(key)!;
                for (const [k, v] of Object.entries(item)) {
                  if (!v || v === "-" || v === "") continue;
                  if (!existing[k] || existing[k] === "-" || existing[k] === "") {
                    existing[k] = v;
                  } else if (String(existing[k]) !== String(v)) {
                    const existingVals = String(existing[k]).split(", ").map((x: string) => x.trim());
                    const newVals = String(v).split(", ").map((x: string) => x.trim());
                    existing[k] = [...new Set([...existingVals, ...newVals])].filter(Boolean).join(", ");
                  }
                }
              }
            }
          }
          engineResult = result;
        }

        const mergedItems = Array.from(mergedItemsMap.values());
        const realMultiLokasi = mergedItems.filter((item: any) => {
          const lokasi = String(item["Lokasi Data Center"] || "");
          if (!lokasi.includes(",")) return false;
          const vals = lokasi.split(",").map((v: string) => v.trim());
          const uniqueVals = new Set(vals);
          return uniqueVals.size > 1;
        });
        const duplikatBaris = mergedItems.filter((item: any) => {
          const lokasi = String(item["Lokasi Data Center"] || "");
          if (!lokasi.includes(",")) return false;
          const vals = lokasi.split(",").map((v: string) => v.trim());
          const uniqueVals = new Set(vals);
          return uniqueVals.size === 1;
        }).length;
        const duplikatNote = duplikatBaris > 0 ? ` (termasuk ${duplikatBaris} baris duplikat lokasi)` : "";

        const selisihNote = totalBarisOR > mergedItems.length + realMultiLokasi.length
          ? " Selisih baris lainnya merupakan data dengan lokasi yang sama."
          : "";
        const multiLokasiNote = realMultiLokasi.length > 0
          ? `, ${realMultiLokasi.length} aplikasi memiliki server di lebih dari 1 lokasi.`
          : ".";
        const filterLabels = filterInstructions
          .map((i: any) => i.value)
          .filter(Boolean)
          .join(" atau ");

        engineResult = {
          ...engineResult,
          items: mergedItems,
          totalCount: mergedItems.length,
          summary: `Ditemukan ${mergedItems.length} aplikasi unik dari ${totalBarisOR} baris data${multiLokasiNote}${selisihNote}${filterLabels ? ` (filter: ${filterLabels})` : ""}`,
        };


        if (mergedItems.length > 0) {
          const foundAppIds = new Set(
            mergedItems.map((item: any) =>
              String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim()
            ).filter(Boolean)
          );
          workingChunks = allChunks.filter((chunk) => {
            const chunkAppId = String(chunk.row["App_ID"] || chunk.row["app_id"] || "").toLowerCase().trim();
            return foundAppIds.has(chunkAppId);
          });
        }

        for (const instruction of instructions.filter((i: any) => i.operation !== "filter")) {
          if (instruction.operation === "general" && !instruction.file && !instruction.column && !instruction.value && !instruction.entity) {
            console.log("[Engine] Skipping general — semua null");
            continue;
          }
          console.log("[Engine] Executing (post-parallel):", instruction);
          engineResult = executeInstruction(workingChunks, instruction, allChunks);
          console.log("[Engine]", engineResult.summary);
        }
      }

    } else {
      // ===== EXISTING: Single filter atau instruksi berurutan =====
      for (const instruction of instructions) {
        if (instruction.operation === "filter" && !instruction.value && !instruction.entity && !(instruction as any).sort) {
          console.log("[Engine] Skipping — no value/entity");
          continue;
        }
        if (instruction.operation === "list" && !instruction.column) {
          console.log("[Engine] Skipping list — no column");
          continue;
        }
        if (instruction.operation === "general" && !instruction.file && !instruction.column && !instruction.value && !instruction.entity) {
          console.log("[Engine] Skipping general — semua null");
          continue;
        }

        const isSumWithPreviousFilter =
          instruction.operation === "sum" &&
          instruction.file &&
          !instruction.entity &&
          !instruction.value &&
          workingChunks.length < validChunks.length;

        if (isSumWithPreviousFilter) {
          const filteredAppIds = new Set(
            workingChunks
              .map(c => String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase().trim())
              .filter(Boolean)
          );
          const modifiedInstruction = {
            ...instruction,
            value: [...filteredAppIds].join(","),
          };
          console.log("[Engine] Executing (sum after filter):", modifiedInstruction);
          engineResult = executeInstruction(allChunks, modifiedInstruction, allChunks);
          } else {
            console.log("[Engine] Executing:", instruction);
            const chunksForInstruction = instruction.operation === "sum"
              ? allChunks
              : workingChunks;
            const stepResult = executeInstruction(chunksForInstruction, instruction, allChunks);
            if (instruction.operation === "count") {
              engineResult = {
                ...engineResult,
                summary: stepResult.summary,
                totalCount: stepResult.totalCount,
              };
            } else if (instruction.operation === "lookup" && engineResult?.aggregated) {
              // Jangan timpa aggregated yang sudah ada dari sum
              engineResult = {
                ...stepResult,
                aggregated: engineResult.aggregated,
                totalCount: engineResult.totalCount,
              };
            } else {
              engineResult = stepResult;
            }
          }
        console.log("[Engine]", engineResult.summary);

        if (engineResult.items && engineResult.items.length > 0) {
          const foundAppIds = new Set(
            engineResult.items.map((item: any) =>
              String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim()
            ).filter(Boolean)
          );
          workingChunks = allChunks.filter((chunk) => {
            const chunkAppId = String(chunk.row["App_ID"] || chunk.row["app_id"] || "").toLowerCase().trim();
            return foundAppIds.has(chunkAppId);
          });
        }
      }
    }

    if (!engineResult) {
        engineResult = { summary: "Tidak ada instruksi yang dieksekusi.", totalCount: 0, items: [], aggregated: null };
      }

    const isGeneralOnly = instructions.every((i: any) => i.operation === "general");
    const isNoData =
      !isGeneralOnly &&
      engineResult !== null &&
      (engineResult.totalCount === 0 || engineResult.totalCount === undefined) &&
      (!engineResult.items || engineResult.items.length === 0) &&
      !engineResult.aggregated;

    if (isNoData) {
      const availableFiles =
        allChunks.length > 0
          ? [...new Set(allChunks.map((c) => c.fileName.split("/").pop() || c.fileName))].join(", ")
          : "tidak ada file yang diunggah";
      const answer = `Data yang diminta tidak ditemukan di file Excel yang tersedia (${availableFiles}). Pastikan data sudah diunggah dan tersedia di sistem.`;
      await saveChatHistory(question, answer, instructions[0]?.operation);
      return NextResponse.json({
        success: true,
        answer,
        dataIssues: [],
        intent: instructions[0]?.operation,
        sources: [],
      });
    }

    // Filter issues hanya dari file yang dipakai
    const usedFiles = new Set(
      instructions
        .map((i: any) => i.file)
        .filter(Boolean)
    );
    const relevantIssues = usedFiles.size > 0
      ? dataIssues.filter(i =>
          [...usedFiles].some(f => i.file.toLowerCase().includes(f.toLowerCase()))
        )
      : dataIssues;

    // 4. Untuk sum — bypass LLM
    const isSumOperation = instructions.some((i: any) => i.operation === "sum");
    const isCountOperation = instructions.some((i: any) => i.operation === "count");
    const hasFilterAlso = instructions.some((i: any) => i.operation === "filter");



    if (isSumOperation && engineResult?.aggregated) {
      const agg = engineResult.aggregated;
      const entity = instructions.find((i: any) => i.operation === "sum")?.entity;
      const entityLabel = entity ? ` untuk "${entity}"` : "";

      const monthOrder = ["Januari","Febuari","Februari","Maret","April","Mei","Juni",
        "Juli","Agustus","September","Oktober","November","Desember"];

      const monthlyMap: Record<string, number> = {};
      if (engineResult.items && engineResult.items.length > 0) {
        for (const item of engineResult.items) {
          for (const col of (agg.columns || [])) {
            const matchedKey = Object.keys(item).find(
              (k) => k.trim().toLowerCase() === col.trim().toLowerCase()
            );
            if (matchedKey) {
              const val = Number(item[matchedKey]);
              if (!isNaN(val) && val > 0) {
                monthlyMap[col.trim()] = (monthlyMap[col.trim()] || 0) + val;
              }
            }
          }
        }
      }

      const monthLines = monthOrder
        .filter((m) => monthlyMap[m])
        .map((m) => `- ${m}: Rp ${monthlyMap[m].toLocaleString("id-ID")}`);

      const breakdownText = monthLines.length > 0
        ? `\n\nRincian per bulan${entityLabel}:\n${monthLines.join("\n")}`
        : "";

      const sourceFile = engineResult.items?.[0]?.fileName || "uploads/template_opex.xlsx";

      const hasLookup = instructions.some((i: any) => i.operation === "lookup");
      const hasFilter = instructions.some((i: any) => i.operation === "filter");

      // Hanya tampil info aplikasi kalau entity adalah App_ID atau nama aplikasi spesifik
      const isSpecificApp = entity && (
        /^app[\s_-]?id[\s_-]?\d+$/i.test(entity.trim()) ||
        allChunks.some(c =>
          String(c.row["Application_Name"] || c.row["Nama Aplikasi"] || "")
            .toLowerCase().trim() === entity.toLowerCase().trim()
        )
      );

      let extraInfo = "";
      if ((hasLookup || hasFilter) && isSpecificApp) {
        const lookupResult = executeInstruction(allChunks, {
          operation: "lookup",
          file: undefined,
          column: undefined,
          value: undefined,
          entity: entity,
          reasoning: "Auto lookup untuk info tambahan bersamaan dengan sum",
        }, allChunks);

        if (lookupResult.items && lookupResult.items.length > 0) {
          const item = lookupResult.items[0];
          const EXTRA_KEYS = ["App_Owner", "App Owner", "app_owner", "App Manager", "Unit Of App Owner", "LOB", "Status", "Application_Name"];
          const extraParts = EXTRA_KEYS
            .filter(k => item[k] && item[k] !== "-" && item[k] !== "")
            .map(k => `${k}: ${item[k]}`);
          if (extraParts.length > 0) {
            extraInfo = `\n\nInfo aplikasi${entityLabel}:\n${extraParts.join("\n")}`;
          }
        }
      }



      // Auto-detect nama aplikasi untuk kasus sort+limit
const sortInstruction = instructions.find((i: any) => i.operation === "sum" && (i as any).sort);
console.log("[Debug] sortInstruction:", sortInstruction);
console.log("[Debug] instructions at rankingList:", JSON.stringify(instructions));
const isRanking = !!sortInstruction;
const rankingLimit = (sortInstruction as any)?.limit || 1;

let appNameLabel = entityLabel;
if (!entityLabel && engineResult.items && engineResult.items.length === 1) {
  const firstItem = engineResult.items[0];
  const appId = String(firstItem["App_ID"] || firstItem["app_id"] || "");
  const appName = firstItem["Application_Name"] || firstItem["Nama Aplikasi"] || "";
  if (!appName && appId) {
    const found = allChunks.find(c =>
      String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase() === appId.toLowerCase() &&
      (c.row["Application_Name"] || c.row["Nama Aplikasi"])
    );
    if (found) {
      const name = found.row["Application_Name"] || found.row["Nama Aplikasi"];
      appNameLabel = ` untuk "${name}"`;
    }
  } else if (appName) {
    appNameLabel = ` untuk "${appName}"`;
  }
}

// Untuk ranking (sort+limit > 1) — breakdown per bulan di header dihilangkan
// tampil di card per aplikasi saja
const showMonthlyBreakdown = !isRanking || rankingLimit === 1;
const breakdownFinal = showMonthlyBreakdown ? breakdownText : "";

// Untuk ranking > 1 — build preformattedList dengan total per aplikasi
let rankingList = "";
const isPerAppQuery = ["per aplikasi", "masing-masing", "setiap aplikasi", "tiap aplikasi"]
  .some(kw => questionLower.includes(kw));
const isAllApps = !instructions.find((i: any) => i.operation === "sum")?.entity && 
                  !instructions.find((i: any) => i.operation === "sum")?.value &&
                  engineResult.items?.length > 1;
if ((isRanking || hasFilter || (isPerAppQuery && isAllApps)) && engineResult.items && engineResult.items.length > 0) {
  rankingList = engineResult.items.map((item: any, i: number) => {
    const appId = String(item["App_ID"] || item["app_id"] || "-");
    const found = allChunks.find(c =>
      String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase() === appId.toLowerCase() &&
      (c.row["Application_Name"] || c.row["Nama Aplikasi"])
    );
    const name = found?.row["Application_Name"] || found?.row["Nama Aplikasi"] || item["Application_Name"] || "-";
    const totalFmt = `Rp ${(item.total || 0).toLocaleString("id-ID")}`;
    const monthOrder = ["Januari","Febuari","Februari","Maret","April","Mei","Juni",
      "Juli","Agustus","September","Oktober","November","Desember"];
    const monthParts = monthOrder
      .filter(m => item[m] && Number(item[m]) > 0)
      .map(m => `${m}: Rp ${Number(item[m]).toLocaleString("id-ID")}`);
    return `${i + 1}. App_ID: ${appId} | Nama Aplikasi: ${name} | Total: ${totalFmt}${monthParts.length ? " | " + monthParts.join(" | ") : ""}`;
  }).join("\n");
}


console.log("[Debug] rankingList:", rankingList);
console.log("[Debug] engineResult.items length:", engineResult.items?.length);
console.log("[Debug] engineResult.items[0]:", JSON.stringify(engineResult.items?.[0]));
const answer = `Total biaya${appNameLabel}: ${agg.totalFormatted} dari ${engineResult.totalCount} item.${breakdownFinal}${extraInfo}\n\nSumber: ${sourceFile}${rankingList ? "\n\n" + rankingList : ""}`;


      await saveChatHistory(question, answer, instructions[0]?.operation);
      return NextResponse.json({
        success: true,
        answer,
        dataIssues: relevantIssues,
        intent: instructions[0]?.operation,
        reasoning: instructions[0]?.reasoning,
        engineSummary: engineResult?.summary,
        sources: [],
      });
    }

// Handle average — bypass LLM Tahap 2
const isAverageOperation = instructions.some((i: any) => i.operation === "average");
if (isAverageOperation && engineResult?.aggregated) {
  const agg = engineResult.aggregated;
  let answer = "";

  if (agg.groupBy && engineResult.items?.length > 0) {
    const lines = engineResult.items.map((item: any, i: number) => {
    const groupKey = Object.keys(item).find(k => k !== "average" && k !== "averageFormatted" && k !== "count");
    const group = groupKey ? item[groupKey] : "-";
    return `${i + 1}. ${group}: ${item.averageFormatted} (dari ${item.count} item)`;
  }).join("\n");
  answer = `Rata-rata ${agg.column} per ${agg.groupBy}:\n\n${lines}`;


  } else {
    answer = `Rata-rata ${agg.column}: ${agg.averageFormatted} dari ${agg.count} item.`;
  }

  await saveChatHistory(question, answer, "average");
  return NextResponse.json({
    success: true,
    answer,
    dataIssues: relevantIssues,
    intent: "average",
    sources: [],
  });
}

    console.log("[Debug] engineResult.summary:", engineResult?.summary);

    // 5. Untuk non-sum — ambil relevant chunks lalu LLM Tahap 2
    const contextChunks = workingChunks.length > 0 ? workingChunks : allChunks;
    const relevantChunks = retrieveRelevantChunks(question, contextChunks, 500);

    const engineAppIds = new Set(
      (engineResult?.items || [])
        .map((item: any) => String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim())
        .filter(Boolean)
    );
    const filteredRelevantChunks = engineAppIds.size > 0
      ? relevantChunks.filter(c =>
          engineAppIds.has(String(c.row["App_ID"] || c.row["app_id"] || "").toLowerCase().trim())
        )
      : relevantChunks;

    console.log("[Debug] filteredRelevantChunks count:", filteredRelevantChunks.length);
    console.log("[Debug] engineAppIds:", [...engineAppIds]);
    console.log("[Debug] relevantChunks sample lokasi:", relevantChunks.slice(0,3).map(c => c.row["Lokasi Data Center"]));
    console.log("[Debug] Item Lokasi:", engineResult.items?.[0]?.["Lokasi Data Center"]);

    let preformattedList = "";
    if (engineResult.items && engineResult.items.length > 0) {
      const EXCLUDE_KEYS = new Set([
        "App_ID", "app_id", "Application_Name", "fileName",
        "rowNumber", "Nama Aplikasi", "total", "formatted",
      ]);
      const PRIORITY_KEYS = [
        "Host name", "Hostname", "hostname", "host name",
        "Status", "status",
        "Lokasi Data Center", "lokasi data center",
        "vendor", "Vendor",
        "asset name", "asset code",
        "Importance rank risk", "Importance Rank",
        "Date_Live", "Date_LIve",  
        "Date_Decom",          
      ];
      const isMostFrequent = instructions.some((i: any) => i.operation === "most_frequent");
      preformattedList = engineResult.items
        .sort((a: any, b: any) => {
          const aNum = parseInt(String(a.App_ID || a.app_id || "").replace(/\D/g, "")) || 0;
          const bNum = parseInt(String(b.App_ID || b.app_id || "").replace(/\D/g, "")) || 0;
          return aNum - bNum;
        })
        .map((item: any, i: number) => {
          if (isMostFrequent) {
            const col = Object.keys(item).find(k => k !== "count" && k !== "fileName");
            const val = col ? item[col] : "-";
            return `${i + 1}. ${val} — ${item.count} Aplikasi`;
          }
          const name = item.Application_Name || item["Nama Aplikasi"] || item["asset name"] || "-";
          const appId = [...new Set(
            String(item.App_ID || item.app_id || "-")
              .split(",")
              .map((s: string) => s.trim())
          )].join(", ");
          const priorityParts = PRIORITY_KEYS
            .filter((k) => item[k] && item[k] !== "-" && item[k] !== "")
            .map((k) => `${k}: ${item[k]}`);
          const isLookup = instructions.some((i: any) => i.operation === "lookup");
          const otherParts = Object.entries(item)
            .filter(([k]) => !EXCLUDE_KEYS.has(k) && !PRIORITY_KEYS.includes(k))
            .filter(([, v]) => v && v !== "-" && v !== "")
            .slice(0, isLookup ? 999 : Math.max(0, 5 - priorityParts.length))
            .map(([k, v]) => `${k}: ${v}`);
          const extra = [...priorityParts, ...otherParts].join(" | ");
          return `${i + 1}. ${appId} — ${name}${extra ? ` | ${extra}` : ""}`;
        })
        .join("\n");
    }


    console.log("[Debug] preformattedList:", preformattedList);
    console.log("[Debug] engineResult.items[0] keys:", Object.keys(engineResult.items?.[0] || {}));

    const isSpecificColumnQuery = ["hostname", "host name", "lokasi"].some(kw => questionLower.includes(kw));
    const isSingleEntity = engineResult?.totalCount === 1;

    if (preformattedList && isSpecificColumnQuery && isSingleEntity) {
      const answer = `Berikut data untuk aplikasi yang ditanyakan:\n\n${preformattedList}`;
      await saveChatHistory(question, answer, instructions[0]?.operation);
      return NextResponse.json({
        success: true,
        answer,
        dataIssues: relevantIssues,
        intent: instructions[0]?.operation,
        sources: [],
      });
    }

    console.log("[Debug] preformattedList sample:", preformattedList.slice(0, 200));
    const isLokasiQuery = ["lokasi", "data center", "server di", "dimana", "di mana"].some(kw => questionLower.includes(kw));
    if (preformattedList && engineResult?.summary?.includes("memiliki server di lebih dari 1 lokasi") && isLokasiQuery) {
      const answer = `${engineResult.summary}\n\n${preformattedList}`;
      await saveChatHistory(question, answer, instructions[0]?.operation);
      return NextResponse.json({
        success: true,
        answer,
        dataIssues: relevantIssues,
        intent: instructions[0]?.operation,
        sources: [],
      });
    }

    if (!filteredRelevantChunks.length && !engineResult?.totalCount) {
      return NextResponse.json({
        success: true,
        answer: "Saya tidak menemukan data pendukung di file Excel yang tersedia.",
        sources: [],
      });
    }

    const systemPrompt = buildSystemPrompt(schemaMap);
    // Tambah context filter ke question untuk LLM Tahap 2
    const filterContext = engineResult?.summary?.match(/\(filter: ([^)]+)\)/)?.[1];
    const filterColumns = filterInstructions
      .map((i: any) => i.column)
      .filter(Boolean);
    const questionWithContext = filterContext 
      ? `${question} (Catatan: hasil filter mencakup nilai: ${filterContext})`
      : question;

    const userPrompt = buildUserPrompt(questionWithContext, filteredRelevantChunks, engineResult, preformattedList || undefined);
    const maxTokens = preformattedList ? 1000 : 2000;
    const answer = await askNova({ systemPrompt, userPrompt, maxTokens });
    const finalAnswer = preformattedList ? `${answer}\n\n${preformattedList}` : answer;
    await saveChatHistory(question, finalAnswer, instructions[0]?.operation);
    return NextResponse.json({
      success: true,
      answer: preformattedList ? `${answer}\n\n${preformattedList}` : answer,
      filterContext: filterContext || null,
      dataIssues: relevantIssues,
      intent: instructions[0]?.operation,
      reasoning: instructions[0]?.reasoning,
      engineSummary: engineResult?.summary,
      sources: filteredRelevantChunks.slice(0, 20).map((chunk) => ({
        fileName: chunk.fileName,
        sheetName: chunk.sheetName,
        rowNumber: chunk.rowNumber,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}