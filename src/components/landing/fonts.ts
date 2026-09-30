import { Newsreader, Hanken_Grotesk } from "next/font/google";

// Marketing typefaces, exposed as CSS variables and scoped to the landing
// wrapper (.vc-landing) so they never touch the emerald/slate app shell.
export const landingSerif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--vc-serif",
  display: "swap",
});

export const landingSans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--vc-sans",
  display: "swap",
});
