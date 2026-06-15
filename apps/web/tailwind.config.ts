import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        nero: {
          bg: "#070708",
          panel: "#111014",
          ink: "#ffffff",
          dim: "#a1a1aa",
          pink: "#ff2d7e",
          violet: "#9d4bff",
          gold: "#ffcf4a"
        }
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui"],
        sans: ["Inter", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
} satisfies Config;

