"use client";

import { useState, useRef, useEffect } from "react";
import { Download } from "lucide-react";
import { AlertTriangle } from "lucide-react";

function parseAnswer(answer: string): { intro: string; items: string[] } {
  const items: string[] = [];
  const introLines: string[] = [];

  const inlineMatch = answer.match(/\d+\.\s+[^0-9.][^]*?(?=\s+\d+\.|$)/g);
  if (inlineMatch && inlineMatch.length > 1) {
    inlineMatch.forEach((m) => items.push(m.replace(/^\d+\.\s+/, "").trim()));
    const firstNum = answer.indexOf("1.");
    if (firstNum > 0) introLines.push(answer.slice(0, firstNum).trim());
    return { intro: introLines.join(" "), items: items.filter(item => item.trim().length > 0) };
  }

  const lines = answer.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) items.push(match[1]);
    else if (items.length === 0) introLines.push(line);
  }

  return { intro: introLines.join(" "), items: items.filter(item => item.trim().length > 0) };
}

function parseItem(raw: string) {
  const parts = raw.split(/\s*\|\s*/);

  const firstPart = parts[0] || "";
  let appId = "";
  let name = "";

  const newFormat = firstPart.match(/^App_ID:\s*(.+)$/i);
  if (newFormat) {
    appId = newFormat[1].trim();
    const namaPart = parts[1] || "";
    const namaMatch = namaPart.match(/^Nama Aplikasi:\s*(.+)$/i);
    if (namaMatch) {
      name = namaMatch[1].trim();
    }
  } else {
    const [idPart, ...nameParts] = firstPart.split(/\s*—\s*/);
    appId = idPart.trim();
    name = nameParts.join(" — ").trim();
  }

  let status = "";
  const extras: { key: string; value: string }[] = [];

  const startIdx = (newFormat && parts[1]?.match(/^Nama Aplikasi:/i)) ? 2 : 1;

  for (let i = startIdx; i < parts.length; i++) {
    const kv = parts[i].match(/^([^:]+):\s*(.+)$/);
    if (kv) {
      const key = kv[1].trim();
      const value = kv[2].trim();
      if (key.toLowerCase() === "status") status = value;
      else extras.push({ key, value });
    }
  }

  return { appId, name, status, extras };
}

