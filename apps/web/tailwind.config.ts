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
        display: ["Bricolage Grotesque", "ui-sans-serif", "system-ui"],
        sans: ["Onest", "ui-sans-serif", "system-ui"],
        mono: ["Space Mono", "ui-monospace", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;

