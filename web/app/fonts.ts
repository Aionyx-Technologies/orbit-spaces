import localFont from "next/font/local";

export const sansFont = localFont({
  src: "./fonts/geist-latin-wght-normal.woff2",
  variable: "--font-sans-face",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: "Arial",
});
