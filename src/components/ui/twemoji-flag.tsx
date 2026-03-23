"use client";

/**
 * Renders a country flag emoji as a Twemoji SVG image.
 * This ensures flags render correctly on Windows and all platforms.
 * Uses the jsDelivr CDN for Twemoji SVGs.
 */

interface TwemojiFlagProps {
  emoji: string;
  alt?: string;
  className?: string;
}

function emojiToTwemojiUrl(emoji: string): string {
  // Convert emoji to codepoint(s) for Twemoji URL
  const codepoints: string[] = [];
  for (let i = 0; i < emoji.length; i++) {
    const code = emoji.codePointAt(i);
    if (code === undefined) continue;
    // Skip variant selectors
    if (code === 0xfe0f) continue;
    codepoints.push(code.toString(16));
    // Skip low surrogate of a surrogate pair
    if (code > 0xffff) i++;
  }
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoints.join("-")}.svg`;
}

export function TwemojiFlag({ emoji, alt = "", className = "h-7 w-7" }: TwemojiFlagProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={emojiToTwemojiUrl(emoji)}
      alt={alt || emoji}
      className={className}
      loading="lazy"
      draggable={false}
    />
  );
}
