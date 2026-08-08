// Lightweight heuristic that flags drafts which appear to make factual or
// news-style claims. This is intentionally simple: it exists to REMIND the
// human reviewer to verify before publishing, not to be a fact-checker.

const CLAIM_PATTERNS = [
  { re: /\b\d{1,3}(\.\d+)?\s?%/, label: 'a percentage / statistic' },
  { re: /\b(?:study|studies|research|report|survey|poll)\b/i, label: 'a study/research reference' },
  { re: /\baccording to\b/i, label: 'an attributed claim ("according to")' },
  { re: /\b(?:breaking|just in|confirmed|announced|reveals?|reportedly)\b/i, label: 'news-style phrasing' },
  { re: /\b(?:scientists?|experts?|officials?|government|CEO|study found)\b/i, label: 'an authority citation' },
  { re: /\b(?:in|by)\s+20\d{2}\b/, label: 'a specific year/date claim' },
  { re: /\b(?:\$|€|£)\s?\d[\d,]*/, label: 'a monetary figure' },
  { re: /\b(?:first|only|largest|fastest|best|number one|#1|world['’]s)\b/i, label: 'a superlative claim' },
  { re: /\b\d[\d,]*\s+(?:million|billion|thousand|users?|people|customers?)\b/i, label: 'a quantitative claim' },
]

/**
 * @param {string} text
 * @returns {{ hasClaims: boolean, reasons: string[] }}
 */
export function detectClaims(text) {
  if (!text) return { hasClaims: false, reasons: [] }
  const reasons = []
  for (const { re, label } of CLAIM_PATTERNS) {
    if (re.test(text) && !reasons.includes(label)) reasons.push(label)
  }
  return { hasClaims: reasons.length > 0, reasons }
}
