import type { ExcelChunk } from "./excel-parser";
import type { LLMInstruction } from "./bedrock";

export type EngineResult = {
  summary: string;
  totalCount?: number;
  totalRows?: number;
  items?: any[];
  aggregated?: Record<string, any>;
};

function normalizeValue(val: any): string {
  return String(val ?? "").toLowerCase().trim();
}

function findMatchingColumn(
  row: Record<string, any>,
  keywords: string[]
): string | undefined {
  const keys = Object.keys(row);
  for (const keyword of keywords) {
    const exact = keys.find(
      (k) => k.trim().toLowerCase() === keyword.trim().toLowerCase()
    );
    if (exact) return exact;
    const fuzzy = keys.find((k) =>
      k.trim().toLowerCase().includes(keyword.trim().toLowerCase())
    );
    if (fuzzy) return fuzzy;
  }
  return undefined;
}

function detectMultiRowFiles(chunks: ExcelChunk[]): Set<string> {
  const appIdCountPerFile = new Map<string, Map<string, number>>();

  for (const chunk of chunks) {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!appId) continue;

    if (!appIdCountPerFile.has(chunk.fileName)) {
      appIdCountPerFile.set(chunk.fileName, new Map());
    }
    const fileMap = appIdCountPerFile.get(chunk.fileName)!;
    fileMap.set(appId, (fileMap.get(appId) || 0) + 1);
  }

  const multiRowFiles = new Set<string>();
  for (const [fileName, appIdMap] of appIdCountPerFile.entries()) {
    for (const count of appIdMap.values()) {
      if (count > 1) {
        multiRowFiles.add(fileName);
        break;
      }
    }
  }

  return multiRowFiles;
}

// ===== VALIDASI FORMAT APP_ID =====
function detectAppIdPattern(chunks: ExcelChunk[]): RegExp {
  const appIds = chunks
    .map(c => String(c.row["App_ID"] || c.row["app_id"] || "").trim())
    .filter(Boolean);

  if (!appIds.length) return /.+/;

  const hasNumericSuffix = appIds.filter(id => /^[a-zA-Z_]+\d+$/i.test(id)).length;
  if (hasNumericSuffix / appIds.length > 0.8) {
    return /^[a-zA-Z_]+\d+$/i;
  }
  return /.+/;
}

function isValidAppId(appId: string, pattern: RegExp): boolean {
  return pattern.test(appId.trim());
}

function joinByAppId(
  items: Record<string, any>[],
  allChunks: ExcelChunk[],
  multiRowFiles: Set<string>
): Record<string, any>[] {
  return items.map((item) => {
    const appId = normalizeValue(item["App_ID"] || item["app_id"]);
    if (!appId) return item;

    const itemFileNames = (item.fileName || "")
      .split(", ")
      .map((f: string) => f.trim().toLowerCase());

    const relatedChunks = allChunks.filter((c) => {
      const chunkAppId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
      const chunkFileLower = c.fileName.trim().toLowerCase();
      return chunkAppId === appId && !itemFileNames.includes(chunkFileLower);
    });

    if (relatedChunks.length === 0) return item;

    const merged = { ...item };
    const fileNames = new Set<string>(
      item.fileName ? item.fileName.split(", ").map((f: string) => f.trim()) : []
    );

    const byFile = new Map<string, ExcelChunk[]>();
    for (const chunk of relatedChunks) {
      if (!byFile.has(chunk.fileName)) byFile.set(chunk.fileName, []);
      byFile.get(chunk.fileName)!.push(chunk);
    }

    for (const [fileName, fileChunks] of byFile.entries()) {
      fileNames.add(fileName);

      if (!multiRowFiles.has(fileName) || fileChunks.length === 1) {
        for (const [key, value] of Object.entries(fileChunks[0].row)) {
          if (key.startsWith("__EMPTY")) continue;
          if (!merged[key] || merged[key] === "-" || merged[key] === "") {
            merged[key] = value;
          }
        }
      } else {
        for (const key of Object.keys(fileChunks[0].row)) {
          if (key === "App_ID" || key === "app_id") continue;
          const values = fileChunks
            .map((c) => String(c.row[key] || "").trim())
            .filter((v) => v && v !== "-" && v !== "");
          if (values.length > 0) {
            merged[key] = [...new Set(values)].join(", ");
          }
        }
      }
    }
    const rawAppId = String(merged["App_ID"] || merged["app_id"] || "");
    const uniqueAppIds = [...new Set(
      rawAppId.split(",").map(s => s.trim()).filter(Boolean)
        .map(s => s.toUpperCase())
    )];
    if (uniqueAppIds.length > 0) {
      merged["App_ID"] = uniqueAppIds[0];
    }
    merged.fileName = Array.from(fileNames).join(", ");
    return merged;
  });
}

