import Link from "next/link";
import { Database, Eye, BarChart3, Bot } from "lucide-react";
import { getRole } from "@/lib/auth.server";
import GreetingClock from "./GreetingClock";

const steps = [
  { title: "Data Management", desc: "Upload Excel files into the system workspace", icon: Database, num: "01", href: "/data-management" },
  { title: "Data Preview", desc: "View data Excel currently in use", icon: Eye, num: "02", href: "/data-preview" },
  { title: "Visualization", desc: "Show Bar Chart and Waterfall Chart from data", icon: BarChart3, num: "03", href: "/visualization" },
  { title: "Ask AI", desc: "Find information from Excel files with AI assistance", icon: Bot, num: "04", href: "/ask-ai" },
];

export default async function DashboardPage() {
  const role = await getRole();

  return (
    <div
      style={{
        fontFamily: "'Plus Jakarta Sans', sans-serif",
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

            <h1 style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.1, color: "#1A4731", margin: "0 0 12px", letterSpacing: "-0.01em", fontFamily: "Georgia, 'Times New Roman', serif" }}>
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
          <GreetingClock role={role} />

          {/* Kanan — Stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 168 }}>
            {[
              { num: "4", lbl: "Features" },
              { num: "AI", lbl: "Powered" },
            ].map((s) => (
              <div key={s.lbl} style={{ background: "#EEF7DC", border: "1px solid #D4E8C2", borderRadius: 14, padding: "14px 18px", textAlign: "center" }}>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 26, color: "#1A4731", lineHeight: 1, marginBottom: 4 }}>{s.num}</div>
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
          .step-card { background: #ffffff; border: 1px solid #D4E8C2; transition: all 0.22s ease; text-decoration: none; display: flex; }
          .step-card:hover { background: #EEF7DC !important; border-color: #8DC63F !important; }
        `}</style>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {steps.map((item) => {
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
      </div>
    </div>
  );
}