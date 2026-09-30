import { getImageProps } from "next/image";

export interface ShotSource {
  src: string;
  width: number;
  height: number;
}

interface ProductShotProps {
  desktop: ShotSource;
  /** Optional phone-sized capture, served instead of the desktop crop below 768px. */
  mobile?: ShotSource;
  alt: string;
  sizes: string;
  mobileSizes?: string;
  eager?: boolean;
  className?: string;
}

/**
 * Real application screenshot with art direction: phones receive a capture
 * made at phone width, so text stays legible instead of a shrunken desktop crop.
 */
export function ProductShot({ desktop, mobile, alt, sizes, mobileSizes, eager = false, className }: ProductShotProps) {
  const loading = eager ? ("eager" as const) : ("lazy" as const);
  const { props: desktopProps } = getImageProps({
    ...desktop,
    alt,
    sizes,
    loading,
    fetchPriority: eager ? "high" : undefined,
  });

  if (!mobile) {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- alt and the optimized srcSet come from getImageProps
    return <img {...desktopProps} className={className} />;
  }

  const {
    props: { srcSet: mobileSrcSet },
  } = getImageProps({ ...mobile, alt, sizes: mobileSizes ?? "100vw", loading });

  return (
    <picture className={className}>
      <source media="(max-width: 767px)" srcSet={mobileSrcSet} sizes={mobileSizes ?? "100vw"} width={mobile.width} height={mobile.height} />
      <source media="(min-width: 768px)" srcSet={desktopProps.srcSet} sizes={sizes} width={desktop.width} height={desktop.height} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt is supplied through getImageProps */}
      <img {...desktopProps} />
    </picture>
  );
}
