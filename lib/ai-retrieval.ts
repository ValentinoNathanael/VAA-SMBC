import type { ExcelChunk } from "./excel-parser";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const SYNONYMS: Record<string, string[]> = {
  // Status aplikasi
  aktif: ["active", "running", "online", "up", "status"],
  mati: ["inactive", "down", "offline", "stopped", "decommissioned", "decom"],
  nonaktif: ["inactive", "decommissioned", "decom"],
  pensiun: ["decommissioned", "decom", "retired"],

  // Aplikasi & server
  aplikasi: ["app", "application", "service", "app_id", "application_name"],
  server: ["host", "hostname", "host name", "node", "mesin", "machine"],
  nama: ["name", "label", "title", "nama aplikasi", "application_name"],
  status: ["state", "kondisi", "condition", "active", "decommissioned", "inactive"],

  // Lokasi
  lokasi: ["location", "dc", "data center", "lokasi data center", "lokasi disaster recovery center"],
  datacenter: ["dc", "lokasi data center", "data center"],
  disaster: ["drc", "disaster recovery", "lokasi disaster recovery center"],

  // Biaya / opex
  biaya: ["cost", "maintenance_cost", "full year 2025", "harga", "opex", "capex", "cost driver"],
  maintenance: ["maintenance_cost", "annual maintenance", "biaya", "vendor"],
  vendor: ["supplier", "pt", "provider", "maintenance vendor"],
  mahal: ["cost", "full year 2025", "maintenance_cost"],

  // Spesifikasi teknis
  spesifikasi: ["spesifikasi hardware", "spesifikasi software", "spec", "cpu", "ram", "storage"],
  hardware: ["spesifikasi hardware dc", "spesifikasi hardware drc", "cpu", "ram", "storage", "virtual", "fisik"],
  software: ["spesifikasi software dc", "spesifikasi sofftware drc", "os", "platform", "database"],
  cpu: ["vcpu", "processor", "core"],
  ram: ["memory", "memori", "gb ram"],
  storage: ["disk", "penyimpanan", "gb"],
  os: ["operating system", "ubuntu", "linux", "windows", "platform"],
  database: ["postgresql", "mysql", "oracle", "db", "versi database"],

  // Backup & recovery
  backup: ["media backup restore", "periode backup restore", "backup restore"],
  recovery: ["metode recovery", "restore", "rto", "rpo"],
  replikasi: ["metode replikasi", "replication", "sync", "asynchronous", "synchronous"],

  // Deployment
  deployment: ["deployment type", "deployment_type", "cloud", "on-premise", "onpremise"],
  cloud: ["deployment type", "cloud flac"],
  inhouse: ["pengembangan", "in-house", "insource"],
  outsource: ["pengembangan", "outsource", "vendor"],

  // Jumlah & ranking
  jumlah: ["total", "count", "sum", "banyak", "jumlah pegawai"],
  pegawai: ["jumlah pegawai bank", "user", "pengguna"],
  ranking: ["importance rank", "importance rank risk", "rank", "prioritas"],

  // Asset
  aset: ["asset", "asset code", "asset name", "activo"],
  invoice: ["invoice number", "faktur", "inv"],

  // Waktu
  tanggal: ["date", "tgl", "time", "waktu", "date_live", "date_decom", "tahun implementasi"],
  implementasi: ["tahun implementasi", "date_live", "go live"],
  eol: ["end of life", "end-of-life", "expired", "decom"],

  // Sertifikat & perizinan
  ssl: ["flag_ssl", "sertifikat", "certificate"],
  izin: ["perizinan cloud", "permission", "license"],

  // Ownership
  sourcecode: ["source code", "kepemilikan source code", "escrow"],
  escrow: ["telah dilakukan penilaian kebutuhan escrow", "source code"],

  // LOB / kategori
  lob: ["line of business", "digital banking", "retail banking", "bisnis"],
  kategori: ["catagory ojk", "ojk", "category"],
};

function expandTokens(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    if (SYNONYMS[token]) {
      SYNONYMS[token].forEach((s) => expanded.add(s));
    }
    for (const [key, values] of Object.entries(SYNONYMS)) {
      if (values.includes(token)) {
        expanded.add(key);
        values.forEach((s) => expanded.add(s));
      }
    }
  }
  return Array.from(expanded);
}

export function retrieveRelevantChunks(
  question: string,
  chunks: ExcelChunk[],
  topN = 15
): ExcelChunk[] {
  const rawTokens = tokenize(question);
  const qTokens = expandTokens(rawTokens);
  const qPhrase = question.toLowerCase();

  const scored = chunks.map((chunk) => {
    const searchText = chunk.searchText;
    let score = 0;

    // 1. Token matching dengan sinonim
    for (const token of qTokens) {
      if (searchText.includes(token)) {
        score += 1;
      }
    }

    // 2. Exact phrase bonus
    if (searchText.includes(qPhrase)) {
      score += 10;
    }

    // 3. Multi-token phrase bonus
    for (let i = 0; i < rawTokens.length - 1; i++) {
      const phrase = `${rawTokens[i]} ${rawTokens[i + 1]}`;
      if (searchText.includes(phrase)) {
        score += 3;
      }
    }

    // 4. Field name bonus — nama kolom disebut di pertanyaan
    for (const key of Object.keys(chunk.row)) {
      const normalizedKey = key.toLowerCase();
      if (qPhrase.includes(normalizedKey) || normalizedKey.includes(qPhrase)) {
        score += 2;
      }
    }

    // 5. App_ID cross-file bonus — kalau App_ID disebut, prioritaskan
    const appIdMatch = qPhrase.match(/app_id\d+/i);
    if (appIdMatch && searchText.includes(appIdMatch[0].toLowerCase())) {
      score += 8;
    }

    // 6. Bonus kalau chunk punya kolom Status dan nilainya match pertanyaan
      const statusValue = String(chunk.row["Status"] || "").toLowerCase();
      if (statusValue && qPhrase.includes(statusValue)) {
        score += 5;}
    return { chunk, score };
  });
    

  const filtered = scored.filter((item) => item.score > 0);
  const dynamicTopN = filtered.length < topN ? filtered.length : topN;

  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, dynamicTopN)
    .map((item) => item.chunk);
}