import * as XLSX from "xlsx";

export type ExcelChunk = {
  fileName: string;
  sheetName: string;
  rowNumber: number;
  chunkText: string;
  searchText: string;
  row: Record<string, any>;
};

function normalizeHeader(header: string) {
  return String(header || "")
    .trim()
    .replace(/\s+/g, " ");
}

function rowToChunkText(
  fileName: string,
  sheetName: string,
  rowNumber: number,
  row: Record<string, any>
): ExcelChunk {
  const pairs = Object.entries(row)
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join(" | ");

  const chunkText =
    `File: ${fileName}\n` +
    `Sheet: ${sheetName}\n` +
    `Row: ${rowNumber}\n` +
    `${pairs}`;

  return {
    fileName,
    sheetName,
    rowNumber,
    chunkText,
    searchText: chunkText.toLowerCase(),
    row,
  };
}

export function parseExcelBufferToChunks(
  fileBuffer: Buffer,
  fileName: string
): ExcelChunk[] {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const chunks: ExcelChunk[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: "",
    });

    const normalizedRows = jsonRows.map((row) => {
      const newRow: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        newRow[normalizeHeader(key)] = convertExcelDate(value);
      }
      return newRow;
    });
    normalizedRows.forEach((row, index) => {
      const chunk = rowToChunkText(fileName, sheetName, index + 2, row);
      chunks.push(chunk);
    });
  }
  return chunks;
}

function convertExcelDate(value: any): any {
  if (typeof value === "number" && value > 40000 && value < 60000) {
    // Konversi Excel serial date ke JavaScript Date
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toLocaleDateString("id-ID"); // format: DD/MM/YYYY
  }
  return value;
}