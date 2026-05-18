"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";

const STORAGE_KEY = "fastfleet.theme";

function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const nextTheme = preferredTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-full border border-fleet-line bg-white/85 p-1 text-fleet-night shadow-[0_10px_26px_rgba(8,17,31,0.08)] backdrop-blur-xl",
        className
      )}
      aria-label="Theme"
    >
      <button
        type="button"
        className={cn(
          "grid h-7 w-7 place-items-center rounded-full transition",
          theme === "light" ? "bg-fleet-gold text-fleet-night shadow-[0_6px_14px_rgba(244,166,42,0.28)]" : "text-slate-500 hover:bg-fleet-paper"
        )}
        aria-label="Use light theme"
        aria-pressed={theme === "light"}
        onClick={() => chooseTheme("light")}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn(
          "grid h-7 w-7 place-items-center rounded-full transition",
          theme === "dark" ? "bg-fleet-night text-white shadow-[0_6px_14px_rgba(8,17,31,0.22)]" : "text-slate-500 hover:bg-fleet-paper"
        )}
        aria-label="Use dark theme"
        aria-pressed={theme === "dark"}
        onClick={() => chooseTheme("dark")}
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
