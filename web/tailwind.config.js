/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#FF385C", dark: "#E31C5F", deep: "#D70466", light: "#FFF1F3" },
        ink: { DEFAULT: "#222222", soft: "#484848", muted: "#717171", line: "#DDDDDD", faint: "#EBEBEB", bg: "#F7F7F7" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 6px 16px rgba(0,0,0,0.12)",
        search: "0 3px 12px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.08)",
        pop: "0 8px 28px rgba(0,0,0,0.28)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "slide-up": { from: { opacity: 0, transform: "translateY(16px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in .2s ease-out",
        "slide-up": "slide-up .25s cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};
