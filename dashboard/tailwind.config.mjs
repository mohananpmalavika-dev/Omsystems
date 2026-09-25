/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"], [data-theme="navy"], [data-theme="emerald"], .dark'],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Segoe UI", "Arial", "sans-serif"],
      },
      colors: {
        blue: {
          50: "#eef9f5",
          100: "#d9f1e9",
          200: "#b6e4d7",
          300: "#80d0bd",
          400: "#42ad9e",
          500: "#087f78",
          600: "#076e68",
          700: "#075b57",
          800: "#0b4948",
          900: "#103d3e",
          950: "#08292e",
        },
        indigo: {
          50: "#eff8f6",
          100: "#dcf0eb",
          200: "#b9e1d8",
          300: "#87c9bd",
          400: "#4da99b",
          500: "#24877e",
          600: "#176e69",
          700: "#145a57",
          800: "#164a4a",
          900: "#163d3f",
          950: "#0b292f",
        },
        sentinel: {
          50: "#eef9f5",
          100: "#d9f1e9",
          500: "#087f78",
          600: "#076e68",
          700: "#075b57",
          950: "#08292e",
        },
      },
      boxShadow: {
        panel: "0 18px 50px -30px rgba(15, 30, 54, 0.34)",
      },
    },
  },
  plugins: [],
};