// ===== CROSS-FILE RESOLVER =====
function resolveCrossFileAppIds(
  value: string,
  targetFile: string | undefined,
  allChunks: ExcelChunk[]
): Set<string> | null {
  if (!value || !allChunks.length) return null;

  const valueLower = value.toLowerCase().trim();
  const matchingAppIds = new Set<string>();

  for (const chunk of allChunks) {
    if (targetFile && chunk.fileName.toLowerCase().includes(targetFile.toLowerCase())) continue;
    for (const [, val] of Object.entries(chunk.row)) {
      if (normalizeValue(val) === valueLower) {
        const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
        if (appId) matchingAppIds.add(appId);
        break;
      }
    }
  }

  return matchingAppIds.size > 0 ? matchingAppIds : null;
}

function valueExistsInTargetFile(
  value: string,
  targetFile: string | undefined,
  allChunks: ExcelChunk[]
): boolean {
  if (!value) return false;
  const valueLower = value.toLowerCase().trim();
  const targetChunks = targetFile
    ? allChunks.filter(c => c.fileName.toLowerCase().includes(targetFile.toLowerCase()))
    : allChunks;

  for (const chunk of targetChunks) {
    for (const [, val] of Object.entries(chunk.row)) {
      if (normalizeValue(val) === valueLower) return true;
    }
  }
  return false;
}

function handleFilter(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  const { file, column, value } = instruction;

  const targetChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;

const isNot = (instruction as any).logic === "NOT";

    let filtered = targetChunks.filter((chunk) => {
      if (column) {
        const col = findMatchingColumn(chunk.row, [column]);
        if (col) {
          const matches = normalizeValue(chunk.row[col]).includes(normalizeValue(value || ""));
          return isNot ? !matches : matches;
        }
      }
      const matches = chunk.searchText.includes(normalizeValue(value || ""));
      return isNot ? !matches : matches;
    });

  if (value && filtered.length === 0 && allChunks && !valueExistsInTargetFile(value, file, allChunks)) {
    const crossFileIds = resolveCrossFileAppIds(value, file, allChunks);
    if (crossFileIds && crossFileIds.size > 0) {
      filtered = targetChunks.filter((c) => {
        const appId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
        return crossFileIds.has(appId);
      });
    }
  }

  const multiRowFiles = allChunks ? detectMultiRowFiles(allChunks) : new Set<string>();
  const appIdPattern = detectAppIdPattern(targetChunks);

  const seen = new Map<string, Set<string>>();
  const unique = filtered.filter((chunk) => {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!appId) return false;
    if (!isValidAppId(appId, appIdPattern)) return false;
    if (multiRowFiles.has(chunk.fileName)) return true;
    if (!seen.has(chunk.fileName)) seen.set(chunk.fileName, new Set());
    if (seen.get(chunk.fileName)!.has(appId)) return false;
    seen.get(chunk.fileName)!.add(appId);
    return true;
  });

  const mergedByAppId = new Map<string, Record<string, any>>();
  for (const chunk of unique) {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!appId) continue;

    const fileKey = `${chunk.fileName}||${appId}`;
    if (!mergedByAppId.has(fileKey)) {
      mergedByAppId.set(fileKey, {
        ...chunk.row,
        fileName: chunk.fileName,
        rowNumber: chunk.rowNumber,
      });
    } else {
      const existing = mergedByAppId.get(fileKey)!;
      for (const [key, value] of Object.entries(chunk.row)) {
        if (key.startsWith("__EMPTY")) continue;
        if (!value || value === "-" || value === "") continue;
        if (!existing[key] || existing[key] === "-" || existing[key] === "") {
          existing[key] = value;
        } else if (String(existing[key]) !== String(value)) {
          const existingVals = String(existing[key]).split(", ").map(v => v.trim());
          const newVals = String(value).split(", ").map(v => v.trim());
          existing[key] = [...new Set([...existingVals, ...newVals])].filter(Boolean).join(", ");
        }
      }
    }
  }

  let items: any[] = Array.from(mergedByAppId.values());

  if (allChunks && allChunks.length > 0) {
    items = joinByAppId(items, allChunks, multiRowFiles);
  }

  const totalRows = unique.length;
  const duplicateCount = totalRows - items.length;

  let dupDetail = "";
  if (duplicateCount > 0) {
    const dupItems = items.filter((item: any) => {
      const lokasi = String(item["Lokasi Data Center"] || "");
      return lokasi.includes(",");
    });
    const dupList = dupItems
      .map((item: any) => `- ${item.App_ID} — ${item.Application_Name || "-"} | Lokasi: ${item["Lokasi Data Center"]}`)
      .join("\n");
    if (dupList) {
      dupDetail = `\n\nAplikasi dengan server di lebih dari 1 lokasi:\n${dupList}`;
    }
  }
  const dupNote = duplicateCount > 0 ? `, ${duplicateCount} aplikasi memiliki server di lebih dari 1 lokasi` : "";
  // ===== SORT + LIMIT untuk query ranking kolom non-biaya =====
  const sortField = (instruction as any).sort as string | undefined;
  const limitField = (instruction as any).limit as number | undefined;
  const sortColumn = (instruction as any).column as string | undefined;
  if (sortField && sortColumn) {
    items = items.sort((a: any, b: any) => {
      const aVal = parseFloat(String(a[sortColumn] || 0)) || 0;
      const bVal = parseFloat(String(b[sortColumn] || 0)) || 0;
      return sortField === "desc" ? bVal - aVal : aVal - bVal;
    });
    if (limitField && limitField > 0 && items.length > 0) {
        const topVal = parseFloat(String(items[0]?.[sortColumn] || 0));
        items = items.filter((item: any) =>
          parseFloat(String(item[sortColumn] || 0)) === topVal
        );
      }
  }
  return {
    summary: `Ditemukan ${items.length} aplikasi unik (${totalRows} baris data${dupNote}) dengan filter "${value}".${dupDetail}`,
    totalCount: items.length,
    totalRows: totalRows,
    items,
  };
}


