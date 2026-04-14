export type QueryType =
  | "filter_list"      // list/filter data (aplikasi yang Active)
  | "count_total"      // hitung total (berapa jumlah server)
  | "sum_value"        // jumlahkan nilai (total biaya)
  | "specific_lookup"  // cari data spesifik (info Jenius, App_ID001)
  | "cross_file"       // gabungan antar file (biaya + status + server)
  | "analysis"         // analisis/rekomendasi (aplikasi paling berisiko)
  | "general"          // pertanyaan umum lainnya

export type QueryIntent = {
  type: QueryType;
  targetField?: string;   // kolom yang dituju (Status, biaya, dll)
  targetValue?: string;   // nilai yang dicari (Active, Jakarta, dll)
  targetEntity?: string;  // entitas spesifik (Jenius, App_ID001, dll)
  needsCrossFile: boolean; // butuh gabungan antar file?
  confidence: number;      // seberapa yakin (0-1)
}

// Keyword map untuk deteksi tipe pertanyaan
const FILTER_KEYWORDS = [
  "mana", "yang", "list", "daftar", "tampilkan", "sebutkan",
  "ada", "punya", "dengan", "ber-", "berapa yang", "siapa"
];

const COUNT_KEYWORDS = [
  "berapa", "jumlah", "total", "banyak", "hitung", "count",
  "berapa banyak", "berapa jumlah"
];

const SUM_KEYWORDS = [
  "total biaya", "jumlah biaya", "berapa biaya", "cost", "opex",
  "maintenance", "pengeluaran", "budget", "sum"
];

const ANALYSIS_KEYWORDS = [
  "rekomendasikan", "rekomendasi", "analisis", "analisa", "evaluasi",
  "berisiko", "risiko", "worth it", "layak", "perlu diperhatikan",
  "prioritas", "terbaik", "terburuk", "paling", "bandingkan", "compare"
];

const CROSS_FILE_KEYWORDS = [
  "biaya", "cost", "opex", "maintenance",  // opex file
  "server", "host", "datacenter", "dc", "drc", "backup", "spesifikasi", // server file
  "aset", "asset", "invoice",              // activo file
];

const SPECIFIC_ENTITY_PATTERNS = [
  /app_id\d+/i,
  /jenius|btpn|jago|smbc/i,
];

export function analyzeQuery(question: string): QueryIntent {
  const q = question.toLowerCase();
  const words = q.split(/\s+/);

  // Deteksi entity spesifik
  let targetEntity: string | undefined;
  for (const pattern of SPECIFIC_ENTITY_PATTERNS) {
    const match = q.match(pattern);
    if (match) {
      targetEntity = match[0];
      break;
    }
  }

  // Deteksi target value (Active, Decommissioned, Jakarta, dll)
  let targetValue: string | undefined;
  const valuePatterns = [
    /\b(active|aktif)\b/i,
    /\b(decommissioned|decom|nonaktif|mati)\b/i,
    /\b(jakarta|surabaya|bandung|bekasi|cikarang|karawang)\b/i,
    /\b(cloud|on-premise|onpremise)\b/i,
    /\b(inhouse|outsource)\b/i,
  ];
  for (const pattern of valuePatterns) {
    const match = q.match(pattern);
    if (match) {
      targetValue = match[0];
      break;
    }
  }

  // Deteksi butuh cross file
  const needsCrossFile =
    CROSS_FILE_KEYWORDS.some((kw) => q.includes(kw)) ||
    (targetEntity !== undefined && CROSS_FILE_KEYWORDS.some((kw) => q.includes(kw)));

  // Deteksi tipe utama
  let type: QueryType = "general";
  let confidence = 0.5;

  if (ANALYSIS_KEYWORDS.some((kw) => q.includes(kw))) {
    type = "analysis";
    confidence = 0.85;
  } else if (SUM_KEYWORDS.some((kw) => q.includes(kw))) {
    type = "sum_value";
    confidence = 0.9;
  } else if (COUNT_KEYWORDS.some((kw) => q.includes(kw)) && !targetEntity) {
    type = "count_total";
    confidence = 0.85;
  } else if (targetEntity) {
    type = needsCrossFile ? "cross_file" : "specific_lookup";
    confidence = 0.9;
  } else if (FILTER_KEYWORDS.some((kw) => q.includes(kw))) {
    type = "filter_list";
    confidence = 0.8;
  }

  return {
    type,
    targetValue,
    targetEntity,
    needsCrossFile,
    confidence,
  };
}