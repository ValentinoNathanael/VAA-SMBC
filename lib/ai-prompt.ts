import type { ExcelChunk } from "./excel-parser";
import type { EngineResult } from "./excel-engine";
import type { SchemaMap } from "./schema-detector";
import { formatSchemaForLLM } from "./schema-detector";

export function buildSystemPrompt(schemaMap?: SchemaMap) {
  const schemaSection = schemaMap
    ? `
STRUKTUR DATA EXCEL YANG TERSEDIA:
${formatSchemaForLLM(schemaMap)}

PENTING: Gunakan informasi struktur di atas untuk memahami:
- File mana yang berisi data yang dibutuhkan
- Kolom mana yang tepat untuk menjawab pertanyaan
- Tipe data setiap kolom (text/number/date)
- App_ID adalah penghubung antar semua file
`
    : "";

  return `
Kamu adalah asisten AI internal untuk membaca dan menganalisis data dari file Excel perusahaan.

ATURAN UTAMA:
- Jawab HANYA berdasarkan konteks yang diberikan.
- Jangan gunakan pengetahuan umum di luar konteks.
- Jika data tidak ditemukan, jawab: "Saya tidak menemukan data pendukung di file Excel yang tersedia."
- Jika nilai suatu field adalah "-" atau kosong dalam data yang diberikan, jawab dengan "tidak ada data" atau "-". JANGAN mengisi dengan nilai dari aplikasi atau baris lain.
- Kolom LOB dan Unit Of App Owner memiliki beberapa nilai yang sama. Jika user bertanya berdasarkan nama yang bisa merujuk ke salah satu dari kedua kolom tersebut tanpa menyebut kolom secara spesifik, tanyakan dulu: "Maksudnya dari sisi LOB (lini bisnis yang dilayani aplikasi) atau Unit Of App Owner (divisi/unit bisnis pemilik aplikasi)?"
${schemaSection}
KEMAMPUAN ANALISIS:
- Kamu bisa menggabungkan data dari beberapa file Excel sekaligus menggunakan App_ID sebagai penghubung.
- Gunakan schema di atas untuk menentukan file dan kolom yang tepat.
- Jika pertanyaan membutuhkan data dari beberapa file, sebutkan semua sumbernya.

FORMAT JAWABAN:
- Jawab ringkas, jelas, dan faktual.
- Jika data berbentuk angka/biaya, tampilkan dengan format yang mudah dibaca (contoh: Rp 15.000.000).
- Jika ada DAFTAR DATA yang sudah disiapkan sistem, JANGAN tulis ulang — cukup buat intro dan kesimpulan.
- Selalu sebutkan sumber file dan kolom yang digunakan.
- Jika user minta "info lengkap" atau "semua data" → tampilkan semua kolom.
- Jika user tanya spesifik → tampilkan kolom yang relevan saja.
- Jangan skip kolom yang secara eksplisit ditanyakan user.
- Jika user tanya 1 kolom spesifik (contoh: "hostname", "status", "lokasi"), jawab intro HANYA sebutkan nilai kolom yang ditanya saja. Jangan sebut kolom lain di intro. JANGAN jawab dengan nama aplikasi jika yang ditanya adalah kolom lain. Contoh benar: "Hostname App_ID025 adalah host44.example.com". Contoh salah: "Hostname App_ID025 adalah SMBC_Backoffice_System".
- - Jika user tanya nilai dari kolom tertentu (contoh: "nomor urut", "harga perolehan", "status aset"), 
  SELALU ambil nilai dari kolom tersebut di data — JANGAN hitung atau asumsikan sendiri.
  Contoh: "nomor urut App_ID210" → cari nilai kolom "Nomor urut" di data App_ID210, BUKAN angka 210.

  `.trim();
}

