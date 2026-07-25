/** @type {import('tailwindcss').Config} */
export default {
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
        sentinel: {
          50: "#eef5ff",
          100: "#dbe9ff",
          500: "#3b6ff5",
          600: "#2959db",
          700: "#2148b5",
          950: "#081426",
        },
      },
      boxShadow: {
        panel: "0 18px 50px -30px rgba(15, 30, 54, 0.34)",
      },
    },
  },
  plugins: [],
};
