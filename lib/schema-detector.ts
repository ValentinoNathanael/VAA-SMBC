import type { ExcelChunk } from "./excel-parser";

export type ColumnInfo = {
  name: string;
  sampleValues: string[];
  type: "text" | "number" | "date";
};

export type FileSchema = {
  fileName: string;
  columns: ColumnInfo[];
  rowCount: number;
};

export type SchemaMap = Record<string, FileSchema>;

function detectColumnType(values: any[]): "text" | "number" | "date" {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!nonEmpty.length) return "text";

  const numCount = nonEmpty.filter((v) => !isNaN(Number(v))).length;
  if (numCount / nonEmpty.length > 0.7) return "number";

  const dateCount = nonEmpty.filter((v) => {
    const d = new Date(v);
    return d instanceof Date && !isNaN(d.getTime()) && String(v).length > 4;
  }).length;
  if (dateCount / nonEmpty.length > 0.7) return "date";

  return "text";
}

export function buildSchemaFromChunks(chunks: ExcelChunk[]): SchemaMap {
  const schemaMap: SchemaMap = {};

  const byFile: Record<string, ExcelChunk[]> = {};
  for (const chunk of chunks) {
    if (!byFile[chunk.fileName]) byFile[chunk.fileName] = [];
    byFile[chunk.fileName].push(chunk);
  }

  for (const [fileName, fileChunks] of Object.entries(byFile)) {
    if (!fileChunks.length) continue;

    const allColumns = Object.keys(fileChunks[0].row);

    const columns: ColumnInfo[] = allColumns.map((colName) => {
      const sampleValues = [
        ...new Set(
          fileChunks
            .map((c) => c.row[colName])
            .filter((v) => v !== null && v !== undefined && v !== "")
            .map((v) => String(v))
        ),
      ].slice(0, 10);

      const allValues = fileChunks.map((c) => c.row[colName]);

      return {
        name: colName,
        sampleValues,
        type: detectColumnType(allValues),
      };
    });

    schemaMap[fileName] = {
      fileName,
      columns,
      rowCount: fileChunks.length,
    };
  }

  return schemaMap;
}

// Mapping kolom ke kata kunci pertanyaan — supaya LLM lebih tepat pilih file & kolom
const COLUMN_HINTS: Record<string, string> = {
  // template_aplikasi.xlsx
  "Application TYpe": "tipe aplikasi, application type, desktop, mobile, web, api",
  "Status": "status aktif, active, decommissioned, inactive",
  "LOB": "lini bisnis, line of business, finance, digital banking, treasury, operations",
  "Application_Name": "nama aplikasi, app name",
  "App Owner": "pemilik aplikasi, app owner",
  "Unit Of App Owner": "unit pemilik, divisi pemilik",
  "Deployment_type": "deployment, cloud, on-premise",
  "Development_type": "pengembangan, inhouse, outsource",
  "capability layer": "layer, capability",
  "Date_LIve": "tanggal go live, implementasi, tahun live",
  "Date_Decom": "tanggal decommission, eol, end of life",

  // template_server.xlsx
  "Host name": "hostname, host name, nama server, nama host",
  "Lokasi Data Center": "lokasi server, data center, dc",
  "Lokasi disaster recovery center": "drc, disaster recovery, lokasi drc",
  "SPesifikasi software DC": "spesifikasi software, os, linux, ubuntu",
  "Spesifikasi hardware DC": "spesifikasi hardware, cpu, ram, storage, vcpu",
  "Tahun Implementasi": "tahun implementasi, tahun server",
  "Power State": "power, power state, power on, power off",

  // template_activo.xlsx
  "asset name": "nama aset, asset name",
  "asset code": "kode aset, asset code",
  "Tipe/Kategori Aset": "kategori aset, tipe aset, hardware server, software, laptop",
  "Harga Perolehan": "harga aset, nilai aset, harga perolehan",
  "Status Aset": "status aset, kondisi aset",
  "Vendor": "vendor aset, supplier aset",

  // template_opex.xlsx
  "Januari": "biaya januari, maintenance januari, opex januari",
  "Febuari": "biaya februari, maintenance februari",
  "Maret": "biaya maret",
  "April": "biaya april",
  "Mei": "biaya mei",
  "Juni": "biaya juni",
  "Juli": "biaya juli",
  "Agustus": "biaya agustus",
  "September": "biaya september",
  "Oktober": "biaya oktober",
  "November": "biaya november",
  "Desember": "biaya desember",
  "vendor": "vendor maintenance, vendor opex",
};

export function formatSchemaForLLM(schemaMap: SchemaMap): string {
  return Object.values(schemaMap)
    .map((fileSchema) => {
      const colDetails = fileSchema.columns
        .map((col) => {
          const samples = col.sampleValues.slice(0, 3).join(", ");
          const hint = COLUMN_HINTS[col.name];
          const hintText = hint ? ` [kata kunci: ${hint}]` : "";
          return `  - ${col.name} (${col.type})${hintText}${samples ? `: contoh → ${samples}` : ""}`;
        })
        .join("\n");

      return `FILE: ${fileSchema.fileName} (${fileSchema.rowCount} rows)\nKOLOM:\n${colDetails}`;
    })
    .join("\n\n");
}