"use client";

import { useEffect, useState } from "react";

type FileItem = {
  id: number;
  file_name: string;
  object_key: string;
  bucket: string;
  uploaded_at: string;
};

type ChatHistoryItem = {
  id: number;
  question: string;
  answer: string;
  intent: string | null;
  created_at: string;
};

const COLLAPSE_LIMIT = 3;

// ini buat yang ganti berapa lama dia ilang 
const EXPIRY_MINUTES = 20 / 60;

// ===== DETEKSI FORMAT =====
function isListAnswer(answer: string): boolean {
  return /\d+\.\s+\S+.*—/.test(answer);
}

function isBiayaAnswer(answer: string): boolean {
  return /\d+\.\s+App_ID:/.test(answer);
}

function isSimpleBulletAnswer(answer: string): boolean {
  return /^\d+\.\s+\S+/m.test(answer) && !isListAnswer(answer) && !isBiayaAnswer(answer);
}

function parseAnswerItems(answer: string): { title: string; fields: { key: string; val: string }[] }[] {
  const rawItems = answer.split(/(?=\d+\.\s)/).filter((s) => s.trim());
  const result: { title: string; fields: { key: string; val: string }[] }[] = [];
  for (const raw of rawItems) {
    const content = raw.replace(/^\d+\.\s*/, "").trim();
    if (!content.includes("—")) continue;
    const parts = content.split("|").map((p) => p.trim()).filter(Boolean);
    const title = parts[0] || "";
    const fields = parts.slice(1).map((part) => {
      const colonIdx = part.indexOf(":");
      if (colonIdx === -1) return { key: "", val: part };
      return { key: part.slice(0, colonIdx).trim(), val: part.slice(colonIdx + 1).trim() };
    }).filter((f) => f.val);
    result.push({ title, fields });
  }
  return result;
}

