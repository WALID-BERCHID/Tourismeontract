/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep-space canvas and layered glass surfaces.
        canvas: { DEFAULT: "#0A0920", 2: "#110E2E" },
        surface: { DEFAULT: "#15123A", 2: "#1D194A", 3: "#27225E" },
        // Text & hairlines (ink is *light* on this theme).
        ink: { DEFAULT: "#F5F3FF", soft: "#CBC6EE", muted: "#8F89BE", line: "#312C66", faint: "#241F52", bg: "#1A1642" },
        // Brand: neon magenta → electric violet, mint for "on-chain" states.
        brand: { DEFAULT: "#F23B9E", dark: "#D41F82", deep: "#A80F64", light: "#2C1446", violet: "#8B5CF6", cyan: "#38BDF8", mint: "#3DF5A8" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["Sora", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 12px 32px rgba(3, 2, 20, 0.45)",
        search: "0 8px 24px rgba(3, 2, 20, 0.45), 0 0 0 1px rgba(255,255,255,0.06)",
        pop: "0 20px 50px rgba(3, 2, 20, 0.65), 0 0 0 1px rgba(255,255,255,0.06)",
        glow: "0 0 0 1px rgba(242,59,158,0.35), 0 8px 30px rgba(242,59,158,0.35)",
        "glow-violet": "0 0 0 1px rgba(139,92,246,0.35), 0 8px 30px rgba(139,92,246,0.35)",
        "glow-mint": "0 0 24px rgba(61,245,168,0.35)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(90deg, #F23B9E 0%, #B04CF0 55%, #7C5CFF 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, rgba(242,59,158,0.18), rgba(124,92,255,0.18))",
        "text-gradient": "linear-gradient(90deg, #FF4FB0, #B98CFF 60%, #3DF5A8)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "slide-up": { from: { opacity: 0, transform: "translateY(16px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        pulseGlow: { "0%, 100%": { opacity: 0.55 }, "50%": { opacity: 1 } },
      },
      animation: {
        "fade-in": "fade-in .2s ease-out",
        "slide-up": "slide-up .25s cubic-bezier(.2,.8,.2,1)",
        float: "float 6s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
