/** Audited legacy markup or an existing unescaped scalar; never a sanitizer. */
export type LegacyHtmlFragment = string & { readonly legacyHtmlFragment: unique symbol };

/** Preserve existing interpolation at explicitly reviewed raw Eta slots. */
export function legacyHtml(value: unknown): LegacyHtmlFragment {
  if (typeof value === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  return String(value) as LegacyHtmlFragment;
}
