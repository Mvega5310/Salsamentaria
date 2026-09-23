import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#EFE7DC",
        crema: "#FBF6EF",
        crema2: "#F3E9DB",
        borde: "#E2D3C0",
        salsa: "#B23A1E",
        curado: "#8A2B14",
        ink: "#2A1C16",
        mostaza: "#D98B2B",
        hoja: "#3E6B52",
        muted: "#8A7A6E",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "14px",
        xl3: "20px",
      },
    },
  },
  plugins: [],
};
export default config;
