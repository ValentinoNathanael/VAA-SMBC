// Tambah di chunk-cache.ts:
import type { SchemaMap } from "./schema-detector";
import type { ExcelChunk } from "./excel-parser";

export const chunkCache = {
  chunks: null as ExcelChunk[] | null,
  timestamp: null as number | null,
  fingerprint: null as string | null,
  schema: null as SchemaMap | null, // TAMBAH INI

  clear() {
    this.chunks = null;
    this.timestamp = null;
    this.fingerprint = null;
    this.schema = null; // TAMBAH INI
    console.log("[Cache] Cache di-clear");
  },

  set(chunks: ExcelChunk[], fingerprint: string) {
    this.chunks = chunks;
    this.timestamp = Date.now();
    this.fingerprint = fingerprint;
  },
};