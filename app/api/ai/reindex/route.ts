import { NextResponse } from "next/server";
import { parseExcelBufferToChunks } from "@/lib/excel-parser";
import { listExcelObjects, getObjectBuffer } from "@/lib/s3";
import { chunkCache } from "@/lib/chunk-cache";
import { buildSchemaFromChunks } from "@/lib/schema-detector";

// Cache schema global
export let cachedSchema: ReturnType<typeof buildSchemaFromChunks> | null = null;

export function clearSchemaCache() {
  cachedSchema = null;
}

export async function POST() {
  try {
    // 1. Clear semua cache
    chunkCache.clear();
    clearSchemaCache();
    console.log("[Reindex] Cache dihapus, mulai parsing ulang...");

    // 2. Parse semua file Excel
    const objects = await listExcelObjects();
    const allChunks = [];

    for (const object of objects) {
      const fileBuffer = await getObjectBuffer(object.name);
      const chunks = parseExcelBufferToChunks(fileBuffer, object.name);
      allChunks.push(...chunks);
    }

    // 3. Build schema dari chunks
    const schema = buildSchemaFromChunks(allChunks);
    cachedSchema = schema;
    console.log("[Reindex] Schema terdeteksi:", Object.keys(schema));

    // 4. Log info per file
    for (const [fileName, fileSchema] of Object.entries(schema)) {
      console.log(
        `[Reindex] ${fileName}: ${fileSchema.rowCount} rows, ${fileSchema.columns.length} kolom`
      );
    }

    console.log(
      "[Reindex] Selesai:",
      allChunks.length,
      "chunks dari",
      objects.length,
      "file"
    );

    return NextResponse.json({
      success: true,
      message: "Cache dan schema berhasil di-refresh",
      fileCount: objects.length,
      chunkCount: allChunks.length,
      files: objects.map((o) => o.name),
      schema: Object.fromEntries(
        Object.entries(schema).map(([file, s]) => [
          file,
          {
            rowCount: s.rowCount,
            columns: s.columns.map((c) => c.name),
          },
        ])
      ),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}