const OPEX_MONTH_COLUMNS = [
  "Januari", "Febuari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function isMonthColumn(key: string): boolean {
  return OPEX_MONTH_COLUMNS.some(
    (m) => key.trim().toLowerCase() === m.toLowerCase()
  );
}

function handleSum(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  const { file, column, value, entity } = instruction;

  let targetChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;

  if (entity) {
    const entityLower = entity.toLowerCase();

    const matchedAppIds = new Set<string>();
    if (allChunks) {
      for (const chunk of allChunks) {
        const appName = String(
          chunk.row["Application_Name"] || chunk.row["Nama Aplikasi"] || ""
        ).toLowerCase();
        const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
        if (!appId) continue;

        const entityWords = entityLower.split(/[\s_]+/);
        const appWords = appName.split(/[\s_]+/);
        const isExactWordMatch = entityWords.every(ew => appWords.some(aw => aw === ew));
        const isAppIdMatch = appId === entityLower.replace(/\s/g, "_");

        if (isExactWordMatch || isAppIdMatch) {
          matchedAppIds.add(appId);
        }
      }
    }

    let matched: ExcelChunk[] = [];
    if (matchedAppIds.size > 0) {
      matched = targetChunks.filter((c) => {
        const chunkAppId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
        return matchedAppIds.has(chunkAppId);
      });
    }

    if (matched.length === 0) {
      const wordBoundary = new RegExp(`\\b${entityLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      matched = targetChunks.filter((c) => wordBoundary.test(c.searchText));
    }

    if (matched.length === 0 && allChunks) {
      const appIdChunks = allChunks.filter((c) => c.searchText.includes(entityLower));
      const appIds = new Set(
        appIdChunks.map((c) =>
          normalizeValue(c.row["App_ID"] || c.row["app_id"])
        ).filter(Boolean)
      );
      if (appIds.size > 0) {
        matched = targetChunks.filter((c) => {
          const chunkAppId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
          return appIds.has(chunkAppId);
        });
      }
    }

    targetChunks = matched;
  }


if (value && !entity) {
  const valueList = value.split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  const isAppIdList = valueList.length > 1 && valueList.every(v => /^app_id\d+$/i.test(v));

  if (isAppIdList) {
    targetChunks = targetChunks.filter(c => {
      const appId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
      return valueList.includes(appId);
    });
  } else if (allChunks && !valueExistsInTargetFile(value, file, allChunks)) {
    const crossFileIds = resolveCrossFileAppIds(value, file, allChunks);
    if (crossFileIds && crossFileIds.size > 0) {
      targetChunks = targetChunks.filter((c) => {
        const appId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
        return crossFileIds.has(appId);
      });
    }
  }
}

  let columnsToSum: string[] = [];

  if (column) {
    columnsToSum = column.split(",").map((c) => c.trim());
  }

  if (columnsToSum.length === 0 || !targetChunks.some((c) => findMatchingColumn(c.row, columnsToSum))) {
    const allRowKeys = new Set<string>();
    for (const c of targetChunks) {
      Object.keys(c.row).forEach((k) => allRowKeys.add(k));
    }
    const rowKeys = Array.from(allRowKeys);

    const hasMonthColumns = OPEX_MONTH_COLUMNS.some((m) =>
      rowKeys.some((k) => k.trim().toLowerCase() === m.toLowerCase())
    );

    if (hasMonthColumns) {
      columnsToSum = rowKeys.filter((k) => isMonthColumn(k));
    } else {
      columnsToSum = rowKeys.filter((k) => {
        const kl = k.toLowerCase();
        return kl.includes("cost") || kl.includes("biaya") || kl.includes("harga") || kl.includes("full year");
      });
    }
  }

  if (columnsToSum.length === 0 && targetChunks[0]) {
    const rowKeys = Object.keys(targetChunks[0].row);
    columnsToSum = rowKeys.filter((k) => {
      const val = targetChunks[0].row[k];
      return typeof val === "number" && !isNaN(val) && val > 0;
    });
  }

  let total = 0;
  const items: Record<string, any>[] = [];
  const seen = new Set<string>();

  for (const chunk of targetChunks) {
    const key = `${chunk.fileName}-${chunk.rowNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let rowTotal = 0;
    const rowData: Record<string, any> = {
      ...chunk.row,
      fileName: chunk.fileName,
      rowNumber: chunk.rowNumber,
    };

    for (const col of columnsToSum) {
      const matchedCol =
        Object.keys(chunk.row).find(
          (k) => k.trim().toLowerCase() === col.trim().toLowerCase()
        ) ?? findMatchingColumn(chunk.row, [col]);
      if (!matchedCol) continue;
      const val = Number(chunk.row[matchedCol]);
      if (!isNaN(val) && val !== 0) {
        rowTotal += val;
        rowData[matchedCol] = val;
      }
    }

    if (rowTotal === 0) continue;
    total += rowTotal;
    rowData.total = rowTotal;
    rowData.formatted = `Rp ${rowTotal.toLocaleString("id-ID")}`;
    items.push(rowData);
  }

  const columnLabel = columnsToSum.length > 0 ? columnsToSum.join(", ") : (column || "biaya");

  const columnTotals: Record<string, string> = {};
  for (const col of columnsToSum) {
    let colTotal = 0;
    for (const item of items) {
      const matchedKey = Object.keys(item).find(
        (k) => k.trim().toLowerCase() === col.trim().toLowerCase()
      );
      if (matchedKey) {
        const val = Number(item[matchedKey]);
        if (!isNaN(val)) colTotal += val;
      }
    }
    if (colTotal > 0) {
      columnTotals[col.trim()] = `Rp ${colTotal.toLocaleString("id-ID")}`;
    }
  }

// ✅ GANTI JADI INI
  // Sort & limit — hanya aktif kalau LLM generate field sort/limit
  const sortField = (instruction as any).sort as string | undefined;
  const sortColumn = (instruction as any).sortColumn as string | undefined;
  const limitField = (instruction as any).limit as number | undefined;

  if (sortField) {
    
    items.sort((a, b) => {
      const aVal = sortColumn
        ? (Number(Object.entries(a).find(([k]) => k.trim().toLowerCase() === sortColumn.trim().toLowerCase())?.[1]) || 0)
        : (a.total || 0);
      const bVal = sortColumn
        ? (Number(Object.entries(b).find(([k]) => k.trim().toLowerCase() === sortColumn.trim().toLowerCase())?.[1]) || 0)
        : (b.total || 0);
      return sortField === "desc" ? bVal - aVal : aVal - bVal;
    });
  }

  if (limitField && typeof limitField === "number" && limitField > 0) {
    items.splice(limitField);
  }

  if (sortField || limitField) {
  total = items.reduce((sum, item) => sum + (item.total || 0), 0);
}

  return {
    summary: `Total ${columnLabel}: Rp ${total.toLocaleString("id-ID")} dari ${items.length} item.`,
    totalCount: items.length,
    items,
    aggregated: {
      total,
      totalFormatted: `Rp ${total.toLocaleString("id-ID")}`,
      columns: columnsToSum,
      breakdown: columnTotals,
    },
  };
}

function handleCount(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  const { file, column, value } = instruction;

  const targetChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;

  let filtered = value
    ? targetChunks.filter((c) => {
        if (column) {
          const col = findMatchingColumn(c.row, [column]);
          if (col) {
            return normalizeValue(c.row[col]).includes(normalizeValue(value));
          }
        }
        return c.searchText.includes(normalizeValue(value));
      })
    : targetChunks;

  if (value && filtered.length === 0 && allChunks && !valueExistsInTargetFile(value, file, allChunks)) {
    const crossFileIds = resolveCrossFileAppIds(value, file, allChunks);
    if (crossFileIds && crossFileIds.size > 0) {
      filtered = targetChunks.filter((c) => {
        const appId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
        return crossFileIds.has(appId);
      });
    }
  }

  const appIdPattern = detectAppIdPattern(targetChunks);



  const seen = new Set<string>();
  const unique = filtered.filter((chunk) => {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!appId || seen.has(appId)) return false;
    if (!isValidAppId(appId, appIdPattern)) return false;
    seen.add(appId);
    return true;
  });

  return {
    summary: `Total count: ${unique.length} item${value ? ` dengan filter "${value}"` : ""}.`,
    totalCount: unique.length,
    items: [],
  };
}





function handleLookup(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  const { entity, file, value } = instruction;
  const searchChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;

  // ===== FALLBACK: kalau entity null tapi value ada, cari pakai value =====
  const searchTerm = entity || value || "";
  const entityNorm = normalizeValue(searchTerm);
  const entityList = entityNorm.split(",").map(e => e.trim()).filter(Boolean);
  const isMultiEntity = entityList.length > 1;

  const appIdPatterns = [
    /^app[_\s-]?id[_\s-]?(\d+)$/i,
    /^app_id\d+$/i,
    /^\d+$/,
  ];

  const appIdMatch = appIdPatterns.find((p) => p.test(entityNorm.trim()));
  let targetAppId: string | null = null;

  if (appIdMatch) {
    const numMatch = entityNorm.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1]);
      targetAppId = `app_id${String(num).padStart(3, "0")}`;
    }
  }

  // Kalau entity null tapi value ada → cari di semua kolom
  const isValueFallback = !entity && !!value;

  const filtered = searchChunks.filter((c) => {
    if (isMultiEntity) {
      return entityList.some(ent => {
        const entPatterns = [/^app[_\s-]?id[_\s-]?(\d+)$/i, /^app_id\d+$/i, /^\d+$/];
        const isAppId = entPatterns.some(p => p.test(ent));
        if (isAppId) {
          const numMatch = ent.match(/(\d+)/);
          if (numMatch) {
            const appIdNorm = `app_id${String(parseInt(numMatch[1])).padStart(3, "0")}`;
            return normalizeValue(c.row["App_ID"] || c.row["app_id"]) === appIdNorm;
          }
        }
        return c.searchText.includes(ent);
      });
    }
    if (targetAppId) {
      const chunkAppId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
      return chunkAppId === targetAppId;
    }
    if (isValueFallback) {
      // Cari value di semua kolom (exact match)
      return Object.values(c.row).some(
        v => normalizeValue(v) === entityNorm
      );
    }
    return c.searchText.includes(entityNorm);
  });

  const multiRowFiles = allChunks ? detectMultiRowFiles(allChunks || chunks) : new Set<string>();
  const appIdPattern = detectAppIdPattern(chunks);

  let items: any[] = filtered.map((c) => ({
    ...c.row,
    fileName: c.fileName,
    sheetName: c.sheetName,
    rowNumber: c.rowNumber,
  }));

  items = items.filter(item => {
    const appId = String(item["App_ID"] || item["app_id"] || "").toLowerCase().trim();
    return isValidAppId(appId, appIdPattern);
  });

  if (allChunks && allChunks.length > 0) {
    items = joinByAppId(items, allChunks, multiRowFiles);
  }

  const mergedByAppId = new Map<string, Record<string, any>>();
  for (const item of items) {
    const appId = normalizeValue(item["App_ID"] || item["app_id"]);
    if (!appId) continue;

    if (!mergedByAppId.has(appId)) {
      mergedByAppId.set(appId, { ...item });
    } else {
      const existing = mergedByAppId.get(appId)!;
      for (const [key, value] of Object.entries(item)) {
        if (key.startsWith("__EMPTY")) continue;
        if (!value || value === "-" || value === "") continue;
        if (!existing[key] || existing[key] === "-" || existing[key] === "") {
          existing[key] = value;
        } else if (String(existing[key]) !== String(value)) {
          const existingVals = String(existing[key]).split(", ").map(v => v.trim());
          const newVals = String(value).split(", ").map(v => v.trim());
          const merged = [...new Set([...existingVals, ...newVals])].filter(Boolean).join(", ");
          existing[key] = merged;
        }
      }
    }
  }

  const mergedItems = Array.from(mergedByAppId.values());
  const fileCount = new Set(
    mergedItems.map((i) => i.fileName?.split(", ")).flat()
  ).size;

  return {
    summary: `Data untuk "${searchTerm}": ${mergedItems.length} entitas dari ${fileCount} file.`,
    totalCount: mergedItems.length,
    items: mergedItems,
  };
}