function StatusBadge({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const style =
    lower === "active" ? { bg: "#EEF7DC", color: "#1A4731", border: "#8DC63F" } :
    lower === "inactive" ? { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" } :
    lower === "retire" || lower === "retired" ? { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" } :
    { bg: "#F7F8F5", color: "#4A6A56", border: "#D4E8C2" };
  return (
    <span style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>
      {value}
    </span>
  );
}

function AppCard({ item, index }: { item: { title: string; fields: { key: string; val: string }[] }; index: number }) {
  const [open, setOpen] = useState(false);
  const PRIORITY = ["Status", "Host name", "Hostname", "Lokasi Data Center", "vendor", "Vendor"];
  const priorityFields = item.fields.filter((f) => PRIORITY.some((p) => p.toLowerCase() === f.key.toLowerCase()));
  const otherFields = item.fields.filter((f) => !PRIORITY.some((p) => p.toLowerCase() === f.key.toLowerCase()));
  const statusField = priorityFields.find((f) => f.key.toLowerCase() === "status");
  return (
    <div style={{ border: "1px solid #D4E8C2", borderRadius: 12, overflow: "hidden", background: "#F7F8F5" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ color: "#4A6A56", fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>{index + 1}</span>
          <span style={{ color: "#1A4731", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
          {statusField && <StatusBadge value={statusField.val} />}
        </div>
        <span style={{ color: "#4A6A56", fontSize: 10, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #D4E8C2" }}>
          {priorityFields.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 12 }}>
              {priorityFields.map((f, i) => (
                <div key={i}>
                  <p style={{ color: "#4A6A56", fontSize: 11, margin: "0 0 2px" }}>{f.key}</p>
                  <p style={{ color: "#1A4731", fontSize: 12, fontWeight: 500, margin: 0 }}>{f.val}</p>
                </div>
              ))}
            </div>
          )}
          {otherFields.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 10 }}>
              {otherFields.map((f, i) => (
                <div key={i}>
                  <p style={{ color: "#4A6A56", fontSize: 11, margin: "0 0 2px" }}>{f.key}</p>
                  <p style={{ color: "#1A4731", fontSize: 12, margin: 0 }}>{f.val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== PARSER BIAYA =====
function parseBiayaItems(answer: string): { appId: string; nama: string; total: string; months: { key: string; val: string }[] }[] {
  const lines = answer.split(/\n/).filter(s => /^\d+\.\s+App_ID:/.test(s.trim()));
  return lines.map(line => {
    const parts = line.replace(/^\d+\.\s*/, "").split("|").map(p => p.trim());
    const fields: Record<string, string> = {};
    for (const part of parts) {
      const colonIdx = part.indexOf(":");
      if (colonIdx === -1) continue;
      fields[part.slice(0, colonIdx).trim()] = part.slice(colonIdx + 1).trim();
    }
    const monthKeys = ["Januari","Febuari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const months = monthKeys.filter(m => fields[m]).map(m => ({ key: m, val: fields[m] }));
    return {
      appId: fields["App_ID"] || "-",
      nama: fields["Nama Aplikasi"] || "-",
      total: fields["Total"] || "-",
      months,
    };
  });
}

function BiayaCard({ item, index }: { item: { appId: string; nama: string; total: string; months: { key: string; val: string }[] }; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid #D4E8C2", borderRadius: 12, overflow: "hidden", background: "#F7F8F5" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ color: "#4A6A56", fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>{index + 1}</span>
          <span style={{ color: "#1A4731", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nama}</span>
          <span style={{ background: "#EEF7DC", border: "1px solid #8DC63F", color: "#1A4731", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{item.total}</span>
        </div>
        <span style={{ color: "#4A6A56", fontSize: 10, marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && item.months.length > 0 && (
        <div style={{ padding: "10px 14px 14px", borderTop: "1px solid #D4E8C2" }}>
          <p style={{ fontSize: 11, color: "#4A6A56", margin: "0 0 8px", fontWeight: 600 }}>Rincian per bulan</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
            {item.months.map((m, i) => (
              <div key={i}>
                <p style={{ color: "#4A6A56", fontSize: 11, margin: "0 0 2px" }}>{m.key}</p>
                <p style={{ color: "#1A4731", fontSize: 12, fontWeight: 500, margin: 0 }}>{m.val}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== FORMATTED ANSWER =====
function FormattedAnswer({ answer }: { answer: string }) {
  const [expanded, setExpanded] = useState(false);

  // Format biaya (App_ID | Nama Aplikasi | Total | bulan-bulan)
  if (isBiayaAnswer(answer)) {
    const items = parseBiayaItems(answer);
    const introMatch = answer.match(/^([\s\S]*?)(?=\d+\.\s+App_ID:)/);
    const intro = introMatch?.[1]?.trim();
    const visibleItems = expanded ? items : items.slice(0, COLLAPSE_LIMIT);
    const hasMore = items.length > COLLAPSE_LIMIT;
    return (
      <div style={{ flex: 1 }}>
        {intro && <p style={{ color: "#4A6A56", fontSize: 13, marginBottom: 8, whiteSpace: "pre-wrap" }}>{intro}</p>}
        {items.length > 0 && <p style={{ color: "#8DC63F", fontSize: 11, marginBottom: 8 }}>{items.length} aplikasi</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visibleItems.map((item, i) => <BiayaCard key={i} item={item} index={i} />)}
        </div>
        {hasMore && (
          <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 8, fontSize: 12, color: "#1A4731", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
            {expanded ? "▲ Hide" : `▼ See More (${items.length - COLLAPSE_LIMIT} more)`}
          </button>
        )}
      </div>
    );
  }

  // Format list (AppID — NamaAplikasi | key: val)
  if (isListAnswer(answer)) {
    const items = parseAnswerItems(answer);
    const introMatch = answer.match(/^([\s\S]*?)(?=\d+\.\s+\S+.*—)/);
    const intro = introMatch?.[1]?.trim();
    const visibleItems = expanded ? items : items.slice(0, COLLAPSE_LIMIT);
    const hasMore = items.length > COLLAPSE_LIMIT;
    return (
      <div style={{ flex: 1 }}>
        {intro && <p style={{ color: "#4A6A56", fontSize: 13, marginBottom: 8 }}>{intro}</p>}
        <p style={{ color: "#8DC63F", fontSize: 11, marginBottom: 8 }}>Found {items.length} items</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visibleItems.map((item, i) => <AppCard key={i} item={item} index={i} />)}
        </div>
        {hasMore && (
          <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 8, fontSize: 12, color: "#1A4731", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
            {expanded ? "▲ Hide" : `▼ See More (${items.length - COLLAPSE_LIMIT} more items)`}
          </button>
        )}
      </div>
    );
  }

  // Format plain text (default)
  return <p style={{ color: "#1A4731", whiteSpace: "pre-wrap", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{answer}</p>;
}
function timeUntilExpiry(createdAt: string): string {
  const created = new Date(createdAt).getTime(); // langsung parse, sudah ISO valid
  const expiry = created + EXPIRY_MINUTES * 60 * 1000;
  const now = Date.now();
  const remaining = expiry - now;
  if (remaining <= 0) return "immediately deleted";
  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return `${seconds}s left`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s left`;
}

function ChatCard({ item }: { item: ChatHistoryItem }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const remaining = timeUntilExpiry(item.created_at);

  return (
    <div style={{ background: "#ffffff", border: "1px solid #D4E8C2", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EEF7DC", border: "1px solid #D4E8C2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>👤</div>
        <p style={{ color: "#1A4731", fontWeight: 600, fontSize: 13, margin: 0, lineHeight: 1.5, paddingTop: 4 }}>{item.question}</p>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EEF7DC", border: "1px solid #8DC63F", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🤖</div>
        <FormattedAnswer answer={item.answer} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid #D4E8C2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {item.intent && (
            <span style={{ background: "#EEF7DC", border: "1px solid #8DC63F", color: "#1A4731", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>{item.intent}</span>
          )}
          <span style={{ fontSize: 11, color: "#4A6A56" }}>{formatDate(item.created_at)}</span>
        </div>
        <span style={{ fontSize: 10, color: "#92400E", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, padding: "2px 8px" }}>
          ⏱ {remaining}
        </span>
      </div>
    </div>
  );
}

export default function ChatHistoryPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await fetch("/api/files");
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          setFiles(data.items);
          if (data.items.length > 0) setSelectedFile(data.items[0].object_key);
        }
      } catch (error) {
        console.error("Failed to fetch files:", error);
      }
    };

    const fetchChatHistory = async () => {
      try {
        const res = await fetch("/api/chat-history");
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) setChatHistory(data.items);
      } catch (error) {
        console.error("Failed to fetch chat history:", error);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchFiles();
    fetchChatHistory();

    // Auto-refresh setiap 30 detik untuk hapus yang sudah expired
    const interval = setInterval(fetchChatHistory, 30000);
    return () => clearInterval(interval);
  }, []);

    const handleDownload = () => {
      if (!selectedFile) return;
      window.open(`/api/files/download?key=${encodeURIComponent(selectedFile)}`, "_blank");
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1A4731", margin: 0, letterSpacing: "-0.02em" }}>
          Chat History & Download 
        </h1>
        <p style={{ fontSize: 13, color: "#4A6A56", marginTop: 6, marginBottom: 0 }}>
          Download Excel results and review AI conversation history.
        </p>
      </div>

      {/* Download Card */}
      <div style={{ background: "#ffffff", border: "1px solid #D4E8C2", borderRadius: 20, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EEF7DC", border: "1px solid #D4E8C2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⬇️</div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#1A4731", margin: 0 }}>Download Result File</p>
            <p style={{ fontSize: 12, color: "#4A6A56", margin: 0 }}>Export processed Excel data</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            style={{ flex: 1, minWidth: 200, background: "#F7F8F5", border: "1px solid #D4E8C2", borderRadius: 12, padding: "10px 16px", color: "#1A4731", fontSize: 13, outline: "none" }}
          >
            <option value="" style={{ background: "#ffffff" }}>Pilih file</option>
            {files.map((file) => (
              <option key={file.id} value={file.object_key} style={{ background: "#ffffff" }}>{file.file_name}</option>
            ))}
          </select>
          <button
            onClick={handleDownload}
            disabled={!selectedFile}
            style={{ background: selectedFile ? "#8DC63F" : "#EEF7DC", color: selectedFile ? "#1A4731" : "#4A6A56", border: "none", borderRadius: 12, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: selectedFile ? "pointer" : "not-allowed", transition: "all 0.2s", whiteSpace: "nowrap", opacity: selectedFile ? 1 : 0.6 }}
          >
            Download Here
          </button>
          {/* Toast notification */}
          {downloadSuccess && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#EEF7DC", border: "1px solid #8DC63F", borderRadius: 10, padding: "8px 14px", marginTop: 12, width: "100%" }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <p style={{ fontSize: 12, color: "#1A4731", margin: 0, fontWeight: 600 }}>
                File berhasil diunduh!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Chat History Card */}
      <div style={{ background: "#ffffff", border: "1px solid #D4E8C2", borderRadius: 20, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EEF7DC", border: "1px solid #D4E8C2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💬</div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#1A4731", margin: 0 }}>Chat History</p>
            <p style={{ fontSize: 12, color: "#4A6A56", margin: 0 }}>
              {chatHistory.length > 0 ? `${chatHistory.length} saved conversation` : "No conversations yet"}
            </p>
          </div>
        </div>

        {/* Expiry note */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "8px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: 14 }}>⏱️</span>
          <p style={{ fontSize: 12, color: "#92400E", margin: 0 }}>
            Chat history is automatically deleted after <strong>20 - 55 seconds</strong> Conversation history is temporary.
          </p>
        </div>

        {loadingHistory ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#4A6A56", fontSize: 13 }}>Memuat history...</div>
        ) : chatHistory.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#4A6A56", fontSize: 13, border: "1px dashed #D4E8C2", borderRadius: 12 }}>Empty Chat</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 600, overflowY: "auto", paddingRight: 4 }}>
            {chatHistory.map((item) => (
              <ChatCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}