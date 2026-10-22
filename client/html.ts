export type HtmlValue = string | number | boolean | null | undefined;

const entities: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

function escape(value: HtmlValue, characters: RegExp): string {
  return String(value ?? '').replace(characters, (character) => entities[character]);
}

/** Escapes text for element content or quoted HTML attributes, not URLs or script. */
export function escapeHtml(value: HtmlValue): string {
  return escape(value, /[&<>"']/g);
}

/** Existing mission markup leaves apostrophes literal inside double-quoted attributes. */
export function escapeDoubleQuotedHtml(value: HtmlValue): string {
  return escape(value, /[&<>"]/g);
}