// ===== HANDLE LIST =====
function handleList(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  const { file, column } = instruction;

  const targetChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;

  if (!column) {
    return {
      summary: "Kolom tidak ditemukan untuk operasi list.",
      totalCount: 0,
      items: [],
    };
  }

  const multiRowFiles = allChunks ? detectMultiRowFiles(allChunks) : new Set<string>();

  const appIdPattern = detectAppIdPattern(targetChunks);
  const seen = new Map<string, Set<string>>();
  const unique = targetChunks.filter((chunk) => {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!appId) return false;
    if (!isValidAppId(appId, appIdPattern)) return false;
    if (multiRowFiles.has(chunk.fileName)) return true;
    if (!seen.has(chunk.fileName)) seen.set(chunk.fileName, new Set());
    if (seen.get(chunk.fileName)!.has(appId)) return false;
    seen.get(chunk.fileName)!.add(appId);
    return true;
  });

  const items = unique
    .map((chunk) => {
      const col = findMatchingColumn(chunk.row, [column]);
      if (!col) return null;

      const val = chunk.row[col];
      if (!val || val === "-" || val === "") return null;

      return {
        App_ID: chunk.row["App_ID"] || chunk.row["app_id"] || "-",
        Application_Name: chunk.row["Application_Name"] || chunk.row["Nama Aplikasi"] || "-",
        [col]: val,
        fileName: chunk.fileName,
        rowNumber: chunk.rowNumber,
      };
    })
    .filter(Boolean) as Record<string, any>[];

  const colKey = items.length > 0
    ? Object.keys(items[0]).find(k =>
        k !== "App_ID" && k !== "app_id" &&
        k !== "Application_Name" && k !== "fileName" && k !== "rowNumber"
      )
    : null;

  if (colKey) {
    const uniqueValues = new Set(items.map(i => String(i[colKey] || "").trim()));
    const ratio = uniqueValues.size / items.length;

    if (ratio < 0.3) {
      const seen = new Set<string>();
      const deduped = items.filter(item => {
        const val = String(item[colKey] || "").trim();
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
      });
      return {
        summary: `Ditemukan ${deduped.length} nilai unik untuk kolom "${column}".`,
        totalCount: deduped.length,
        items: deduped,
      };
    }
  }

  return {
    summary: `Ditemukan ${items.length} item dengan kolom "${column}".`,
    totalCount: items.length,
    items,
  };
}

