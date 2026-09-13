import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          400: "#2dd4bf",
          500: "#0f9f95",
          600: "#0f766e",
        },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #0f766e 0%, #0f9f95 58%, #f59e0b 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, rgba(15,118,110,0.18), rgba(20,184,166,0.14) 58%, rgba(245,158,11,0.12))",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(20,184,166,0.3), 0 8px 26px -14px rgba(15,118,110,0.48)",
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-up": "slideUp 240ms ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
