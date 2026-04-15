"use client";

import { useState } from "react";

type AppCard = {
  appId: string;
  appName: string;
  fields: { label: string; value: string }[];
};

function parseAppList(text: string): AppCard[] | null {
  const normalized = text.replace(/\n/g, " ");

  // Deteksi format 1: "1. APP_ID001 — Nama | field: value"  (aplikasi/server)
  // Deteksi format 2: "1. App_ID: App_ID021 | Nama Aplikasi: xxx | ..." (opex)
  const isFormat1 = /\d+\.\s+APP_ID\w+\s*[\u2014\u2013—]/i.test(normalized);
  const isFormat2 = /\d+\.\s+App_ID:\s*\w+/i.test(normalized);

  if (!isFormat1 && !isFormat2) return null;

  let appChunks: string[] = [];

  if (isFormat1) {
    const chunks = normalized.split(/(?=\d+\.\s+APP_ID\w)/i);
    appChunks = chunks.filter((c) => /^\d+\.\s+APP_ID\w/i.test(c.trim()));
  } else {
    const chunks = normalized.split(/(?=\d+\.\s+App_ID:)/i);
    appChunks = chunks.filter((c) => /^\d+\.\s+App_ID:/i.test(c.trim()));
  }

  if (appChunks.length < 1) return null;

  return appChunks.map((chunk) => {
    const withoutNum = chunk.replace(/^\d+\.\s+/, "").trim();

    if (isFormat1) {
      // Format: "APP_ID001 — Nama | field: value | ..."
      const dashIdx = withoutNum.search(/\s*[\u2014\u2013]|\s+—\s+/);
      let appId = withoutNum;
      let remainder = "";
      if (dashIdx !== -1) {
        appId = withoutNum.slice(0, dashIdx).trim();
        remainder = withoutNum.slice(dashIdx).replace(/^[\s\u2014\u2013—]+/, "").trim();
      }
      const parts = remainder.split(/\s*\|\s*/);
      const appName = parts[0]?.trim() || "";
      const fields: { label: string; value: string }[] = [];
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;
        const colonIdx = part.indexOf(":");
        if (colonIdx !== -1) {
          fields.push({ label: part.slice(0, colonIdx).trim(), value: part.slice(colonIdx + 1).trim() });
        } else {
          fields.push({ label: "", value: part });
        }
      }
      return { appId, appName, fields };

    } else {
      // Format: "App_ID: App_ID021 | Nama Aplikasi: xxx | Total: Rp ..."
      const parts = withoutNum.split(/\s*\|\s*/);
      let appId = "";
      let appName = "";
      const fields: { label: string; value: string }[] = [];

      for (const part of parts) {
        const colonIdx = part.indexOf(":");
        if (colonIdx === -1) continue;
        const label = part.slice(0, colonIdx).trim();
        const value = part.slice(colonIdx + 1).trim();

        if (label.toLowerCase() === "app_id") {
          appId = value;
        } else if (label.toLowerCase() === "nama aplikasi") {
          appName = value;
        } else {
          fields.push({ label, value });
        }
      }
      return { appId, appName, fields };
    }
  });
}

function extractSummaryLine(text: string): string | null {
  const match = text.match(/^([\s\S]*?)(?=\n?1\.\s+(?:APP_ID|App_ID))/i);
  if (match && match[1].trim().length > 5) return match[1].trim();
  const flatMatch = text.match(/^(.+?)(?=1\.\s+(?:APP_ID|App_ID))/i);
  if (flatMatch && flatMatch[1].trim().length > 5) return flatMatch[1].trim();
  return null;
}