function handleMostFrequent(
  chunks: ExcelChunk[],
  instruction: LLMInstruction
): EngineResult {
  const { file, column } = instruction;

  const targetChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;

  if (!column) {
    return { summary: "Kolom tidak ditemukan.", totalCount: 0, items: [] };
  }

  const appIdPattern = detectAppIdPattern(targetChunks);
  const counter = new Map<string, number>();
  for (const chunk of targetChunks) {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!isValidAppId(appId, appIdPattern)) continue;
    const col = findMatchingColumn(chunk.row, [column]);
    if (!col) continue;
    const val = String(chunk.row[col] || "").trim();
    if (!val || val === "-") continue;
    counter.set(val, (counter.get(val) || 0) + 1);
  }

  if (counter.size === 0) {
    return { summary: "Tidak ada data ditemukan.", totalCount: 0, items: [] };
  }

  const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  const [topValue, topCount] = sorted[0];

  const items = sorted.slice(0, 3).map(([value, count]) => ({
    [column]: value,
    count,
    fileName: file || "",
  }));

  return {
    summary: `Nilai paling sering untuk kolom "${column}": "${topValue}" (${topCount}x).`,
    totalCount: topCount,
    items,
    aggregated: { topValue, topCount, column },
  };
}

function handleAverage(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  const { file, column, groupBy } = instruction as any;

  const targetChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;


  const appIdPattern = detectAppIdPattern(targetChunks);
  const seen = new Set<string>();
  const isOpexFile = file?.toLowerCase().includes("opex");
  if (!column && isOpexFile) {
  const groupMap = new Map<string, { sum: number; count: number }>();
  const groupByKey = groupBy ? groupBy : null;

  for (const chunk of targetChunks) {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!isValidAppId(appId, appIdPattern)) continue;

    // Sum semua bulan per baris
    let rowTotal = 0;
    for (const col of OPEX_MONTH_COLUMNS) {
      const val = Number(chunk.row[col] || 0);
      if (!isNaN(val)) rowTotal += val;
    }
    if (rowTotal === 0) continue;

    const group = groupByKey
      ? String(chunk.row[findMatchingColumn(chunk.row, [groupByKey]) || ""] || "Semua").trim()
      : "Semua";

    if (!groupMap.has(group)) groupMap.set(group, { sum: 0, count: 0 });
    const entry = groupMap.get(group)!;
    entry.sum += rowTotal;
    entry.count += 1;
  }

  if (groupMap.size === 0) {
    return { summary: "Tidak ada data OPEX ditemukan.", totalCount: 0, items: [] };
  }

  const items = Array.from(groupMap.entries()).map(([group, { sum, count }]) => ({
    [groupByKey || "Kategori"]: group,
    average: Math.round(sum / count),
    averageFormatted: `Rp ${Math.round(sum / count).toLocaleString("id-ID")}`,
    count,
  })).sort((a, b) => b.average - a.average);

  return {
    summary: `Rata-rata biaya OPEX${groupByKey ? ` per ${groupByKey}` : ""}: ${items.length} kategori ditemukan.`,
    totalCount: items.length,
    items,
    aggregated: { column: "biaya OPEX", groupBy: groupByKey || "Semua" },
  };
}



  // Kalau ada groupBy, hitung rata-rata per kategori
  if (groupBy) {
    const groupMap = new Map<string, { sum: number; count: number }>();

    for (const chunk of targetChunks) {
      const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
      if (!isValidAppId(appId, appIdPattern)) continue;

      const colKey = findMatchingColumn(chunk.row, [column]);
      const groupKey = findMatchingColumn(chunk.row, [groupBy]);
      if (!colKey || !groupKey) continue;

      const val = Number(chunk.row[colKey]);
      const group = String(chunk.row[groupKey] || "").trim();
      if (isNaN(val) || !group || group === "-") continue;

      if (!groupMap.has(group)) groupMap.set(group, { sum: 0, count: 0 });
      const entry = groupMap.get(group)!;
      entry.sum += val;
      entry.count += 1;
    }

    if (groupMap.size === 0) {
      return { summary: "Tidak ada data ditemukan untuk perhitungan rata-rata.", totalCount: 0, items: [] };
    }

    const MONEY_COLUMNS = [
      "nilai depresiasi", "harga perolehan",
      "januari", "februari", "febuari", "maret", "april", "mei", "juni",
      "juli", "agustus", "september", "oktober", "november", "desember"
    ];
    const isMoneyCol = MONEY_COLUMNS.some(m => column?.toLowerCase().includes(m));

    const items = Array.from(groupMap.entries()).map(([group, { sum, count }]) => ({
      [groupBy]: group,
      average: Math.round(sum / count),
      averageFormatted: isMoneyCol
        ? `Rp ${Math.round(sum / count).toLocaleString("id-ID")}`
        : Math.round(sum / count).toLocaleString("id-ID"),
      count,
    })).sort((a, b) => b.average - a.average);

    return {
      summary: `Rata-rata ${column} per ${groupBy}: ${items.length} kategori ditemukan.`,
      totalCount: items.length,
      items,
      aggregated: { column, groupBy },
    };
  }

  // Tanpa groupBy — hitung rata-rata keseluruhan
  let sum = 0;
  let count = 0;

  for (const chunk of targetChunks) {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!isValidAppId(appId, appIdPattern)) continue;
    const key = `${chunk.fileName}-${chunk.rowNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const colKey = findMatchingColumn(chunk.row, [column]);
    if (!colKey) continue;
    const val = Number(chunk.row[colKey]);
    if (!isNaN(val) && val > 0) {
      sum += val;
      count += 1;
    }
  }

  if (count === 0) {
    return { summary: "Tidak ada data numerik ditemukan.", totalCount: 0, items: [] };
  }

  const avg = Math.round(sum / count);
  const MONEY_COLUMNS = [
    "nilai depresiasi", "harga perolehan",
    "januari", "februari", "febuari", "maret", "april", "mei", "juni",
    "juli", "agustus", "september", "oktober", "november", "desember"
  ];
  const isMoneyColSingle = MONEY_COLUMNS.some(m => column?.toLowerCase().includes(m));
  const avgFormatted = isMoneyColSingle
    ? `Rp ${avg.toLocaleString("id-ID")}`
    : avg.toLocaleString("id-ID");

  return {
    summary: `Rata-rata ${column}: ${avgFormatted} dari ${count} item.`,
    totalCount: count,
    aggregated: {
      average: avg,
      averageFormatted: avgFormatted,
      count,
      column,
    },
  };
}

function handleDateFilter(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  const { file, column, value } = instruction;
  const today = new Date();

  const targetChunks = file
    ? chunks.filter((c) => c.fileName.toLowerCase().includes(file.toLowerCase()))
    : chunks;

  function checkDateCondition(raw: any, val: string): boolean {
    if (!raw || raw === "-") return false;
    let date: Date;
    if (typeof raw === "string" && raw.includes("/")) {
      const parts = raw.split("/");
      if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(raw);
      }
    } else {
      date = new Date(raw);
    }
    if (isNaN(date.getTime())) return false;
    if (val === "expired") return date < today;
    if (val === "active") return date >= today;
    if (val.startsWith("before:")) return date.getFullYear() < parseInt(val.split(":")[1]);
    if (val.startsWith("after:")) return date.getFullYear() > parseInt(val.split(":")[1]);
    if (val.startsWith("year:")) return date.getFullYear() === parseInt(val.split(":")[1]);
    return false;
  }

  let filtered = targetChunks.filter((chunk) => {
    const col = findMatchingColumn(chunk.row, [column || ""]);
    if (!col) return false;
    return checkDateCondition(chunk.row[col], (value || "").toLowerCase());
  });

  if (filtered.length === 0 && allChunks && column) {
    const crossFileIds = new Set<string>();
    for (const chunk of allChunks) {
      if (file && chunk.fileName.toLowerCase().includes(file.toLowerCase())) continue;
      const col = findMatchingColumn(chunk.row, [column]);
      if (!col) continue;
      if (checkDateCondition(chunk.row[col], (value || "").toLowerCase())) {
        const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
        if (appId) crossFileIds.add(appId);
      }
    }
    if (crossFileIds.size > 0) {
      filtered = targetChunks.filter((c) => {
        const appId = normalizeValue(c.row["App_ID"] || c.row["app_id"]);
        return crossFileIds.has(appId);
      });
    }
  }

  const appIdPattern = detectAppIdPattern(targetChunks);

  const seen = new Map<string, Set<string>>();
  const unique = filtered.filter((chunk) => {
    const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
    if (!appId) return false;
    if (!isValidAppId(appId, appIdPattern)) return false;
    if (!seen.has(chunk.fileName)) seen.set(chunk.fileName, new Set());
    if (seen.get(chunk.fileName)!.has(appId)) return false;
    seen.get(chunk.fileName)!.add(appId);
    return true;
  });

  let items: any[] = unique.map((c) => ({
    ...c.row,
    fileName: c.fileName,
    rowNumber: c.rowNumber,
  }));

  if (allChunks && allChunks.length > 0) {
    const multiRowFiles = detectMultiRowFiles(allChunks);
    items = joinByAppId(items, allChunks, multiRowFiles);
  }

  return {
    summary: `Ditemukan ${items.length} item dengan filter tanggal "${value}" pada kolom "${column}".`,
    totalCount: items.length,
    items,
  };
}

// ===== DATA QUALITY CHECK =====
export type DataIssue = {
  file: string;
  type: string;
  detail: string;
};

export function detectDataIssues(chunks: ExcelChunk[]): DataIssue[] {
  const issues: DataIssue[] = [];

  const byFile = new Map<string, ExcelChunk[]>();
  for (const chunk of chunks) {
    if (!byFile.has(chunk.fileName)) byFile.set(chunk.fileName, []);
    byFile.get(chunk.fileName)!.push(chunk);
  }

  for (const [fileName, fileChunks] of byFile.entries()) {
    if (!fileChunks.length) continue;
    const sampleRow = fileChunks[0].row;

    const livCol = findMatchingColumn(sampleRow, ["Date_LIve", "Date_Live", "date live"]);
    const decCol = findMatchingColumn(sampleRow, ["Date_Decom", "date decom"]);

    if (livCol && decCol) {
      for (const chunk of fileChunks) {
        const appId = chunk.row["App_ID"] || chunk.row["app_id"] || "-";
        const live = new Date(chunk.row[livCol]);
        const decom = new Date(chunk.row[decCol]);
        if (!isNaN(live.getTime()) && !isNaN(decom.getTime()) && live > decom) {
          issues.push({
            file: fileName,
            type: "Date_Live > Date_Decom",
            detail: `${appId} — Live (${live.toISOString().slice(0, 10)}) lebih besar dari Decom (${decom.toISOString().slice(0, 10)})`,
          });
        }
      }
    }

    const hostCol = findMatchingColumn(sampleRow, ["Host name", "hostname", "host_name"]);
    if (hostCol) {
      const pairCount = new Map<string, number>();
      for (const chunk of fileChunks) {
        const appId = normalizeValue(chunk.row["App_ID"] || chunk.row["app_id"]);
        const hostname = normalizeValue(chunk.row[hostCol]);
        if (!appId || !hostname || hostname === "-" || hostname === "nan") continue;
        const key = `${appId}|||${hostname}`;
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }

      for (const [key, count] of pairCount.entries()) {
        if (count > 1) {
          const [appId, hostname] = key.split("|||");
          issues.push({
            file: fileName,
            type: "Duplikat App_ID + Hostname",
            detail: `${appId} + ${hostname} muncul ${count}x`,
          });
        }
      }
    }
  }

  return issues;
}

export function executeInstruction(
  chunks: ExcelChunk[],
  instruction: LLMInstruction,
  allChunks?: ExcelChunk[]
): EngineResult {
  console.log("[Engine] Executing instruction:", instruction);

  switch (instruction.operation) {
    case "filter":
      return handleFilter(chunks, instruction, allChunks);
    case "sum":
      return handleSum(chunks, instruction, allChunks);
    case "count":
      return handleCount(chunks, instruction, allChunks);
    case "lookup":
      return handleLookup(chunks, instruction, allChunks);
    case "list":
      return handleList(chunks, instruction, allChunks);
    case "most_frequent":
      return handleMostFrequent(chunks, instruction);
    case "date_filter":
      return handleDateFilter(chunks, instruction, allChunks);
    case "average":                                          // ← TAMBAH DI SINI
      return handleAverage(chunks, instruction, allChunks);
    case "general":
    default:
      return {
        summary: "Data disiapkan untuk analisis LLM.",
        totalCount: chunks.length,
      };
  }
}