const SECTION_MAP: Record<string, string[]> = {
  "Infrastruktur": [
    "Host name", "Hostname", "hostname", "host name",
    "Lokasi Data Center", "Lokasi disaster recovery center",
    "Power State", "Tahun Implementasi", "Importance Rank",
    "OS EOL", "DB EOL",
  ],
  "Software & Hardware": [
    "Spesifikasi software DC", "Spesifikasi hardware DC",
    "Spesifikasi Software DRC", "Spesifikasi hardware DRC",
    "Model & Merk", "Spesifikasi Hardware", "Versi Software",
    "Alamat IP", "MAC Address", "Kapasitas/Limit",
  ],
  "Aplikasi": [
    "capability layer", "capability", "subcapability", "Desc",
    "Application TYpe", "Application Type", "Unit",
    "App Owner", "Unit Of App Owner", "App Manager", "Unit Of App Manager",
    "LOB", "RTo", "RPO", "Catagory OJK",
    "Date_LIve", "Date_Decom", "Lokasi Data center", "Notes",
    "Importance rank risk", "TimeQH", "Deployment_type", "Development_type",
    "Cost Driver", "IT Architect", "Perizinan cloud",
  ],
  "Aset": [
    "asset name", "asset code", "invoice number", "Serial Number",
    "Tipe/Kategori Aset", "Tipe Aset",
    "Lokasi Fisik", "Pengguna", "Pemilik Aset (Custodian)",
    "Status Aset", "Tanggal Pembelian", "Harga Perolehan",
    "Masa Garansi", "Nilai Depresiasi", "Nomor Kontrak",
    "Tipe Lisensi", "Tanggal Kedaluwarsa",
    "vendor", "Vendor",
  ],
  "Biaya (OPEX)": [
    "Januari", "Febuari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ],
};

function groupExtras(extras: { key: string; value: string }[]) {
  const sections: Record<string, { key: string; value: string }[]> = {};
  const ungrouped: { key: string; value: string }[] = [];

  for (const e of extras) {
    let placed = false;
    for (const [section, keys] of Object.entries(SECTION_MAP)) {
      if (keys.some(k => k.toLowerCase() === e.key.toLowerCase())) {
        if (!sections[section]) sections[section] = [];
        sections[section].push(e);
        placed = true;
        break;
      }
    }
    if (!placed) ungrouped.push(e);
  }

  if (ungrouped.length > 0) sections["Lainnya"] = ungrouped;
  return sections;
}

const PREVIEW_PRIORITY = [
  "Host name", "hostname", "Hostname", "host name",
  "Status Aset", "Lokasi Data Center", "vendor", "Vendor",
  "App Owner", "Deployment_type", "Importance Rank",
  "Harga Perolehan", "Power State", "Application TYpe",
];

function getPreviewChips(extras: { key: string; value: string }[], max = 4) {
  const prioritized = extras.filter(e =>
    PREVIEW_PRIORITY.some(p => p.toLowerCase() === e.key.toLowerCase())
  ).slice(0, max);

  if (prioritized.length < max) {
    const rest = extras
      .filter(e => !PREVIEW_PRIORITY.some(p => p.toLowerCase() === e.key.toLowerCase()))
      .slice(0, max - prioritized.length);
    return [...prioritized, ...rest];
  }
  return prioritized;
}

function truncateValue(val: string, max = 40) {
  if (val.length <= max) return val;
  const parts = val.split(",").map(s => s.trim());
  if (parts.length > 2) {
    return `${parts[0]}, ${parts[1]}... +${parts.length - 2}`;
  }
  return val.slice(0, max) + "…";
}

// ============================================================
// parseBiayaAnswer — updated dengan rankingItems
// ============================================================
function parseBiayaAnswer(answer: string): {
  isBiaya: boolean;
  total: string;
  entity: string;
  itemCount: string;
  source: string;
  months: { label: string; value: string }[];
  rankingItems: { appId: string; name: string; total: string; months: { label: string; value: string }[] }[];
} {
  const totalMatch = answer.match(/Total biaya[^:]*:\s*(Rp[\s\d.,]+)/i);
  if (!totalMatch) return { isBiaya: false, total: "", entity: "", itemCount: "", source: "", months: [], rankingItems: [] };

  const entityMatch = answer.match(/untuk "([^"]+)"/i);
  const itemMatch = answer.match(/dari (\d+) item/i);
  const sourceMatch = answer.match(/Sumber:\s*(\S+)/i);

  const MONTHS = ["Januari","Febuari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const months: { label: string; value: string }[] = [];

  for (const m of MONTHS) {
    const re = new RegExp(`^- ${m}:\\s*(Rp[\\s\\d.,]+)`, "im");
    const match = answer.match(re);
    if (match) months.push({ label: m, value: match[1].trim() });
  }

  // Parse ranking items dari preformattedList
  // Format: "1. App_ID: X | Nama Aplikasi: Y | Total: Rp Z | Januari: Rp A | ..."
  const rankingItems: { appId: string; name: string; total: string; months: { label: string; value: string }[] }[] = [];
  const lines = answer.split("\n");
  for (const line of lines) {
    const rankMatch = line.match(/^\d+\.\s+App_ID:\s*([^|]+)\|/);
    if (!rankMatch) continue;
    const parts = line.split("|").map(p => p.trim());
    const appId = (parts.find(p => /^App_ID:/i.test(p))?.replace(/^App_ID:\s*/i, "") || "").trim();
    const name = (parts.find(p => /^Nama Aplikasi:/i.test(p))?.replace(/^Nama Aplikasi:\s*/i, "") || "").trim();
    const totalStr = (parts.find(p => /^Total:/i.test(p))?.replace(/^Total:\s*/i, "") || "").trim();
    const itemMonths: { label: string; value: string }[] = [];
    for (const m of MONTHS) {
      const mPart = parts.find(p => new RegExp(`^${m}:`, "i").test(p));
      if (mPart) {
        const val = mPart.replace(new RegExp(`^${m}:\\s*`, "i"), "").trim();
        itemMonths.push({ label: m, value: val });
      }
    }
    if (appId || name || totalStr) rankingItems.push({ appId, name, total: totalStr, months: itemMonths });
  }

  return {
    isBiaya: true,
    total: totalMatch[1].trim(),
    entity: entityMatch?.[1] || "",
    itemCount: itemMatch?.[1] || "",
    source: sourceMatch?.[1] || "",
    months,
    rankingItems,
  };
}

// ============================================================
// BiayaDisplay — updated dengan ranking cards collapsible
// ============================================================
function BiayaDisplay({ answer }: { answer: string }) {
  const [visible, setVisible] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
  const { total, entity, itemCount, source, months, rankingItems } = parseBiayaAnswer(answer);

  const isRanking = rankingItems.length > 0;

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "none" : "translateY(8px)",
      transition: "opacity 0.4s ease, transform 0.4s ease",
    }}>
      {/* Total card */}
      <div style={{
        background: "#1A4731", borderRadius: 12,
        padding: "16px 20px", marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Total biaya OPEX{entity ? ` · ${entity}` : ""}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: "#ffffff", marginTop: 4 }}>
          {total}
        </div>
        {(itemCount || source) && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            {itemCount ? `${itemCount} item` : ""}
            {itemCount && source ? " · " : ""}
            {source}
          </div>
        )}
      </div>

      {/* Ranking cards — untuk top N > 1 */}
      {isRanking && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rankingItems.map((item, i) => (
            <div key={i} style={{
              background: "#F7F8F5", border: "1px solid #D4E8C2",
              borderRadius: 12, overflow: "hidden",
            }}>
              <div
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 14px", cursor: "pointer",
                  background: expandedIdx === i ? "#EEF7DC" : "#F7F8F5",
                  transition: "background 0.2s",
                  borderBottom: expandedIdx === i ? "1px solid #D4E8C2" : "none",
                }}
              >
                <div style={{
                  minWidth: 26, height: 26, borderRadius: 7,
                  background: "#EEF7DC", border: "1px solid #D4E8C2",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: "#1A4731", flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <span style={{
                  fontFamily: "monospace", fontSize: 10, color: "#1A4731",
                  background: "#EEF7DC", border: "1px solid #D4E8C2",
                  borderRadius: 4, padding: "1px 6px", flexShrink: 0,
                }}>
                  {item.appId}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: "#1A4731",
                  flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {item.name || item.appId}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: "#1A4731",
                  background: "#EEF7DC", border: "1px solid #8DC63F",
                  borderRadius: 8, padding: "3px 10px", flexShrink: 0,
                }}>
                  {item.total}
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  stroke="#4A6A56" strokeWidth="1.5"
                  style={{ transition: "transform 0.25s", transform: expandedIdx === i ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
                >
                  <polyline points="4,6 8,10 12,6" />
                </svg>
              </div>

              {expandedIdx === i && item.months.length > 0 && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: 8, padding: 12,
                }}>
                  {item.months.map((m, j) => (
                    <div key={j} style={{
                      background: "#ffffff", border: "1px solid #D4E8C2",
                      borderRadius: 8, padding: "8px 10px",
                    }}>
                      <div style={{ fontSize: 11, color: "#4A6A56", fontWeight: 600 }}>{m.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4731", marginTop: 2 }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grid bulan — untuk single item */}
      {!isRanking && months.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 8,
        }}>
          {months.map((m, i) => (
            <div key={i} style={{
              background: "#F7F8F5", border: "1px solid #D4E8C2",
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ fontSize: 11, color: "#4A6A56", fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A4731", marginTop: 3 }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "active")
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "#EEF7DC", border: "1px solid #8DC63F",
        borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 600,
        color: "#1A4731", letterSpacing: "0.02em", flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8DC63F" }} />
        Active
      </span>
    );
  if (s.includes("decommission"))
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "#FEE2E2", border: "1px solid #FCA5A5",
        borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 600,
        color: "#991B1B", letterSpacing: "0.02em", flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#DC2626" }} />
        Decommissioned
      </span>
    );
  if (status)
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "#F7F8F5", border: "1px solid #D4E8C2",
        borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 600,
        color: "#4A6A56", flexShrink: 0,
      }}>
        {status}
      </span>
    );
  return null;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="#4A6A56" strokeWidth="1.5"
      style={{ transition: "transform 0.25s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
    >
      <polyline points="4,6 8,10 12,6" />
    </svg>
  );
}

function AppCard({ item, index, visible, isUniqueList }: {
  item: string; index: number; visible: boolean; isUniqueList?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { appId, name, status, extras } = parseItem(item);

  const uniqueValue = isUniqueList ? (extras[0]?.value || name) : null;
  const previewChips = getPreviewChips(extras);
  const groupedSections = groupExtras(extras);
  const hasDetails = extras.length > 0;

  if (isUniqueList) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        background: "#F7F8F5", border: "1px solid #D4E8C2",
        borderRadius: 12, padding: "12px 16px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: `opacity 0.35s ease ${index * 0.07}s, transform 0.35s ease ${index * 0.07}s`,
      }}>
        <div style={{
          minWidth: 28, height: 28, borderRadius: 8,
          background: "#EEF7DC", border: "1px solid #D4E8C2",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#1A4731", flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1A4731" }}>{uniqueValue}</span>
      </div>
    );
  }

  return (
    <div style={{
      background: "#F7F8F5", border: "1px solid #D4E8C2",
      borderRadius: 12, overflow: "hidden",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: `opacity 0.35s ease ${index * 0.07}s, transform 0.35s ease ${index * 0.07}s`,
    }}>
      <div
        onClick={() => hasDetails && setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          cursor: hasDetails ? "pointer" : "default",
          background: expanded ? "#EEF7DC" : "#F7F8F5",
          transition: "background 0.2s",
          borderBottom: expanded ? "1px solid #D4E8C2" : "none",
        }}
      >
        <div style={{
          minWidth: 26, height: 26, borderRadius: 7,
          background: "#EEF7DC", border: "1px solid #D4E8C2",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "#1A4731", flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <span style={{
          fontFamily: "monospace", fontSize: 10, color: "#1A4731",
          background: "#EEF7DC", border: "1px solid #D4E8C2",
          borderRadius: 4, padding: "1px 6px", flexShrink: 0,
        }}>
          {appId}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 600, color: "#1A4731",
          flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name || item}
        </span>
        {status && <StatusBadge status={status} />}
        {hasDetails && <ChevronIcon open={expanded} />}
      </div>

      {!expanded && previewChips.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "4px 8px",
          padding: "8px 14px 10px",
        }}>
          {previewChips.map((chip, j) => (
            <span key={j} style={{
              fontSize: 11, color: "#4A6A56",
              background: "#ffffff", border: "1px solid #D4E8C2",
              borderRadius: 6, padding: "2px 8px",
            }}>
              <span style={{ color: "#1A4731", fontWeight: 600, fontSize: 10 }}>{chip.key}:</span>{" "}
              <span style={{ color: "#1A4731" }}>{truncateValue(chip.value)}</span>
            </span>
          ))}
          {extras.length > previewChips.length && (
            <span
              onClick={() => setExpanded(true)}
              style={{
                fontSize: 11, color: "#4A6A56",
                background: "#EEF7DC", border: "1px solid #D4E8C2",
                borderRadius: 6, padding: "2px 8px", cursor: "pointer",
              }}
            >
              +{extras.length - previewChips.length} more
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div style={{
          maxHeight: 480,
          overflowY: "auto",
          scrollbarWidth: "thin" as const,
          scrollbarColor: "#D4E8C2 transparent",
        }}>
          {Object.entries(groupedSections).map(([sectionName, fields]) => (
            <div key={sectionName} style={{
              borderBottom: "1px solid #D4E8C2",
              padding: "10px 14px",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "#4A6A56",
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: 8,
              }}>
                {sectionName}
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "6px 16px",
              }}>
                {fields.map((f, j) => (
                  <div key={j} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 11, color: "#1A4731", fontWeight: 700, letterSpacing: "0.01em" }}>{f.key}</span>
                    <span style={{
                      fontSize: 12, color: "#4A6A56", lineHeight: 1.4,
                      wordBreak: "break-word", fontWeight: 400,
                    }}>
                    {(SECTION_MAP["Biaya (OPEX)"].some(k => k.toLowerCase() === f.key.toLowerCase()) ||
                      ["harga perolehan", "nilai depresiasi"].includes(f.key.toLowerCase()))
                      ? `Rp ${Number(String(f.value).replace(/\D/g, "")).toLocaleString("id-ID")}`
                      : f.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div
            onClick={() => setExpanded(false)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "9px 14px", cursor: "pointer",
              fontSize: 11, color: "#4A6A56",
              background: "#F7F8F5",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#EEF7DC")}
            onMouseLeave={e => (e.currentTarget.style.background = "#F7F8F5")}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#4A6A56" strokeWidth="1.5">
              <polyline points="4,10 8,6 12,10" />
            </svg>
            Close
          </div>
        </div>
      )}
    </div>
  );
}

function AnswerDisplay({ answer, isUniqueList, filterContext }: { answer: string; isUniqueList: boolean; filterContext?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);


const isAverage = answer.startsWith("Rata-rata ");
if (isAverage) {
  return (
    <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <p style={{ fontSize: 13, color: "#4A6A56", marginBottom: 12, lineHeight: 1.7 }}>
        {answer.split("\n\n")[0]}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {answer.split("\n").filter(l => /^\d+\./.test(l)).map((line, i) => {
          const content = line.replace(/^\d+\.\s+/, "");
          const [group, ...rest] = content.split(":");
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#F7F8F5", border: "1px solid #D4E8C2",
              borderRadius: 10, padding: "10px 14px",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1A4731" }}>{group.trim()}</span>
              <span style={{ fontSize: 13, color: "#4A6A56" }}>{rest.join(":").trim()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const biaya = parseBiayaAnswer(answer);
if (biaya.isBiaya) {
  const infoIdx = answer.indexOf("\n\nInfo aplikasi");
  const infoText = infoIdx > 0 ? answer.slice(infoIdx).trim() : "";
  const infoLines = infoText
    .split("\n")
    .filter(l => l.includes(":") && !l.startsWith("Info aplikasi"))
    .map(l => l.trim());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <BiayaDisplay answer={answer} />
      {infoLines.length > 0 && (
        <div style={{
          background: "#F7F8F5", border: "1px solid #D4E8C2",
          borderRadius: 12, padding: "12px 16px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {infoLines.map((line, i) => {
            const [key, ...rest] = line.split(":");
            return (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <span style={{ color: "#4A6A56", fontWeight: 600, minWidth: 140 }}>{key.trim()}</span>
                <span style={{ color: "#1A4731" }}>{rest.join(":").trim()}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

  const { intro, items } = parseAnswer(answer);

  if (items.length === 0) {
    return (
      <p style={{
        color: "#1A4731", lineHeight: 1.75, fontSize: 14,
        opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(8px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}>
        {answer}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {intro && (
        <p style={{
          color: "#4A6A56", lineHeight: 1.7, fontSize: 13,
          opacity: visible ? 1 : 0, transition: "opacity 0.3s ease",
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          {intro}
          {filterContext && (
            <span style={{
              fontSize: 11,
              background: "#EEF7DC", border: "1px solid #8DC63F",
              borderRadius: 6, padding: "2px 8px",
              color: "#1A4731", fontWeight: 600, flexShrink: 0,
            }}>
              filter: {filterContext}
            </span>
          )}
        </p>
      )}
      <div style={{
        display: "flex", flexDirection: "column", gap: 8,
        paddingRight: 4,
      }}>
        {items.map((item, i) => (
          <AppCard key={i} item={item} index={i} visible={visible} isUniqueList={isUniqueList} />
        ))}
      </div>
      <p style={{
        fontSize: 11, color: "#4A6A56", textAlign: "right", marginTop: 4,
        opacity: visible ? 1 : 0, transition: "opacity 0.5s ease 0.3s",
      }}>
        {items.length} data results found
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[90, 75, 85].map((w, i) => (
        <div key={i} style={{
          height: 14, borderRadius: 6,
          background: "linear-gradient(90deg, #EEF7DC 25%, #D4E8C2 50%, #EEF7DC 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
          width: `${w}%`,
          animationDelay: `${i * 0.15}s`,
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

export default function AskAIPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasAsked, setHasAsked] = useState(false);
  const [dataIssues, setDataIssues] = useState<any[]>([]);
  const [filterContext, setFilterContext] = useState("");
  const [issuesOpen, setIssuesOpen] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  async function handleAsk() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setIntent("");
    setHasAsked(true);
    try {
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      setAnswer(json.success ? json.answer || "" : json.error || "An error occurred.");
      setIntent(json.intent || "");
      setDataIssues(json.dataIssues || []);
      setFilterContext(json.filterContext || "");
      setIssuesOpen(false);
    } catch {
      setAnswer("Failed to connect to server.");
    } finally {
      setLoading(false);
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAsk();
  }

function handleDownloadTxt() {
  const content = `Pertanyaan: ${question}\n\nJawaban:\n${answer}`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `VAA_Answer_${new Date().toLocaleDateString("id-ID").replace(/\//g, "-")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}


  return (
    <div style={{ maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: "#1A4731",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 24px rgba(26,71,49,0.2)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A4731", margin: 0, letterSpacing: "-0.02em" }}>
            Ask AI
          </h1>
          <p style={{ fontSize: 12, color: "#4A6A56", margin: 0 }}>
            AI only answers from uploaded Excel files
          </p>
        </div>
      </div>

      {/* Input Card */}
      <div style={{
        background: "#ffffff", border: "1px solid #D4E8C2",
        borderRadius: 16, padding: 20,
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Contoh: Ada berapa aplikasi Finance yang aktif dan apa saja?"
          style={{
            width: "100%", minHeight: 100, resize: "none",
            background: "#F7F8F5", border: "1px solid #D4E8C2",
            borderRadius: 10, padding: "12px 14px",
            color: "#1A4731", fontSize: 14, lineHeight: 1.6,
            outline: "none", boxSizing: "border-box", fontFamily: "inherit",
          }}
          onFocus={(e) => e.target.style.borderColor = "#8DC63F"}
          onBlur={(e) => e.target.style.borderColor = "#D4E8C2"}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 11, color: "#4A6A56" }}>Ctrl+Enter to send</span>
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: loading || !question.trim() ? "#EEF7DC" : "#8DC63F",
              border: "none", borderRadius: 10, padding: "9px 20px",
              color: "#1A4731", fontSize: 13, fontWeight: 600,
              cursor: loading || !question.trim() ? "not-allowed" : "pointer",
              boxShadow: loading || !question.trim() ? "none" : "0 4px 12px rgba(141,198,63,0.3)",
              transition: "all 0.2s", letterSpacing: "0.01em",
              opacity: loading || !question.trim() ? 0.6 : 1,
            }}
          >
            {loading ? (
              <>
                <svg style={{ animation: "spin 1s linear infinite" }} width="14" height="14" viewBox=
                "0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                Ask AI
              </>
            )}
          </button>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* Answer Card */}
      {hasAsked && (
        <div ref={answerRef} style={{
          background: "#ffffff", border: "1px solid #D4E8C2",
          borderRadius: 16, padding: 20,
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 16, paddingBottom: 14,
            borderBottom: "1px solid #D4E8C2",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, background: "#1A4731",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M9.5 3A6.5 6.5 0 0116 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.516 6.516 0 019.5 16 6.5 6.5 0 013 9.5 6.5 6.5 0 019.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5z" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1A4731" }}>AI Answers</span>
            {!loading && answer && (
              <span style={{ fontSize: 11, color: "#4A6A56", marginLeft: 4 }}>· VAA SMBC Indonesia</span>
            )}
            {!loading && answer && (
            <button
              onClick={handleDownloadTxt}
              style={{
                marginLeft: "auto",
                display: "flex", alignItems: "center", gap: 6,
                background: "#F7F8F5", border: "1px solid #D4E8C2",
                borderRadius: 8, padding: "5px 12px",
                fontSize: 11, fontWeight: 600, color: "#1A4731",
                cursor: "pointer",
              }}
            >
            <Download size={12} /> Export TXT
            </button>
)}
            {loading && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#8DC63F",
                    animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s`,
                  }} />
                ))}
              </div>
            )}
          </div>
          <style>{`@keyframes bounce{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}`}</style>
          <div style={{
            maxHeight: "60vh",
            overflowY: "auto",
            paddingRight: 4,
            scrollbarWidth: "thin" as const,
            scrollbarColor: "#D4E8C2 transparent",
          }}>
            {loading ? <LoadingSkeleton /> : answer ? (
              <AnswerDisplay answer={answer} isUniqueList={intent === "list"} filterContext={filterContext} />
            ) : null}
          </div>
        </div>
      )}

      {/* Data Issues */}
      {hasAsked && !loading && dataIssues.length > 0 && (
        <div style={{
          background: "#FFFBEB", border: "1px solid #FCD34D",
          borderRadius: 16, padding: 16,
        }}>
          <button
            onClick={() => setIssuesOpen(!issuesOpen)}
            style={{
              width: "100%", background: "none", border: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", padding: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color="#92400E" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>
                Potential Data Issues ({dataIssues.length})
              </span>
            </div>
            <span style={{ color: "#92400E", fontSize: 12 }}>
              {issuesOpen ? "▲ Close" : "▼ View Details"}
            </span>
          </button>
          {issuesOpen && (
            <div style={{
              marginTop: 12, display: "flex", flexDirection: "column", gap: 6,
              maxHeight: 300, overflowY: "auto",
              paddingTop: 12, borderTop: "1px solid #FCD34D",
            }}>
              {dataIssues.map((issue, i) => (
                <div key={i} style={{
                  background: "#FEF3C7", border: "1px solid #FCD34D",
                  borderRadius: 8, padding: "8px 12px",
                  fontSize: 12, color: "#92400E",
                }}>
                  <span style={{ color: "#B45309", fontWeight: 600 }}>[{issue.type}]</span>{" "}
                  <span style={{ color: "#78350F", fontSize: 11 }}>{issue.file.split("/").pop()}</span>{" "}
                  — {issue.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}