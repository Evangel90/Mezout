import type { Config } from "tailwindcss";

/**
 * Mezout's design tokens. Neutrals are Tailwind's warm `stone`; the brand adds one bright accent ("signal" orange, a
 * nod to Bitcoin), `agent` violet for AI agents and `musd` green for settlement and paid states.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        signal: {
          50: "#fff5ed",
          100: "#ffe8d4",
          200: "#ffcda8",
          300: "#ffaa70",
          400: "#ff8a3d",
          500: "#ff6b14",
          600: "#ea5409",
          700: "#c2410a",
          800: "#9a3412",
          900: "#7c2d12",
        },
        agent: {
          50: "#f4f2ff",
          100: "#ebe7ff",
          200: "#d9d1ff",
          300: "#bcaeff",
          400: "#9d85ff",
          500: "#7f5cff",
          600: "#6b3df5",
          700: "#5b2ed8",
          800: "#4b27b0",
          900: "#3e238c",
        },
        musd: {
          50: "#ecfdf3",
          100: "#d3f8e2",
          200: "#a9efc8",
          300: "#6fdfa6",
          400: "#35c77f",
          500: "#14ab64",
          600: "#0a8a50",
          700: "#0a6e42",
          800: "#0c5737",
          900: "#0b482f",
        },
        ink: "#0c0a09",
        canvas: "#f3f2ef",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 0 0 rgb(12 10 9 / 0.06), 0 1px 3px 0 rgb(12 10 9 / 0.04)",
        lift: "0 24px 60px -20px rgb(12 10 9 / 0.28)",
      },
    },
  },
  plugins: [],
};
export default config;
