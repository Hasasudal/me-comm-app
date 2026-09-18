// A short piece of the body around the first case-insensitive match, so results show why they matched.
export function searchSnippet(content: string, query: string, radius = 30) {
  const at = content.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(0, at - radius),
    end = Math.min(content.length, at + query.length + radius);
  const text = content.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${text}${end < content.length ? '…' : ''}`;
}
