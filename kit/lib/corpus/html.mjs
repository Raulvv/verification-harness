// Rendered HTML → plain text (no deps): keep what a reader reads. Used by
// the mediawiki, flat and confluence adapters.
export function htmlToText(html) {
  let t = String(html ?? '')
  t = t.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
  t = t.replace(/>[\s\r\n]+</g, '><') // inter-tag newlines must not become content breaks ("-" alone on a line)
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|section)>/gi, '\n')
  t = t.replace(/<li[^>]*>/gi, '- ').replace(/<h([1-6])[^>]*>/gi, (_m, n) => '\n' + '#'.repeat(Number(n)) + ' ')
  t = t.replace(/<td[^>]*>/gi, ' | ').replace(/<[^>]+>/g, '')
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#\d+;/g, '')
  return t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').replace(/\s*edit\s*$/i, '').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
