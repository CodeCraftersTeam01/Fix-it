/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hud: {
          bg: "rgba(18, 18, 20, 0.85)",
          border: "rgba(255, 255, 255, 0.12)",
          card: "rgba(30, 30, 34, 0.65)",
          input: "rgba(40, 40, 45, 0.75)",
          text: "#f3f4f6",
          muted: "#9ca3af",
          accent: "#38bdf8",
          error: "#f87171",
          success: "#34d399",
        }
      },
      borderRadius: {
        'hud': '28px',
      },
      backdropBlur: {
        'hud': '24px',
      }
    },
  },
  plugins: [],
}

