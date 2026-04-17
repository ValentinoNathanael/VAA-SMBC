"use client";

import { useEffect, useMemo, useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, Customized, CartesianGrid,
} from "recharts";
import dynamic from "next/dynamic";

const Select = dynamic(() => import("react-select"), { ssr: false });

type Row = Record<string, any>;

export default function VisualizationPage() {
const [columns, setColumns] = useState<string[]>([]);
const [rows, setRows] = useState<Row[]>([]);
const [loading, setLoading] = useState(false);
const [tab, setTab] = useState<"bar" | "waterfall">("bar");
const [xCols, setXCols] = useState<string[]>([]);
const [hueCols, setHueCols] = useState<string[]>([]);
const [statusSelected, setStatusSelected] = useState<string[]>([]);
const [show, setShow] = useState(false);
const [files, setFiles] = useState<{id: string, file_name: string}[]>([]);
const [selectedFileId, setSelectedFileId] = useState<string>("");


function findCol(cols: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const found = cols.find(c => c.trim().toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return undefined;
}

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash ^ (hash >> 16);
  }
  const hue = Math.abs(hash * 137.508) % 360;
  const sat = 55 + (Math.abs(hash) % 20);
  const lit = 42 + (Math.abs(hash >> 8) % 16);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

function toYear(v: any): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getFullYear();
  if (typeof v === "number" && v > 20000) {
    const d = new Date(new Date(Date.UTC(1899, 11, 30)).getTime() + v * 86400000);
    return d.getUTCFullYear();
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

function normalizeStatus(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function shortenLabel(text: string, max = 16) {
  const clean = String(text ?? "");
  return clean.length > max ? clean.slice(0, max) + "..." : clean;
}

function makeXTickLabelFromFull(full: string) {
  const parts = String(full).split(" | ").map(p => p.trim());
  return parts[0] ?? "";
}

async function loadPreviewData(fileId?: string) {
  setLoading(true);
  try {
    if (fileId) {
      await fetch("/api/active-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
    }
    const res = await fetch("/api/preview?all=true", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Failed to load preview");
    setColumns(data.columns ?? []);
    setRows(data.rows ?? []);
  } finally {
    setLoading(false);
  }
} 

useEffect(() => {
  fetch("/api/files")
    .then(r => r.json())
    .then(data => {
      const items = data.items ?? [];
      setFiles(items);
      if (items.length > 0) {
        setSelectedFileId(items[0].id);
        loadPreviewData(items[0].id);
      }
    });
}, []);

const statusKey = useMemo(() => findCol(columns, "Status"), [columns]);
const liveKey   = useMemo(() => findCol(columns, "Date_Live", "Date_LIve", "DateLive", "date live"), [columns]);
const decomKey  = useMemo(() => findCol(columns, "Date_Decom", "Date_Decomm", "DateDecom", "date decom"), [columns]);
const hasStatus = useMemo(() => !!statusKey, [statusKey]);

const statusOptions = useMemo(() => {
  if (!statusKey) return [];
  const set = new Set<string>();
  for (const r of rows) {
    const v = String(r[statusKey] ?? "").trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}, [rows, statusKey]);

const filteredRows = useMemo(() => {
  if (!statusKey || !statusSelected.length) return rows;
  return rows.filter(r => statusSelected.includes(String(r[statusKey] ?? "").trim()));
}, [rows, statusKey, statusSelected]);

const xFirstCol = xCols?.[0] ?? "";

const chartData = useMemo(() => {
  if (!show || !xCols.length) return [];
  const map = new Map<string, Record<string, any>>();
  for (const r of filteredRows) {
    const x = xCols.map(c => String(r[c] ?? "").trim()).join(" | ") || "(Empty)";
    const hue = hueCols.length ? hueCols.map(c => String(r[c] ?? "").trim()).join(" | ") : "Total";
    if (!map.has(x)) map.set(x, { x });
    const obj = map.get(x)!;
    obj[hue] = (obj[hue] ?? 0) + 1;
  }
  const arr = Array.from(map.values());
  if (xFirstCol) {
    arr.sort((a, b) => {
      const ap = String(a.x ?? "").split(" | ").map(s => s.trim());
      const bp = String(b.x ?? "").split(" | ").map(s => s.trim());
      if (ap[0] !== bp[0]) return (ap[0] ?? "").localeCompare(bp[0] ?? "");
      return ap.slice(1).join(" | ").localeCompare(bp.slice(1).join(" | "));
    });
  }
  return arr;
}, [show, filteredRows, xCols, hueCols, xFirstCol]);

const bridgeData = useMemo(() => {
  if (!rows?.length || !liveKey || !decomKey || !statusKey) return [];
  const activeMap = new Map<number, number>();
  const decomMap  = new Map<number, number>();
  for (const r of rows) {
    const st = normalizeStatus(r[statusKey]);
    if (st === "active") {
      const y = toYear(r[liveKey]);
      if (y != null) activeMap.set(y, (activeMap.get(y) ?? 0) + 1);
    }
    if (st === "decommissioned") {
      const y = toYear(r[decomKey]);
      if (y != null) decomMap.set(y, (decomMap.get(y) ?? 0) + 1);
    }
  }
  const years = Array.from(new Set([...activeMap.keys(), ...decomMap.keys()])).sort((a, b) => a - b);
  if (!years.length) return [];
  let runningTotal = 0;
  const out: Array<{ year: number; total: number; plus: number; minus: number; plusBase: number; minusBase: number }> = [];
  for (let y = years[0]; y <= years[years.length - 1]; y++) {
    const plus = activeMap.get(y) ?? 0;
    const minusAbs = decomMap.get(y) ?? 0;
    const plusBase = runningTotal;
    const minusBase = runningTotal + plus;
    runningTotal = runningTotal + plus - minusAbs;
    out.push({ year: y, total: runningTotal, plus, minus: -minusAbs, plusBase, minusBase });
  }
  return out;
}, [rows, liveKey, decomKey, statusKey]);

const barKeys = useMemo(() => {
  if (!show) return [];
  if (!hueCols.length) return ["Total"];
  const set = new Set<string>();
  for (const d of chartData) for (const k of Object.keys(d)) if (k !== "x") set.add(k);
  return Array.from(set).sort();
}, [show, hueCols, chartData]);

const chartDataWithTotal = useMemo(() => {
  return chartData.map(d => {
    const total = barKeys.reduce((sum, k) => sum + (Number(d[k]) || 0), 0);
    return { ...d, _total: total };
  });
}, [chartData, barKeys]);

const groupBands = useMemo(() => {
  if (!show || !xCols.length || !chartData.length) return [];
  const bands: Array<{ name: string; start: number; end: number }> = [];
  for (let i = 0; i < chartData.length; i++) {
    const groupName = String(chartData[i]?.x ?? "").split(" | ")[0]?.trim() ?? "(Empty)";
    if (!bands.length) { bands.push({ name: groupName, start: i, end: i }); continue; }
    const last = bands[bands.length - 1];
    if (last.name === groupName) last.end = i;
    else bands.push({ name: groupName, start: i, end: i });
  }
  return bands;
}, [show, xCols, chartData]);

const summaryCards = useMemo(() => ({
  totalData: filteredRows.length,
  totalKategori: chartData.length,
  totalPembanding: hueCols.length > 0 ? barKeys.length : 0,
}), [filteredRows.length, chartData.length, barKeys.length]);

const selectStyles = {
  control: (base: any) => ({ ...base, backgroundColor: "#F7F8F5", borderColor: "#D4E8C2", borderRadius: "12px", padding: "4px 6px", boxShadow: "none", "&:hover": { borderColor: "#8DC63F" } }),
  menu: (base: any) => ({ ...base, backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #D4E8C2", boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }),
  option: (base: any, state: any) => ({ ...base, backgroundColor: state.isFocused ? "#EEF7DC" : "transparent", color: state.isFocused ? "#1A4731" : "#4A6A56", borderRadius: "8px", padding: "8px 12px" }),
  multiValue: (base: any) => ({ ...base, backgroundColor: "#EEF7DC", borderRadius: "6px", border: "1px solid #D4E8C2" }),
  multiValueLabel: (base: any) => ({ ...base, color: "#1A4731", fontSize: "12px", fontWeight: 600 }),
  multiValueRemove: (base: any) => ({ ...base, color: "#4A6A56", ":hover": { backgroundColor: "#FEE2E2", color: "#991B1B" } }),
  input: (base: any) => ({ ...base, color: "#1A4731" }),
  singleValue: (base: any) => ({ ...base, color: "#1A4731" }),
  placeholder: (base: any) => ({ ...base, color: "#4A6A56" }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base: any) => ({ ...base, color: "#4A6A56" }),
};

return (
  <div className="min-h-screen" style={{ color: "#1A4731" }}>

    {/* Header + Tab */}
    <div className="flex items-end justify-between mb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#1A4731", letterSpacing: "-0.02em" }}>Data Visualization</h1>
        <p className="text-xs mt-1" style={{ color: "#4A6A56" }}>{loading ? "Loading data..." : "Explore and visualize your Excel dataset"}</p>
      </div>
      <div className="inline-flex rounded-full p-1" style={{ background: "#F7F8F5", border: "1px solid #D4E8C2" }}>
        {(["bar", "waterfall"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200"
            style={tab === t ? { background: "#8DC63F", color: "#1A4731" } : { background: "transparent", color: "#4A6A56" }}>
            {t === "bar" ? "Bar Chart" : "Waterfall Chart"}
          </button>
        ))}
      </div>
    </div>

    {/* ═══════════════ BAR CHART ═══════════════ */}
    {tab === "bar" && (
      <>
        {files.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-xs font-bold tracking-widest uppercase" style={{ color: "#1A4731" }}>
            Select File
          </label>
          <select
            value={selectedFileId}
            onChange={(e) => {
              setSelectedFileId(e.target.value);
              setShow(false);
              setXCols([]);
              setHueCols([]);
              loadPreviewData(e.target.value);
            }}
            style={{
              background: "#F7F8F5", border: "1px solid #D4E8C2",
              borderRadius: 10, padding: "6px 12px",
              color: "#1A4731", fontSize: 13, outline: "none",
            }}
          >
            {files.map(f => (
              <option key={f.id} value={f.id}>{f.file_name}</option>
            ))}
          </select>
        </div>
      )}
        <div className="rounded-2xl p-6 mb-6" style={{
          background: "#ffffff",
          border: "1px solid #D4E8C2",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-5 rounded-full" style={{ background: "#8DC63F" }} />
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "#1A4731" }}>Chart Configuration</p>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <label className="block text-xs font-bold mb-2 tracking-widest uppercase" style={{ color: "#1A4731" }}>Main Category (X-axis)</label>
              <Select isMulti
                options={columns.filter(c => !hueCols.includes(c)).map(c => ({ value: c, label: c.trim() }))}
                value={xCols.map(c => ({ value: c, label: c.trim() }))}
                onChange={(s) => {
                  const selected = Array.isArray(s) ? s.map((x: any) => x.value) : [];
                  if (selected.length <= 2) setXCols(selected);
                }}
                styles={selectStyles} placeholder="Select column(s)..." />
                <p className="mt-1 text-xs" style={{ color: "#4A6A56" }}>Maximum 2 columns</p>
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 tracking-widest uppercase" style={{ color: "#1A4731" }}>
                Comparison Column <span style={{ color: "#4A6A56", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
              </label>
              <Select isMulti
                options={columns.filter(c => !xCols.includes(c)).map(c => ({ value: c, label: c.trim() }))}
                value={hueCols.map(c => ({ value: c, label: c.trim() }))}
                onChange={(s) => {
                  const selected = Array.isArray(s) ? s.map((x: any) => x.value) : [];
                  if (selected.length <= 2) setHueCols(selected);
                }}
                styles={selectStyles} placeholder="Select column(s)..." />
                <p className="mt-1 text-xs" style={{ color: "#4A6A56" }}>Maximum 2 columns</p> 
            </div>
          </div>
          {hasStatus && (
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid #D4E8C2" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-1 h-4 rounded-full" style={{ background: "#8DC63F" }} />
                <label className="text-xs font-bold tracking-widest uppercase" style={{ color: "#1A4731" }}>Status Filter</label>
              </div>
              <div className="flex gap-2 flex-wrap">
                {statusOptions.map(s => {
                  const checked = statusSelected.includes(s);
                  return (
                    <button key={s}
                      onClick={() => setStatusSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: checked ? "#8DC63F" : "#F7F8F5",
                        border: checked ? "1.5px solid #8DC63F" : "1.5px solid #D4E8C2",
                        color: checked ? "#1A4731" : "#4A6A56",
                        boxShadow: checked ? "0 0 12px rgba(141,198,63,0.25)" : "none",
                      }}>
                      {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#1A4731" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-6 pt-5 flex items-center gap-4" style={{ borderTop: "1px solid #D4E8C2" }}>
            <button disabled={!xCols.length} onClick={() => setShow(true)}
              className="flex items-center gap-2 text-sm font-bold px-6 py-2.5 rounded-xl transition-all disabled:opacity-40"
              style={{ background: "#8DC63F", color: "#1A4731", boxShadow: "0 0 20px rgba(141,198,63,0.2)" }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-black" style={{ border: "2px solid #1A4731" }}>▶</span>
              Show Bar Chart
            </button>
            {show && <span className="text-xs" style={{ color: "#4A6A56" }}>Showing <span style={{ color: "#1A4731" }}>{filteredRows.length.toLocaleString()}</span> rows</span>}
            {show && (
              <button
                onClick={() => {
                  setShow(false);
                  setHueCols([]);
                  setXCols([]);
                }}
                className="text-xs font-medium px-3.5 py-2 rounded-lg transition-all"
                style={{
                  background: "#FEE2E2",
                  border: "1px solid #FCA5A5",
                  color: "#991B1B",
                  cursor: "pointer"
                }}
              >
                ✕ Reset Chart
              </button>
            )}

          </div>
          {hueCols.length > 0 && barKeys.length > 20 && (
            <p style={{ 
              color: "#92400E", 
              fontSize: 12, 
              marginTop: 8,
              background: "#FFFBEB",
              border: "1px solid #FCD34D",
              borderRadius: 8,
              padding: "8px 12px"
            }}>
              ⚠️ Comparison Column produces <strong>{barKeys.length} unique categories</strong> the chart may be hard to read. It is recommended to select a column with fewer values (e.g., Status, LOB, Deployment Type).`
            </p>
          )}
        </div>

        {show && (
          <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm" style={{ border: "1px solid #D4E8C2" }}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-black">Application Count Comparison</h2>
              <p className="text-sm text-zinc-500">The X-axis shows the main categories, the colors indicate the comparison columns.</p>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {[["Number of Data Displayed", summaryCards.totalData], ["Number of Categories", summaryCards.totalKategori], ["Number of Comparisons", summaryCards.totalPembanding]].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-500">{label}</div>
                  <div className="text-lg font-semibold text-black">{val}</div>
                </div>
              ))}
            </div>
            <div className="mb-4 max-h-28 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Color Description</div>
              <div className="flex flex-wrap gap-3">
                {hueCols.length > 0 && barKeys.map(k => (
                  <div key={k} className="flex items-center gap-2 text-sm text-zinc-700">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: stringToColor(k) }} />
                    <span>{k}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height: "450px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataWithTotal} margin={{ top: 32, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="x" tick={{ fill: "#111", fontSize: 12 }} tickFormatter={v => shortenLabel(makeXTickLabelFromFull(String(v)), 14)} interval={0} angle={-15} textAnchor="end" height={70} />
                  <Customized component={(props: any) => {
                    const { xAxisMap, height } = props;
                    const xScale = xAxisMap?.[0]?.scale;
                    if (!xScale || !groupBands.length) return null;
                    const cats = chartDataWithTotal.map(d => (d as any).x);
                    return (
                      <g>
                        {groupBands.map((g, idx) => {
                          const xStart = xScale(cats[g.start]); const xEnd = xScale(cats[g.end]);
                          const mid = (xStart + xEnd) / 2;
                          const count = g.end - g.start + 1;
                          const sepX = xEnd + (count > 0 ? (xEnd - xStart) / count : 0) / 2;
                          const isLast = idx === groupBands.length - 1;
                          return (
                            <g key={g.name + idx}>
                              <text x={mid} y={height - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="#111">{shortenLabel(g.name, 18)}</text>
                              {!isLast && <line x1={sepX} x2={sepX} y1={0} y2={height - 35} stroke="#E5E7EB" strokeWidth={1} />}
                            </g>
                          );
                        })}
                      </g>
                    );
                  }} />
                  <YAxis tick={{ fill: "#111" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", color: "#111" }}
                    labelStyle={{ color: "#111", fontWeight: 600 }}
                    itemStyle={{ color: "#111" }}
                    wrapperStyle={{ zIndex: 50, maxHeight: "300px", overflowY: "auto" }}
                    formatter={(value: any, name: any) => {
                      if (name === "_total") return null;
                      return [value, name];
                    }}
                  />
                  {barKeys.map(k => <Bar key={k} dataKey={k} stackId={hueCols.length ? "a" : undefined} fill={stringToColor(k)} radius={[4, 4, 0, 0]} />)}
                  <Bar dataKey="_total" stackId="__label__" fill="transparent" stroke="none" legendType="none" isAnimationActive={false}
                    label={(props: any) => {
                      const { x, y, width, value } = props;
                      if (!value) return null;
                      const labelW = String(value).length * 7 + 12;
                      const cx = x + width / 2;
                      return (
                        <g>
                          <rect x={cx - labelW / 2} y={y - 20} width={labelW} height={16} rx={4} fill="white" stroke="#e5e7eb" strokeWidth={1} />
                          <text x={cx} y={y - 8} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill="#111">{value}</text>
                        </g>
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-xs text-zinc-500">Hover over the bars to see detailed application counts</div>
          </div>
        )}
      </>
    )}

    {/* ═══════════════ WATERFALL ═══════════════ */}
    {tab === "waterfall" && (
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm" style={{ border: "1px solid #D4E8C2" }}>
        {bridgeData.length === 0 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            There is no valid data.
            {!liveKey && <span className="block mt-1">• Date_LIve not found</span>}
            {!decomKey && <span className="block mt-1">• Date_Decom column not found</span>}
            {!statusKey && <span className="block mt-1">• Status column not found</span>}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-black">Total Application Change per Year</h2>
              <p className="text-sm text-zinc-500">This chart shows new application additions, reductions due to decommissioning, and the total number of applications at the end of each year.</p>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Year Range</div>
                <div className="text-lg font-semibold text-black">{bridgeData[0]?.year} - {bridgeData[bridgeData.length - 1]?.year}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Total New</div>
                <div className="text-lg font-semibold text-green-600">{bridgeData.reduce((s, i) => s + (Number(i.plus) || 0), 0)}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Total Decommissioned</div>
                <div className="text-lg font-semibold text-red-600">{bridgeData.reduce((s, i) => s + Math.abs(Number(i.minus) || 0), 0)}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Total Applications (End of Period)</div>
                <div className="text-lg font-semibold text-blue-600">{bridgeData[bridgeData.length - 1]?.total ?? 0}</div>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 text-sm font-semibold text-blue-900">How to read this chart</div>
              <div className="grid gap-2 text-sm text-blue-900 md:grid-cols-2">
                <div>• The green bars show the number of new applications per year.</div>
                <div>• The red bar shows the number of applications that were decommissioned..</div>
                <div>• The blue bar shows the total applications at the end of that year..</div>
                <div>• Read the chart from left to right in year order..</div>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Color Description</div>
              <div className="flex flex-wrap gap-4 text-sm text-zinc-700">
                <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-blue-600" /><span>Total Applications (End of Year)</span></div>
                <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-green-600" /><span>New</span></div>
                <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-red-600" /><span>Decommissioned</span></div>
              </div>
            </div>
            <div style={{ height: "460px" }} className="rounded-xl border border-zinc-200 bg-white p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bridgeData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{ fill: "#111", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#111", fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", color: "#111" }}
                    labelStyle={{ color: "#111", fontWeight: 600 }}
                    formatter={(val: any, name: any) => {
                      const v = Number(val ?? 0);
                      if (name === "minus") return [String(Math.abs(v)), "Decommissioned"];
                      if (name === "plus") return [String(v), "New"];
                      if (name === "total") return [String(v), "Total Applications"];
                      return [String(v), name];
                    }} />
                  <Bar dataKey="total" name="Total Applications" fill="#2563EB" radius={[4, 4, 0, 0]}
                    label={(props: any) => {
                      const { x, y, width, height, value } = props;
                      const v = Number(value ?? 0);
                      if (!v || height < 20) return null;
                      return <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={15} fontWeight={800} fill="#FACC15">{v}</text>;
                    }} />
                  <Bar dataKey="plusBase" stackId="p" fill="rgba(0,0,0,0)" />
                  <Bar dataKey="plus" stackId="p" name="New" fill="#16A34A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="minusBase" stackId="m" fill="rgba(0,0,0,0)" />
                  <Bar dataKey="minus" stackId="m" name="Decommissioned" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-xs text-zinc-500">Hover on the bar to see details of the number of New, Decommissioned, and Total Applications.</div>
          </>
        )}
      </div>
    )}
  </div>
);
}