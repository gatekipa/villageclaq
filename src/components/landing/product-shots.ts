import type { ShotSource } from "./product-shot";

// Real screens from a fictional demo group ("Green Valley Hometown Association")
// on the isolated founder-test backend, captured on 2026-09-30. Desktop crops are
// 2x captures; "*Mobile" crops are 3x captures at phone width (390 CSS px).
export type ShotName =
  | "hero"
  | "heroMobile"
  | "phoneAccent"
  | "import"
  | "importMobile"
  | "contributions"
  | "contributionsMobile"
  | "hosting"
  | "hostingMobile"
  | "minutes"
  | "minutesMobile"
  | "roles"
  | "rolesMobile";

const v2 = (name: string, width: number, height: number): ShotSource => ({
  src: `/images/product/v2/${name}.webp`,
  width,
  height,
});

const en: Record<ShotName, ShotSource> = {
  hero: v2("hero-en", 2012, 1138),
  heroMobile: v2("hero-mobile-en", 1170, 1636),
  phoneAccent: v2("contrib-mobile-en", 1170, 1951),
  import: v2("import-en", 1428, 1360),
  importMobile: v2("import-mobile-en", 1066, 2149),
  contributions: v2("contrib-en", 2012, 840),
  contributionsMobile: v2("contrib-mobile-en", 1170, 1951),
  hosting: v2("hosting-en", 1200, 923),
  hostingMobile: v2("hosting-mobile-en", 1170, 1954),
  minutes: v2("minutes-en", 1200, 922),
  minutesMobile: v2("minutes-mobile-en", 1170, 2074),
  roles: v2("roles-en", 2352, 1125),
  rolesMobile: v2("roles-mobile-en", 1170, 2184),
};

const fr: Record<ShotName, ShotSource> = {
  hero: v2("hero-fr", 2012, 1175),
  heroMobile: v2("hero-mobile-fr", 1170, 1686),
  phoneAccent: v2("contrib-mobile-fr", 1170, 2001),
  import: v2("import-fr", 1428, 1360),
  importMobile: v2("import-mobile-fr", 1066, 2149),
  contributions: v2("contrib-fr", 2012, 839),
  contributionsMobile: v2("contrib-mobile-fr", 1170, 2001),
  hosting: v2("hosting-fr", 1200, 968),
  hostingMobile: v2("hosting-mobile-fr", 1170, 2055),
  minutes: v2("minutes-fr", 1200, 968),
  minutesMobile: v2("minutes-mobile-fr", 1170, 2130),
  roles: v2("roles-fr", 2352, 1157),
  rolesMobile: v2("roles-mobile-fr", 1170, 2190),
};

export const PRODUCT_SHOTS: Record<"en" | "fr", Record<ShotName, ShotSource>> = { en, fr };