const FIELD_COLORS: Record<string, string> = {
  status: "#EEF7DC",
  "lokasi data center": "#E0F0FF",
  vendor: "#F3F0FF",
  "asset name": "#FFF7E6",
  "asset code": "#F0FAF0",
  "importance rank risk": "#FEE2E2",
  "importance rank": "#FFEEDD",
  "host name": "#F0F4FF",
  "date live": "#E6F7F0",
  "date_live": "#E6F7F0",
  "date decom": "#FFF0F0",
  "date_decom": "#FFF0F0",
  total: "#E8F5E9",
  januari: "#F3F8FF",
  februari: "#F3F8FF",
  febuari: "#F3F8FF",
  maret: "#F3F8FF",
  april: "#F3F8FF",
  mei: "#F3F8FF",
  juni: "#F3F8FF",
  juli: "#F3F8FF",
  agustus: "#F3F8FF",
  september: "#F3F8FF",
  oktober: "#F3F8FF",
  november: "#F3F8FF",
  desember: "#F3F8FF",
};

function getBgColor(label: string): string {
  const key = label.toLowerCase();
  for (const k of Object.keys(FIELD_COLORS)) {
    if (key === k || key.startsWith(k)) return FIELD_COLORS[k];
  }
  return "#F7F8F5";
}

function FieldBadge({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: getBgColor(label), borderRadius: 8, padding: "5px 10px", fontSize: 11, lineHeight: 1.4, minWidth: 0 }}>
      {label && (
        <div style={{ color: "#4A6A56", fontWeight: 700, marginBottom: 1, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
          {label}
        </div>
      )}
      <div style={{ color: "#1A2E1A", fontWeight: 500, wordBreak: "break-word" as const }}>
        {value}
      </div>
    </div>
  );
}

function AppCardItem({ card, index, defaultOpen }: { card: AppCard; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid #D4E8C2", borderRadius: 12, overflow: "hidden", background: "#ffffff" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: open ? "#F0F8E8" : "#F7F8F5",
          border: "none", cursor: "pointer", textAlign: "left" as const,
          borderBottom: open ? "1px solid #D4E8C2" : "none", transition: "background 0.15s",
        }}
      >
        <span style={{ background: "#1A4731", color: "#ffffff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {index + 1}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1A4731", flexShrink: 0 }}>
          {card.appId}
        </span>
        {card.appName && (
          <span style={{ fontSize: 12, color: "#4A6A56", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            — {card.appName}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#4A6A56", flexShrink: 0 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && card.fields.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, padding: "12px 14px" }}>
          {card.fields.map((f, i) => (
            <FieldBadge key={i} label={f.label} value={f.value} />
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleAnswer({ text }: { text: string }) {
  const isShort = text.trim().length < 120 && !text.includes("\n");
  if (isShort) {
    return (
      <div style={{ marginTop: 10, background: "#F0F8E8", border: "1px solid #D4E8C2", borderRadius: 10, padding: "16px 18px", fontSize: 18, fontWeight: 700, color: "#1A4731", textAlign: "center" as const }}>
        {text}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10, background: "#F7F8F5", border: "1px solid #D4E8C2", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#1A4731", whiteSpace: "pre-wrap" as const, lineHeight: 1.7, maxHeight: 300, overflowY: "auto" as const }}>
      {text}
    </div>
  );
}

export function SmartAnswerDisplay({ answer }: { answer: string }) {
  const [showAll, setShowAll] = useState(false);
  const summaryLine = extractSummaryLine(answer);
  const cards = parseAppList(answer);

  if (cards && cards.length > 0) {
    const visible = showAll ? cards : cards.slice(0, 5);
    return (
      <div style={{ marginTop: 10 }}>
        {summaryLine && (
          <div style={{ background: "#EEF7DC", border: "1px solid #8DC63F", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#1A4731", marginBottom: 10 }}>
            {summaryLine}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((card, i) => (
            <AppCardItem key={i} card={card} index={i} defaultOpen={i < 3} />
          ))}
        </div>
        {cards.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            style={{ marginTop: 10, width: "100%", background: "none", border: "1px dashed #D4E8C2", borderRadius: 8, padding: "8px", fontSize: 12, color: "#4A6A56", cursor: "pointer", fontWeight: 600 }}
          >
            {showAll ? "▲ Hide" : `▼ Show all (${cards.length} application)`}
          </button>
        )}
      </div>
    );
  }

  return <SimpleAnswer text={answer} />;
}