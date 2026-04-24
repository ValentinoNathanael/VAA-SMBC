"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Home() {
  const images = [
    "Menara-SMBC-Indonesia.png",
    "/Menara-SMBC.jpg",
    "/Raja-Ampat.jpg",
  ];

  const [current, setCurrent] = useState(0);
  const [next, setNext] = useState(1);
  const [showNext, setShowNext] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all(
      images.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.src = src;
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    ).then(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let fadeTimeout: ReturnType<typeof setTimeout>;
    let switchTimeout: ReturnType<typeof setTimeout>;
    const runSlider = () => {
      const nextIndex = (current + 1) % images.length;
      setNext(nextIndex);
      setShowNext(true);
      fadeTimeout = setTimeout(() => {
        setCurrent(nextIndex);
        setShowNext(false);
      }, 2000);
      switchTimeout = setTimeout(runSlider, 6000);
    };
    switchTimeout = setTimeout(runSlider, 4000);
    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(switchTimeout);
    };
  }, [current, ready]);

  if (!ready) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/50 text-sm font-light tracking-wide">Loading...</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">
      
      {/* Logo badge — lebih refined */}
      <div className="absolute top-5 left-5 z-20">
        <div className="flex items-center gap-2.5 rounded-full bg-white/8 backdrop-blur-xl border border-white/12 px-3.5 py-1.5">
          <img src="/Logo-SMBC.png" alt="SMBC" className="h-8 w-auto opacity-85" />
          <span className="text-[11px] text-white/60 tracking-widest uppercase font-medium">
            Internal Prototype
          </span>
        </div>
      </div>

      {/* Background slider */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-center bg-cover scale-105"
          style={{ backgroundImage: `url("${images[current]}")` }}
        />
        <div
          className={`absolute inset-0 bg-center bg-cover scale-105 transition-opacity duration-[2000ms] ease-in-out ${
            showNext ? "opacity-100" : "opacity-0"
          }`}
          style={{ backgroundImage: `url("${images[next]}")` }}
        />
        {/* Overlay lebih dalam — Apple suka contrast yang clean */}
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
      </div>

      {/* Ambient glow — lebih subtle */}
      <div className="pointer-events-none absolute w-[600px] h-[600px] bg-green-500/10 blur-[140px] rounded-full top-[-150px] left-[-150px]" />
      <div className="pointer-events-none absolute w-[600px] h-[600px] bg-emerald-400/10 blur-[140px] rounded-full bottom-[-150px] right-[-150px]" />

      {/* Main card — Apple Liquid Glass style */}
      <div
        className="relative z-10 text-center px-14 py-12 rounded-3xl"
        style={{
          background: "rgba(255,255,255,0.07)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        {/* Eyebrow label — Apple HIG style */}
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/45 mb-3">
          AI Workspace
        </p>

        {/* Heading — tracking-tight, Apple signature */}
        <h1
          className="text-6xl font-bold text-white"
          style={{ letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          VAA
        </h1>

        {/* Subtitle — lebih kecil dan subtle */}
        <p className="mt-4 text-sm text-white/55 font-light tracking-wide max-w-[280px] mx-auto leading-relaxed">
          Search, analyze, and understand your Excel data with AI.
        </p>

        {/* CTA Button — Apple pill button style */}
        <div className="mt-10">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold 
            transition-all duration-200 active:scale-95"
            style={{
              background: "rgba(255,255,255,0.92)",
              color: "#111",
              boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
              letterSpacing: "-0.01em",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.92)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.2)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgbargba(200,200,200,1)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";
            }}
          >
            Continue
            <span className="text-black/50">→</span>
          </Link>
        </div>

        {/* Dot indicator — active dot lebih wide, Apple style */}
        <div className="mt-8 flex justify-center items-center gap-1.5">
          {images.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                height: "5px",
                width: i === current ? "16px" : "5px",
                background: i === current ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}