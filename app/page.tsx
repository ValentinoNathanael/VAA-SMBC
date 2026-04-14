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
            img.onerror = () => {
              console.error("Failed to load image:", src);
              resolve();
            };
          })
      )
    ).then(() => {
      if (active) setReady(true);
    });

    return () => {
      active = false;
    };
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
        <p className="text-white/70 text-sm">Loading...</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute top-6 left-6 z-20">
        <div className="flex items-center gap-3 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2 shadow-lg">
          <img
            src="/Logo-SMBC.png"
            alt="SMBC"
            className="h-10 w-auto opacity-90"
          />
          <span className="text-xs text-white/80 tracking-wide">
            Internal Prototype
          </span>
        </div>
      </div>

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

        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-950/60 via-transparent to-green-900/50" />
      </div>

      <div className="pointer-events-none absolute w-[500px] h-[500px] bg-green-500/20 blur-[120px] rounded-full top-[-100px] left-[-100px]" />
      <div className="pointer-events-none absolute w-[500px] h-[500px] bg-emerald-400/20 blur-[120px] rounded-full bottom-[-100px] right-[-100px]" />

      <div className="relative z-10 backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-12 text-center shadow-2xl">
        <h1 className="text-5xl font-bold text-white tracking-wide">VAA</h1>

        <p className="mt-4 text-gray-200 text-lg">
          Search, analyze, and understand your Excel data with AI.
        </p>

        <div className="mt-10">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-3 font-semibold shadow-xl hover:scale-105 hover:bg-green-400 hover:shadow-green-500/40 transition-all duration-300"
          >
            Continue →
          </Link>
        </div>

        <div className="mt-8 flex justify-center gap-2">
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-all ${
                i === current ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </main>
  );
}