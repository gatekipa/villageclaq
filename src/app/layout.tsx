// Root layout is a minimal wrapper. The real layout is in [locale]/layout.tsx.
// This exists because Next.js requires a root layout.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
