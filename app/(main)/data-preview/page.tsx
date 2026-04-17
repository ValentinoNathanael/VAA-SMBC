"use client";

import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";

type FileItem = {
  id: string;
  file_name: string;
  uploaded_at?: string;
  bucket?: string;
  object_key?: string;
};

function excelDateToString(serial: any): string {
  if (!serial || isNaN(Number(serial))) return String(serial ?? "");
  const num = Number(serial);
  if (num < 40000) return String(serial);
  const date = new Date((num - 25569) * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

export default function DataPreviewPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [columns, setColumns] = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [meta, setMeta] = useState<{ sheetName?: string; sheetNames?: string[]; totalRows?: number; fileId?: string }>({});
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [hoverSelect, setHoverSelect] = useState(false);
  const [hoverClear, setHoverClear] = useState(false);

  async function loadFiles() {
    const [filesRes, activeRes] = await Promise.all([
      fetch("/api/files", { cache: "no-store" }),
      fetch("/api/active-file", { cache: "no-store" }),
    ]);

    const filesJson = await filesRes.json();
    const activeJson = await activeRes.json().catch(() => ({}));

    const items: FileItem[] = (filesJson.items ?? filesJson.data ?? []).map((r: any) => ({
      id: String(r.id),
      file_name: String(r.file_name ?? r.name ?? ""),
      uploaded_at: r.uploaded_at,
      bucket: r.bucket,
      object_key: r.object_key,
    }));

    setFiles(items);

    const activeId = String(activeJson?.fileId ?? "");
    const exists = items.some((x) => x.id === activeId);
    if (activeId && exists) setSelectedFileId(activeId);
    else if (items.length) setSelectedFileId(items[0].id);
  }

  async function safeJson(res: Response) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text };
    }
  }

  async function loadPreview(sheetOverride?: string) {
    if (!selectedFileId) return;

    setLoading(true);
    try {
      const s = await fetch("/api/active-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: selectedFileId }),
      });

      const sData: any = await safeJson(s);
      if (!s.ok) {
        throw new Error(sData?.error ?? "Failed to set active file");
      }

      const sheet = sheetOverride ?? selectedSheet;
      const query = sheet ? `?all=true&sheet=${encodeURIComponent(sheet)}` : "?all=true";
      const res = await fetch(`/api/preview${query}`, { cache: "no-store" });
      const data: any = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to preview");
      }

      setColumns(data.columns ?? []);
      setRows(data.rows ?? []);
      setMeta({
        sheetName: data.sheetName,
        sheetNames: data.sheetNames ?? [data.sheetName],
        totalRows: data.totalRows,
        fileId: data.fileId,
      });

      if (data.sheetName) setSelectedSheet(data.sheetName);
      setSelectedCols(new Set(data.columns ?? []));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedColumnsArray = useMemo(() => Array.from(selectedCols), [selectedCols]);

  function toggleCol(col: string) {
    setSelectedCols((prev) => {
      const n = new Set(prev);
      if (n.has(col)) n.delete(col);
      else n.add(col);
      return n;
    });
  }

  const displayRows = useMemo(() => {
    if (!selectedColumnsArray.length) return [];
    return rows.map((r) => {
      const out: Record<string, any> = {};
      for (const c of selectedColumnsArray) out[c] = r[c];
      return out;
    });
  }, [rows, selectedColumnsArray]);

  const hasMultipleSheets = (meta.sheetNames?.length ?? 0) > 1;

  return (
    <div className="min-h-screen" style={{ color: "#1A4731" }}>

      {/* ── Page Header ── */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "#1A4731", letterSpacing: "-0.02em" }}
          >
            Data Preview
          </h1>
          <p className="text-xs mt-1" style={{ color: "#4A6A56" }}>
            Inspect and filter columns from the active Excel dataset
          </p>
        </div>

        {/* Meta chips */}
        {meta.fileId && (
          <div className="flex items-center gap-2">
            {[
              { label: "Sheet", value: meta.sheetName },
              { label: "Rows", value: meta.totalRows?.toLocaleString() },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
                style={{
                  background: "#EEF7DC",
                  border: "1px solid #D4E8C2",
                  color: "#4A6A56",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "#8DC63F" }}
                />
                {label}:{" "}
                <span className="font-semibold" style={{ color: "#1A4731" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Controls Bar ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* File select */}
        <div className="relative">
          <select
            value={selectedFileId}
            onChange={async (e) => {
              const id = e.target.value;
              setSelectedFileId(id);
              setSelectedSheet("");
              await fetch("/api/active-file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId: id }),
              });
            }}
            className="appearance-none text-sm font-medium pr-9 pl-3.5 py-2 rounded-xl outline-none cursor-pointer transition-all"
            style={{
              background: "#F7F8F5",
              border: "1px solid #D4E8C2",
              color: "#1A4731",
              minWidth: "200px",
            }}
          >
            {files.map((f) => (
              <option key={f.id} value={f.id} style={{ background: "#ffffff" }}>
                {f.file_name}
              </option>
            ))}
          </select>
          <div
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            style={{
              width: 0, height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "5px solid #4A6A56",
            }}
          />
        </div>

        {/* Sheet selector */}
        {hasMultipleSheets && (
          <div className="relative">
            <select
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
              className="appearance-none text-sm font-medium pr-9 pl-3.5 py-2 rounded-xl outline-none cursor-pointer transition-all"
              style={{
                background: "#EEF7DC",
                border: "1px solid #8DC63F",
                color: "#1A4731",
                minWidth: "160px",
              }}
            >
              {meta.sheetNames?.map((s) => (
                <option key={s} value={s} style={{ background: "#ffffff", color: "#1A4731" }}>
                  {s}
                </option>
              ))}
            </select>
            <div
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              style={{
                width: 0, height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: "5px solid #8DC63F",
              }}
            />
          </div>
        )}

        {/* Load button */}
        <button
          disabled={!selectedFileId || loading}
          onClick={() => loadPreview()}
          className="flex items-center gap-2 text-sm font-bold px-5 py-2 rounded-xl transition-all disabled:opacity-40"
          style={{ background: "#8DC63F", color: "#1A4731" }}
        >
        <Play size={12} color="#1A4731" fill="#1A4731" />
          {loading ? "Loading..." : "Load Preview"}
        </button>

        {/* Divider */}
        <div className="w-px h-7" style={{ background: "#D4E8C2" }} />

        {/* Select / Clear All */}
        <button
          disabled={!columns.length}
          onClick={() => setSelectedCols(new Set(columns))}
          onMouseEnter={() => setHoverSelect(true)}
          onMouseLeave={() => setHoverSelect(false)}
          className="text-xs font-medium px-3.5 py-2 rounded-lg transition-all disabled:opacity-40"
          style={{
            background: hoverSelect ? "#EEF7DC" : "transparent",
            border: hoverSelect ? "1px solid #8DC63F" : "1px solid #D4E8C2",
            color: hoverSelect ? "#1A4731" : "#4A6A56",
          }}
        >
          Select All
        </button>

        <button
          disabled={!columns.length}
          onClick={() => setSelectedCols(new Set())}
          onMouseEnter={() => setHoverClear(true)}
          onMouseLeave={() => setHoverClear(false)}
          className="text-xs font-medium px-3.5 py-2 rounded-lg transition-all disabled:opacity-40"
          style={{
            background: hoverClear ? "#EEF7DC" : "transparent",
            border: hoverClear ? "1px solid #8DC63F" : "1px solid #D4E8C2",
            color: hoverClear ? "#1A4731" : "#4A6A56",
          }}
        >
          Clear All
        </button>
      </div>

      {/* ── Column Pills ── */}
      {columns.length > 0 && (
        <div className="mb-5">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-2.5"
            style={{ color: "#4A6A56" }}
          >
            Visible Columns
          </p>
          <div className="flex flex-wrap gap-1.5">
            {columns.map((c) => {
              const active = selectedCols.has(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCol(c)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono transition-all"
                  style={{
                    background: active ? "#EEF7DC" : "#F7F8F5",
                    border: active ? "1px solid #8DC63F" : "1px solid #D4E8C2",
                    color: active ? "#1A4731" : "#4A6A56",
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-sm flex items-center justify-center shrink-0"
                    style={{
                      background: active ? "#8DC63F" : "transparent",
                      border: active ? "1.5px solid #8DC63F" : "1.5px solid #D4E8C2",
                    }}
                  >
                    {active && (
                      <svg width="7" height="5" viewBox="0 0 7 5" fill="none">
                        <path d="M1 2.5L2.8 4L6 1" stroke="#1A4731" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: "1px solid #D4E8C2",
          background: "#ffffff",
        }}
      >
        <div className="overflow-auto" style={{ maxHeight: "480px" }}>
          <table className="w-full text-sm border-collapse">
            <thead
              className="sticky top-0 z-10"
              style={{ background: "#F4F7F2", borderBottom: "2px solid #8DC63F" }}
            >
              <tr>
                {selectedColumnsArray.length === 0 ? (
                  <th
                    className="text-left px-6 py-5 text-sm font-normal"
                    style={{ color: "#4A6A56" }}
                  >
                    {columns.length === 0
                      ? "Select a file and click Load Preview to begin"
                      : "No columns selected"}
                  </th>
                ) : (
                  selectedColumnsArray.map((c, i) => (
                    <th
                      key={c}
                      className="text-left px-4 py-3 text-xs font-semibold tracking-widest uppercase whitespace-nowrap font-mono"
                      style={{
                        color: i === 0 ? "#1A4731" : "#4A6A56",
                        borderRight: "1px solid #D4E8C2",
                        borderLeft: i === 0 ? "3px solid #8DC63F" : undefined,
                        fontWeight: 700,
                        background: "#F4F7F2",
                        ...(i === 0 && {
                          position: "sticky",
                          left: 0,
                          zIndex: 3,
                        }),
                      }}
                    >
                      {c}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, idx) => (
                <tr
                  key={idx}
                  className="transition-colors"
                  style={{
                    borderBottom: "1px solid #F0F5EE",
                    background: idx % 2 === 0 ? "#ffffff" : "#F7FCF4",
                  }}
                >
                  {selectedColumnsArray.map((c, ci) => {
                    const MONTH_COLS = ["januari","febuari","februari","maret","april","mei","juni",
                      "juli","agustus","september","oktober","november","desember"];

                    const isDateCol = c.toLowerCase().includes("date") ||
                      c.toLowerCase().includes("tanggal") ||
                      c.toLowerCase().includes("live") ||
                      c.toLowerCase().includes("decom");

                    const isMoneyCol = MONTH_COLS.includes(c.toLowerCase().trim()) ||
                      c.toLowerCase().includes("harga") ||
                      c.toLowerCase().includes("nilai");

                    const raw = r[c];
                    const val = isDateCol
                      ? excelDateToString(raw)
                      : isMoneyCol && raw !== undefined && raw !== "" && !isNaN(Number(raw))
                        ? `Rp ${Number(raw).toLocaleString("id-ID")}`
                        : String(raw ?? "");
                    const isStatus = c.toLowerCase() === "status";
                    const isActive = val.toLowerCase() === "active";

                    return (
                      <td
                        key={c}
                        className="px-4 py-2.5 whitespace-nowrap"
                        style={{
                          color: ci === 0 ? "#1A4731" : "#4A6A56",
                          fontWeight: ci === 0 ? 600 : 400,
                          fontFamily: ci === 0 ? "monospace" : undefined,
                          fontSize: ci === 0 ? "12px" : "12.5px",
                          borderRight: "1px solid #F0F5EE",
                          ...(ci === 0 && {
                            position: "sticky",
                            left: 0,
                            zIndex: 1,
                            background: idx % 2 === 0 ? "#ffffff" : "#F7FCF4",
                          }),
                        }}
                      >
                        {isStatus ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                            style={
                              isActive
                                ? {
                                    background: "#EEF7DC",
                                    border: "1px solid #8DC63F",
                                    color: "#1A4731",
                                  }
                                : {
                                    background: "#FEE2E2",
                                    border: "1px solid #FCA5A5",
                                    color: "#991B1B",
                                  }
                            }
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: "currentColor" }}
                            />
                            {val}
                          </span>
                        ) : (
                          val
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{
            borderTop: "1px solid #D4E8C2",
            background: "#F7F8F5",
          }}
        >
          <span className="text-xs font-mono" style={{ color: "#4A6A56" }}>
            {meta.fileId
              ? <>Showing <span style={{ color: "#1A4731" }}>{rows.length.toLocaleString()}</span> rows</>
              : <>No data loaded · <span style={{ color: "#4A6A56" }}>Select a file to begin</span></>
            }
          </span>
          {columns.length > 0 && (
            <span className="text-xs font-mono" style={{ color: "#4A6A56" }}>
              <span style={{ color: "#1A4731" }}>{selectedColumnsArray.length}</span> / {columns.length} columns visible
            </span>
          )}
        </div>
      </div>

      {!rows.length && meta.fileId && (
        <p className="mt-3 text-sm" style={{ color: "#4A6A56" }}>
          No data to display.
        </p>
      )}
    </div>
  );
}