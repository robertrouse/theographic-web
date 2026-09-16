/**
 * Optimal-string-alignment Damerau-Levenshtein distance with a cap: returns
 * a value ≤ `max`, or `max + 1` as soon as the distance is known to exceed
 * it. The band around the diagonal is `max` wide, so a call costs
 * O(len × max) rather than O(len²) — this runs over ~6,500 candidate terms
 * per unresolved query word, so the early exit matters.
 *
 * CP-03 writes its own copy under `entities/`; the two are meant to be
 * deduplicated once both land (the CP-04 file says so).
 */
export function damerauLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Three rolling rows over b, with an infinity outside the band.
  const INF = max + 1;
  const width = lb + 1;
  let prev2 = new Int32Array(width);
  let prev = new Int32Array(width);
  let cur = new Int32Array(width);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    const ca = a.charCodeAt(i - 1);
    cur[0] = i;
    const from = Math.max(1, i - max);
    const to = Math.min(lb, i + max);
    if (from > 1) cur[from - 1] = INF;
    let rowMin = INF;
    for (let j = from; j <= to; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) {
        v = Math.min(v, prev2[j - 2]! + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (to < lb) cur[to + 1] = INF;
    if (rowMin > max) return INF;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  const d = prev[lb]!;
  return d > max ? INF : d;
}
