/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { lg: "960px" } },
    extend: {
      colors: {
        ink: "hsl(var(--ink))",
        muted: "hsl(var(--muted))",
        paper: "hsl(var(--paper))",
        card: "hsl(var(--card))",
        line: "hsl(var(--line))",
        accent: "hsl(var(--accent))",
        "accent-ink": "hsl(var(--accent-ink))",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { lg: "12px", md: "8px", sm: "6px" },
    },
  },
  plugins: [],
};
