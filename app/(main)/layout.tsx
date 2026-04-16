"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    FolderOpen,
    Eye,
    BarChart3,
    Bot,
    History,
    LogOut,
    ChevronLeft,
} from "lucide-react";




const MENUS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Data Management", href: "/data-management", icon: FolderOpen },
    { label: "Data Preview", href: "/data-preview", icon: Eye },
    { label: "Visualization", href: "/visualization", icon: BarChart3 },
    { label: "Ask AI", href: "/ask-ai", icon: Bot },
    { label: "Chat History & Download", href: "/chat-history", icon: History },
];

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);

    const [role, setRole] = useState<string | null>(null);

    useEffect(() => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => setRole(d.role || null))
        .catch(() => setRole(null));
    }, []);
    const activeMenu = MENUS.find((m) => pathname === m.href);
    const activeLabel = activeMenu?.label ?? "Dashboard";

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
    };

    return (
<main className="min-h-screen bg-[#1A4731] p-3 md:p-4 overflow-hidden">
    <div className="flex min-h-[calc(100dvh-24px)] w-full gap-3 bg-[#1A4731]">
                {/* Sidebar */}
                <aside
                    className={[
                        "shrink-0 rounded-[28px] bg-[#1A4731] py-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] transition-all duration-300",
                        collapsed ? "w-23 px-3" : "w-72.5 px-4",
                    ].join(" ")}
                >
                    <div className="flex h-full flex-col">
                        {/* Header / Logo */}
                        <div
                            className={[
                                "flex items-center",
                                collapsed ? "justify-center" : "justify-between",
                            ].join(" ")}
                        >
                            <div
                                className={[
                                    "flex items-center",
                                    collapsed ? "justify-center" : "gap-3",
                                ].join(" ")}
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8DC63F] text-lg font-bold text-[#1A4731] shadow-sm">
                                    V
                                </div>

                                {!collapsed && (
                                    <div>
                                        <p className="text-lg font-bold text-white">VAA</p>
                                        <p className="text-xs text-white/50">AI Workspace</p>
                                    </div>
                                )}
                            </div>

                            {!collapsed && (
                                <button
                                    type="button"
                                    onClick={() => setCollapsed(true)}
                                    className="hidden md:flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                                    aria-label="Collapse sidebar"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* Expand button when collapsed */}
                        {collapsed && (
                            <div className="mt-4 hidden md:flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setCollapsed(false)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                                    aria-label="Expand sidebar"
                                >
                                    <ChevronLeft className="h-4 w-4 rotate-180" />
                                </button>
                            </div>
                        )}

                        {/* Menu */}
                        <div className="mt-8 flex-1">
                            <div className="space-y-2">
                                {MENUS.map((item) => {
                                    const isActive = pathname === item.href;
                                    const Icon = item.icon;

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            title={item.label}
                                            className={[
                                                "group flex items-center rounded-2xl transition-all duration-200",
                                                collapsed
                                                    ? "justify-center px-2 py-3"
                                                    : "gap-3 px-3 py-3",
                                                isActive
                                                    ? "bg-[#8DC63F] text-[#1A4731] shadow-[0_8px_24px_rgba(141,198,63,0.35)]"
                                                    : "text-white/70 hover:bg-white/10 hover:text-white",
                                            ].join(" ")}
                                        >
                                            <span
                                                className={[
                                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
                                                    isActive
                                                        ? "bg-[#1A4731]/20 text-[#1A4731]"
                                                        : "bg-white/10 text-white/70 group-hover:bg-white/20",
                                                ].join(" ")}
                                            >
                                                <Icon className="h-5 w-5" />
                                            </span>

                                            {!collapsed && (
                                                <span className="text-sm font-medium">{item.label}</span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bottom area */}
                        <div className="mt-6 space-y-3">

                            <button
                                onClick={handleLogout}
                                className={[
                                    "flex items-center rounded-2xl bg-black/30 text-sm font-semibold text-white transition hover:bg-black/50",
                                    collapsed
                                        ? "w-full justify-center px-3 py-3"
                                        : "w-full justify-center gap-3 px-4 py-3",
                                ].join(" ")}
                            >
                                <>
                                    <LogOut className="h-4 w-4" />
                                    {!collapsed && <span>Logout</span>}
                                </>
                            </button>
                        </div>
                    </div>
                </aside>

                {/* Content */}
                <section className="min-w-0 flex-1 rounded-[28px] bg-white overflow-y-auto">
                    {/* ── Global Topbar ── */}
                    <div
                        style={{
                            background: "#1A4731",
                            borderBottom: "1px solid rgba(141,198,63,0.15)",
                            padding: "12px 32px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", color: "white", textTransform: "uppercase", lineHeight: 1.2 }}>
                                    SMBC Indonesia
                                </div>
                                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em", fontWeight: 500 }}>
                                    VAA · AI Workspace
                                </div>
                            </div>
                            <span style={{ color: "rgba(141,198,63,0.5)", margin: "0 4px", fontSize: 14 }}>›</span>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8DC63F" }}>
                                {activeLabel}
                            </span>
                        </div>

                        <div
                            style={{
                                background: "rgba(141,198,63,0.12)",
                                border: "1px solid rgba(141,198,63,0.25)",
                                padding: "6px 16px",
                                borderRadius: 20,
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.1em",
                                color: "#8DC63F",
                                textTransform: "uppercase",
                            }}
                        >
                            SMBC INDONESIA · DATA WORKSPACE
                        </div>
                    </div>

                    {/* Page content */}
                    <div className="px-5 py-5 md:px-8 md:py-8">
                        {children}
                    </div>
                </section>
            </div>
        </main>
    );
}