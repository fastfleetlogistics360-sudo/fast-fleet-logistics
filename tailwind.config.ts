import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        fleet: {
          ink: "rgb(var(--fleet-ink) / <alpha-value>)",
          night: "rgb(var(--fleet-night) / <alpha-value>)",
          navy: "rgb(var(--fleet-navy) / <alpha-value>)",
          blue: "rgb(var(--fleet-blue) / <alpha-value>)",
          gold: "rgb(var(--fleet-gold) / <alpha-value>)",
          ember: "rgb(var(--fleet-ember) / <alpha-value>)",
          leaf: "rgb(var(--fleet-leaf) / <alpha-value>)",
          mint: "rgb(var(--fleet-mint) / <alpha-value>)",
          paper: "rgb(var(--fleet-paper) / <alpha-value>)",
          line: "rgb(var(--fleet-line) / <alpha-value>)"
        }
      },
      boxShadow: {
        glow: "0 24px 80px rgba(15, 52, 96, 0.2)",
        lift: "0 16px 40px rgba(8, 17, 31, 0.12)"
      },
      borderRadius: {
        fleet: "8px"
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" }
        },
        route: {
          "0%": { transform: "translateX(-16%)" },
          "50%": { transform: "translateX(16%)" },
          "100%": { transform: "translateX(-16%)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.7", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" }
        }
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        route: "route 5s ease-in-out infinite",
        pulseSoft: "pulseSoft 2.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
