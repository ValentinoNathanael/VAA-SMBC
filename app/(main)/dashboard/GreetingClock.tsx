"use client";

import { useEffect, useState } from "react";

const GREETING_LABELS: Record<string, string> = {
  spoc: "Strategic Planning & Operations Control",
  internal: "Internal User",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/\./g, ":");
}

export default function GreetingClock({ role }: { role: string | null }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const roleLabel = role ? GREETING_LABELS[role] ?? role : "Guest";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "0 32px",
      borderLeft: "1px solid #D4E8C2",
      borderRight: "1px solid #D4E8C2",
      minWidth: 260,
    }}>
      {/* Greeting */}
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "#8DC63F",
        marginBottom: 8,
      }}>
        {now ? getGreeting() : "—"}
      </div>

      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: "#1A4731",
        lineHeight: 1.5,
        marginBottom: 16,
        maxWidth: 220,
      }}>
        {roleLabel}
      </div>

      {/* Divider */}
      <div style={{ width: 32, height: 1, background: "#D4E8C2", marginBottom: 16 }} />

      {/* Date */}
      <div style={{
        fontSize: 11,
        color: "#4A6A56",
        marginBottom: 6,
        letterSpacing: "0.02em",
      }}>
        {now ? formatDate(now) : "—"}
      </div>

      {/* Time */}
      <div style={{
        fontFamily: "monospace",
        fontSize: 22,
        fontWeight: 700,
        color: "#1A4731",
        letterSpacing: "0.08em",
        fontVariantNumeric: "tabular-nums",
      }}>
        {now ? formatTime(now) : "--:--:--"}
      </div>
    </div>
  );
}