export function buildContextText(chunks: ExcelChunk[]) {
  if (!chunks.length) return "Tidak ada konteks.";

  const grouped: Record<string, ExcelChunk[]> = {};
  for (const chunk of chunks) {
    const key = chunk.fileName;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(chunk);
  }

  return Object.entries(grouped)
    .map(([fileName, fileChunks]) => {
      const chunkTexts = fileChunks
        .map((chunk, index) => {
          return `  [Data ${index + 1} - Sheet: ${chunk.sheetName}, Row: ${chunk.rowNumber}]\n  ${chunk.chunkText}`;
        })
        .join("\n\n");
      return `=== FILE: ${fileName} ===\n${chunkTexts}`;
    })
    .join("\n\n");
}

export function buildUserPrompt(
  question: string,
  chunks: ExcelChunk[],
  engineResult?: EngineResult,
  preformattedList?: string
) {
  const fileNames = [...new Set(chunks.map((c) => c.fileName))];

const engineSection = engineResult
  ? `
[HASIL KALKULASI DARI SISTEM]
${engineResult.summary}
${engineResult.totalCount !== undefined ? `Total: ${engineResult.totalCount} item` : ""}

${engineResult.items && engineResult.items.length > 0 && engineResult.items.length <= 5
  ? `\nData terverifikasi:\n${engineResult.items.map((item: any) => {
      const appId = item["App_ID"] || item["app_id"] || "";
      const nama = item["Application_Name"] || item["Nama Aplikasi"] || "";
      const details = Object.entries(item)
        .filter(([k]) => !["App_ID", "app_id", "Application_Name", "Nama Aplikasi", "fileName", "rowNumber", "total", "formatted"].includes(k))
        .filter(([, v]) => v && v !== "-" && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return `- ${appId} ${nama}: ${details}`;
    }).join("\n")}`
  : ""
}

${
  engineResult.aggregated
    ? `\nDetail agregasi:\n${JSON.stringify(engineResult.aggregated, null, 2)}`
    : ""
}
`
  : "";

  const konteksSection = preformattedList
    ? `
[RINGKASAN DATA]
${engineResult?.summary ?? "Data telah diproses oleh sistem."}
Total item: ${engineResult?.totalCount ?? 0}
`
    : `
[KONTEKS DATA]
${buildContextText(chunks)}
`;

  return `
[PERTANYAAN USER]
${question}

[SUMBER DATA: ${fileNames.join(", ")}]
${engineSection}
${konteksSection}

[INSTRUKSI]
${
  preformattedList
    ? `${engineResult?.summary?.includes("memiliki server di lebih dari 1 lokasi") 
  ? `Tulis TEPAT 2 kalimat intro singkat. Kalimat 1: sebutkan HANYA angka jumlah aplikasi unik dan total baris data. Kalimat 2: sebutkan HANYA angka berapa aplikasi yang memiliki server di lebih dari 1 lokasi. DILARANG menulis daftar App_ID, nama aplikasi, nama aset, nama file, nama kolom, atau data apapun selain angka di intro. Contoh yang benar: 'Ditemukan 87 aplikasi unik (97 baris data). 10 aplikasi memiliki server di lebih dari 1 lokasi.'`
  : `Tulis HANYA 1 kalimat intro singkat maksimal 15 kata. Jika user tanya kolom spesifik (hostname, status, lokasi, dll), sebutkan NILAI kolom tersebut di intro, BUKAN nama aplikasi. DILARANG menulis [DAFTAR DATA], [SUMBER DATA], nama App_ID, nama aset, atau data apapun selain nilai yang ditanya di intro. Contoh intro untuk filter/list: 'Berikut adalah aplikasi dengan lokasi data center di Bandung atau Bangka.' Contoh intro untuk kolom spesifik: 'Hostname dari App_ID025 adalah host44.example.com.'`
}`
    : "JANGAN gunakan angka dari nama App_ID sebagai jawaban nilai kolom — SELALU ambil nilai dari kolom data yang tersedia.PRIORITASKAN [HASIL KALKULASI DARI SISTEM] — jika ada info lokasi, angka, atau data spesifik di sana, gunakan itu sebagai acuan utama, bukan dari KONTEKS DATA. Jawab pertanyaan berdasarkan HASIL KALKULASI dan KONTEKS DATA yang diberikan. Gunakan schema yang ada di system prompt untuk memahami struktur data. Jika data dari beberapa file, gabungkan menggunakan App_ID."
}
  `.trim();
}