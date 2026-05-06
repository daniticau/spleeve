/**
 * Parse an MP3 filename into artist and title.
 * Handles common patterns from downloaded/ripped music.
 */
export function parseFilename(filename: string): { artist: string; title: string; trackNumber?: string } | null {
  // Strip extension
  let name = filename.replace(/\.\w{2,4}$/, '');
  const trackNumber = name.match(/^\s*(\d{1,3})/)?.[1];

  // Strip leading track numbers: "01 ", "01. ", "01 - ", "1. "
  name = name.replace(/^\d{1,3}[\s._-]+/, '');

  // Try "Artist - Title" (most common pattern)
  const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    const artist = cleanPart(dashMatch[1]);
    const title = cleanPart(dashMatch[2]);
    if (artist && title) return { artist, title, trackNumber };
  }

  // If no dash separator, treat the whole thing as a title
  const cleaned = cleanPart(name);
  if (cleaned) return { artist: '', title: cleaned, trackNumber };

  return null;
}

/** Remove common noise from a parsed part */
function cleanPart(s: string): string {
  return s
    // Remove common tags in brackets/parens
    .replace(/\s*[([](official\s*(audio|video|music\s*video)|lyric\s*video|audio|hq|hd|explicit|clean|prod\.?\s*[^)\]]*|visualizer)[\])]/gi, '')
    // Remove leftover empty brackets
    .replace(/\s*[([]\s*[\])]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
