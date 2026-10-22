function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** **жирный** и переносы строк */
export function renderMarkdownLite(text: string): string {
  const escaped = escapeHtml(text);
  const withBold = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/\n/g, "<br />");
}
