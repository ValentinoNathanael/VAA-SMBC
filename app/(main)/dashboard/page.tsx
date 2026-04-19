import Link from "next/link";
import { Database, Eye, BarChart3, Bot } from "lucide-react";
import { getRole, getUsername } from "@/lib/auth.server";
import GreetingClock from "./GreetingClock";
import { pool } from "@/lib/db";


const steps = [
  { title: "Data Management", desc: "Upload Excel files into the system workspace", icon: Database, num: "01", href: "/data-management" },
  { title: "Data Preview", desc: "View data Excel currently in use", icon: Eye, num: "02", href: "/data-preview" },
  { title: "Visualization", desc: "Show Bar Chart and Waterfall Chart from data", icon: BarChart3, num: "03", href: "/visualization" },
  { title: "Ask AI", desc: "Find information from Excel files with AI assistance", icon: Bot, num: "04", href: "/ask-ai" },
];



export default async function DashboardPage() {
  const role = await getRole();
  const username = await getUsername();

  let loginHistory: any[] = [];
  if (role === "spoc") {
  const result = await pool.query(
    `SELECT username, role, logged_in_at AS logged_in_at_wib 
    FROM login_history ORDER BY logged_in_at DESC LIMIT 20`
  );
    loginHistory = result.rows;
  }

  const visibleSteps = role === "internal"
    ? steps.filter(s => !["Data Management", "Data Preview"].includes(s.title))
    .map((s, i) => ({ ...s, num: String(i + 1).padStart(2, "0") }))
    : steps;

  return (
    <div
    style={{
      color: "#1A4731",
    }}
    >
      {/* Main Content */}
      <div style={{ width: "100%" }}>

        {/* Hero Section — 3 kolom: teks | greeting+clock | stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 24, alignItems: "center", marginBottom: 28 }}>

          {/* Kiri — Hero Text */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8DC63F", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 18, height: 2, background: "#8DC63F", borderRadius: 2 }} />
              AI Assistant
            </div>

            <h1 style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.1, color: "#1A4731", margin: "0 0 12px", letterSpacing: "-0.01em", fontFamily: "inherit" }}>
              Welcome to{" "}
              <em style={{ fontStyle: "italic", color: "#8DC63F" }}>VAA</em>
              <br />
              Dashboard
            </h1>

            <p style={{ fontSize: 13.5, color: "#4A6A56", lineHeight: 1.7, maxWidth: 460, margin: 0 }}>
              Use this dashboard to initiate the upload process, view data, open
              visualizations, and search for information from Excel files using AI.
            </p>
          </div>

          {/* Tengah — Greeting + Clock */}
          <GreetingClock role={role} username={username} />


          {/* Kanan — Stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 168 }}>
            {[
              { num: role === "internal" ? "2" : "4", lbl: "Features" },
              { num: "AI", lbl: "Powered" },
            ].map((s) => (
              <div key={s.lbl} style={{ background: "#EEF7DC", border: "1px solid #D4E8C2", borderRadius: 14, padding: "14px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 26, color: "#1A4731", lineHeight: 1, marginBottom: 4 }}>{s.num}</div>
                <div style={{ fontSize: 10.5, color: "#4A6A56", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <hr style={{ border: "none", borderTop: "2px solid #D4E8C2", marginBottom: 28 }} />

        {/* Section Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A4731", letterSpacing: "-0.01em" }}>Feature</div>
        </div>

        {/* Steps Grid */}
        <style>{`
          .step-card { background: #ffffff; border: 1px solid #D4E8C2; transition: all 0.22s ease; text-decoration: none; display: flex; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
          .step-card:hover { background: #EEF7DC !important; border-color: #8DC63F !important; }
        `}</style>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {visibleSteps.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.title}
                href={item.href}
                className="step-card"
                style={{
                  borderRadius: 18,
                  padding: 20,
                  gap: 16,
                  alignItems: "flex-start",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ width: 44, height: 44, background: "#EEF7DC", border: "1px solid #D4E8C2", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={20} color="#1A4731" strokeWidth={1.8} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#8DC63F", letterSpacing: "0.12em", marginBottom: 4 }}>{item.num}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1A4731", marginBottom: 5, letterSpacing: "-0.01em" }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "#4A6A56", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
        {role === "spoc" && loginHistory.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <hr style={{ border: "none", borderTop: "2px solid #D4E8C2", marginBottom: 28 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A4731", marginBottom: 18 }}>Login History</div>
          <div style={{ borderRadius: 16, border: "1px solid #D4E8C2", overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F4F7F2", borderBottom: "2px solid #8DC63F" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "#1A4731", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Username</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "#1A4731", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Role</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", color: "#1A4731", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Logged In At</th>
                </tr>
              </thead>
              <tbody>
                {loginHistory.map((log: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F0F5EE", background: i % 2 === 0 ? "#ffffff" : "#F7FCF4" }}>
                    <td style={{ padding: "10px 16px", color: "#1A4731", fontWeight: 600, fontFamily: "monospace" }}>{log.username}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        background: log.role === "spoc" ? "#EEF7DC" : "#F0F0FF",
                        border: `1px solid ${log.role === "spoc" ? "#8DC63F" : "#A0A0FF"}`,
                        borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
                        color: log.role === "spoc" ? "#1A4731" : "#3333AA",
                      }}>
                        {log.role === "spoc" ? "SPOC" : "Internal User"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "#4A6A56", fontFamily: "monospace", fontSize: 12 }}>
                    {(() => {
                      const d = new Date(log.logged_in_at_wib );
                      const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
                      const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":");
                      return `${date}, ${time}`;
                    })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}