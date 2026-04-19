"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SmartAnswerDisplay } from "./SmartAnswerDisplay";
import { Pencil, ClipboardList, CheckCircle, XCircle, Lock } from "lucide-react";

type TestResult = {
  id: number;
  question: string;
  answer: string;
  intent: string;
  engineSummary: string;
  reasoning: string;
  verdict: "pass" | "fail";
  note: string;
  timestamp: string;
};

type DebugInfo = {
  intent: string;
  engineSummary: string;
  reasoning: string;
  filterContext: string;
};

function AccessDenied() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

useEffect(() => {
  const interval = setInterval(() => {
    setCountdown((prev) => {
      if (prev <= 1) {
        clearInterval(interval);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => clearInterval(interval);
}, []);

useEffect(() => {
  if (countdown === 0) {
    router.push("/dashboard");
  }
}, [countdown, router]);

  return (
    <div style={{
      minHeight: "100vh", background: "#F7F8F5",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "#ffffff", border: "1px solid #FCA5A5",
        borderRadius: 20, padding: "40px 48px", maxWidth: 420,
        textAlign: "center",
      }}>
        <Lock size={24} color="#991B1B" />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#991B1B", margin: "0 0 8px" }}>
          Access denied
        </h2>
        <p style={{ fontSize: 13, color: "#4A6A56", margin: "0 0 20px", lineHeight: 1.6 }}>
          This page can only be accessed by <strong>Strategic Planning & Operations Control (SPOC)</strong>.
          You do not have permission to open this page.
        </p>
        <div style={{
          background: "#FEE2E2", border: "1px solid #FCA5A5",
          borderRadius: 10, padding: "10px 16px", fontSize: 12, color: "#991B1B",
          marginBottom: 20,
        }}>
          Redirected to Dashboard in <strong>{countdown} second</strong>...
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            background: "#1A4731", border: "none", borderRadius: 10,
            padding: "10px 24px", fontSize: 13, fontWeight: 600,
            color: "#ffffff", cursor: "pointer",
          }}
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}

function ExpandableAnswer({ answer }: { answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = answer.length > 200;
  return (
    <div>
      <p style={{ fontSize: 12, color: "#4A6A56", margin: "0 0 4px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        A: {expanded ? answer : answer.slice(0, 200)}{!expanded && isLong ? "..." : ""}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "none", border: "none", padding: 0,
            fontSize: 11, color: "#1A4731", cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {expanded ? "▲ Hide" : "▼ Show all"}
        </button>
      )}
    </div>
  );
}


export default function LLMTesterPage() {
  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [results, setResults] = useState<TestResult[]>([]);
  const [activeTab, setActiveTab] = useState<"tester" | "history">("tester");

useEffect(() => {
  async function checkRole() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setRole(data.role || null);
    } catch {
      setRole(null);
    } finally {
      setRoleLoaded(true);
    }
  }

  checkRole();
  window.addEventListener("focus", checkRole);
  return () => window.removeEventListener("focus", checkRole);
}, []);

useEffect(() => {
  fetch("/api/llm-tester")
    .then(res => res.json())
    .then(data => {
      if (data.success) setResults(data.data.map((r: any) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        intent: r.intent || "-",
        engineSummary: r.engine_summary || "-",
        reasoning: r.reasoning || "-",
        verdict: r.verdict,
        note: r.note || "",
        timestamp: (() => {
          const d = new Date(r.created_at_wib);
          const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
          const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":");
          return `${date}, ${time}`;
        })(),
      })));
    });
}, []);

  async function handleTest() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setDebugInfo(null);
    setNote("");
    try {
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();
      if (json.success) {
        setAnswer(json.answer || "");
        setDebugInfo({
          intent: json.intent || "-",
          engineSummary: json.engineSummary || "-",
          reasoning: json.reasoning || "-",
          filterContext: json.filterContext || "-",
        });
      } else {
        setAnswer(json.error || "Terjadi error.");
      }
    } catch {
      setAnswer("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

async function handleVerdict(verdict: "pass" | "fail") {
  if (!answer) return;
  await fetch("/api/llm-tester", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question, answer,
      intent: debugInfo?.intent || "-",
      engineSummary: debugInfo?.engineSummary || "-",
      reasoning: debugInfo?.reasoning || "-",
      verdict, note,
      username: role === "spoc" ? "spoc" : "internal",
    }),
  });

  const res = await fetch("/api/llm-tester");
  const data = await res.json();
  if (data.success) setResults(data.data.map((r: any) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    intent: r.intent || "-",
    engineSummary: r.engine_summary || "-",
    reasoning: r.reasoning || "-",
    verdict: r.verdict,
    note: r.note || "",
    timestamp: (() => {
      const d = new Date(r.created_at_wib);
      const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
      const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":");
      return `${date}, ${time}`;
    })(),
  })));

  setQuestion("");
  setAnswer("");
  setDebugInfo(null);
  setNote("");
}

  const passCount = results.filter((r) => r.verdict === "pass").length;
  const failCount = results.filter((r) => r.verdict === "fail").length;

  if (!roleLoaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F8F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#4A6A56", fontSize: 13 }}>Loading...</p>
      </div>
    );
  }

  if (role !== "spoc") {
    return <AccessDenied />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F8F5", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#1A4731", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A4731", margin: 0 }}>AI Tester</h1>
              <p style={{ fontSize: 12, color: "#4A6A56", margin: 0 }}>AI response quality evaluation — SPOC only</p>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <div style={{ background: "#EEF7DC", border: "1px solid #8DC63F", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#1A4731", fontWeight: 600 }}>
                <CheckCircle size={12} /> Pass: {passCount}
              </div>
              <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#991B1B", fontWeight: 600 }}>
                <XCircle size={12} /> Fail: {failCount}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, background: "#E8EDE6", borderRadius: 10, padding: 4, width: "fit-content" }}>
            {(["tester", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "6px 16px", borderRadius: 8, border: "none",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: activeTab === tab ? "#ffffff" : "transparent",
                  color: activeTab === tab ? "#1A4731" : "#4A6A56",
                  boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {tab === "tester" ? <><Pencil size={12} /> Test AI</> : <><ClipboardList size={12} /> History ({results.length})</>}
              </button>
            ))}
          </div>
        </div>

        {/* TAB: TESTER */}
        {activeTab === "tester" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#ffffff", border: "1px solid #D4E8C2", borderRadius: 16, padding: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#4A6A56", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Test Questions
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.ctrlKey && handleTest()}
                placeholder="Enter a question to test.."
                style={{
                  width: "100%", minHeight: 80, marginTop: 8, resize: "none" as const,
                  background: "#F7F8F5", border: "1px solid #D4E8C2",
                  borderRadius: 10, padding: "10px 12px", fontSize: 13,
                  color: "#1A4731", outline: "none", boxSizing: "border-box" as const,
                  fontFamily: "inherit", lineHeight: 1.6,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 11, color: "#4A6A56" }}>Ctrl+Enter to send</span>
                <button
                  onClick={handleTest}
                  disabled={loading || !question.trim()}
                  style={{
                    background: loading || !question.trim() ? "#EEF7DC" : "#8DC63F",
                    border: "none", borderRadius: 10, padding: "8px 20px",
                    fontSize: 13, fontWeight: 600, color: "#1A4731",
                    cursor: loading || !question.trim() ? "not-allowed" : "pointer",
                    opacity: loading || !question.trim() ? 0.6 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  {loading ? "Processing..." : "🚀 Test"}
                </button>
              </div>
            </div>

            {answer && (
              <div style={{ background: "#ffffff", border: "1px solid #D4E8C2", borderRadius: 16, padding: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#4A6A56", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                  AI Answers
                </label>
                  <SmartAnswerDisplay answer={answer} />
              </div>
            )}

            {debugInfo && (
              <div style={{ background: "#ffffff", border: "1px solid #D4E8C2", borderRadius: 16, padding: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#4A6A56", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                  Debug Info
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  {[
                    { label: "Intent / Operation", value: debugInfo.intent },
                    { label: "Filter Context", value: debugInfo.filterContext },
                    { label: "Reasoning LLM", value: debugInfo.reasoning },
                    { label: "Engine Summary", value: debugInfo.engineSummary },
                  ].map((item, i) => (
                    <div key={i} style={{ background: "#F7F8F5", border: "1px solid #D4E8C2", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#4A6A56", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 12, color: "#1A4731", lineHeight: 1.5 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {answer && (
              <div style={{ background: "#ffffff", border: "1px solid #D4E8C2", borderRadius: 16, padding: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#4A6A56", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                  Evaluation
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Evaluation notes (optional)....."
                  style={{
                    width: "100%", minHeight: 60, marginTop: 8, resize: "none" as const,
                    background: "#F7F8F5", border: "1px solid #D4E8C2",
                    borderRadius: 10, padding: "10px 12px", fontSize: 13,
                    color: "#1A4731", outline: "none", boxSizing: "border-box" as const,
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button
                    onClick={() => handleVerdict("pass")}
                    style={{
                      flex: 1, background: "#EEF7DC", border: "1px solid #8DC63F",
                      borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700,
                      color: "#1A4731", cursor: "pointer",
                    }}
                  >
                    <CheckCircle size={16} /> Pass — Correct Answer
                  </button>
                  <button
                    onClick={() => handleVerdict("fail")}
                    style={{
                      flex: 1, background: "#FEE2E2", border: "1px solid #FCA5A5",
                      borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700,
                      color: "#991B1B", cursor: "pointer",
                    }}
                  >
                    <XCircle size={16} /> Fail — Wrong Answer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: HISTORY */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results.length === 0 ? (
              <div style={{
                background: "#ffffff", border: "1px dashed #D4E8C2",
                borderRadius: 16, padding: "40px 20px", textAlign: "center" as const,
                color: "#4A6A56", fontSize: 13,
              }}>
                No Evaluation Results Yet
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={async () => {
                      await fetch("/api/llm-tester", { method: "DELETE" });
                      setResults([]);
                    }}
                    style={{
                      background: "none", border: "1px solid #D4E8C2",
                      borderRadius: 8, padding: "6px 14px", fontSize: 12,
                      color: "#4A6A56", cursor: "pointer",
                    }}
                  >
                    Delete All
                  </button>
                </div>
                {results.map((r) => (
                  <div key={r.id} style={{
                    background: "#ffffff",
                    border: `1px solid ${r.verdict === "pass" ? "#8DC63F" : "#FCA5A5"}`,
                    borderRadius: 16, padding: 16,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <span style={{
                        background: r.verdict === "pass" ? "#EEF7DC" : "#FEE2E2",
                        border: `1px solid ${r.verdict === "pass" ? "#8DC63F" : "#FCA5A5"}`,
                        borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
                        color: r.verdict === "pass" ? "#1A4731" : "#991B1B",
                      }}>
                        {r.verdict === "pass" ? "✅ Pass" : "❌ Fail"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#4A6A56" }}>{r.timestamp}</span>
                      <button
                        onClick={async () => {
                          await fetch("/api/llm-tester", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: r.id }),
                          });
                          setResults(prev => prev.filter(item => item.id !== r.id));
                        }}
                        style={{
                          background: "none", border: "1px solid #FCA5A5",
                          borderRadius: 6, padding: "2px 8px", fontSize: 11,
                          color: "#991B1B", cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#1A4731", margin: "0 0 6px" }}>
                      Q: {r.question}
                    </p>
                    <SmartAnswerDisplay answer={r.answer} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 8 }}>
                      <span style={{ fontSize: 11, background: "#F7F8F5", border: "1px solid #D4E8C2", borderRadius: 6, padding: "2px 8px", color: "#4A6A56" }}>
                        intent: {r.intent}
                      </span>
                      {r.note && (
                        <span style={{ fontSize: 11, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 6, padding: "2px 8px", color: "#92400E" }}>
                          📝 {r.note}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}