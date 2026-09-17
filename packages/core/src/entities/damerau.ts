/**
 * Restricted Damerau-Levenshtein (optimal string alignment) distance, banded
 * to `max` with early exit: returns `max + 1` as soon as no alignment within
 * `max` remains. Insert, delete, substitute and adjacent transposition each
 * cost 1.
 *
 * Only cells within `max` of the diagonal are computed, so a call costs
 * O(min(|a|,|b|) · (2·max + 1)) rather than O(|a|·|b|); with `max` ≤ 2 that is
 * ~5 cells per character, which is what makes brute force over ~10k strings
 * fit in a couple of milliseconds. Three rolling rows (two previous for the
 * transposition) live in module-level buffers, so a call allocates nothing.
 *
 * Early exit is sound with transpositions: row i's minimum is at most one
 * more than row i−1's, and a transposition into row i+1 reads row i−1 + 1, so
 * once a whole row exceeds `max` nothing later can come back under it.
 */
let prev2 = new Int32Array(64);
let prev = new Int32Array(64);
let cur = new Int32Array(64);

function ensure(width: number): void {
  if (prev.length < width) {
    const n = Math.max(width, prev.length * 2);
    prev2 = new Int32Array(n);
    prev = new Int32Array(n);
    cur = new Int32Array(n);
  }
}

export function damerauLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  let la = a.length;
  let lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (la < lb) {
    // Keep `a` the longer string so the band runs along the shorter one.
    const t = a;
    a = b;
    b = t;
    la = a.length;
    lb = b.length;
  }

  const big = max + 1;
  const width = lb + 1;
  ensure(width);
  for (let j = 0; j < width; j++) {
    prev[j] = j;
    prev2[j] = big;
  }

  for (let i = 1; i <= la; i++) {
    const ai = a.charCodeAt(i - 1);
    const lo = i - max > 1 ? i - max : 1;
    const hi = i + max < lb ? i + max : lb;
    cur[0] = i;
    if (lo > 1) cur[lo - 1] = big;
    let rowMin = big;
    for (let j = lo; j <= hi; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = prev[j - 1]! + (ai === bj ? 0 : 1); // substitute / match
      const del = prev[j]! + 1; // drop a char of a
      if (del < v) v = del;
      const ins = cur[j - 1]! + 1; // add a char to a
      if (ins < v) v = ins;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        const tr = prev2[j - 2]! + 1; // swap adjacent
        if (tr < v) v = tr;
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (hi < lb) cur[hi + 1] = big;
    if (rowMin > max) return big;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  const d = prev[lb]!;
  return d > max ? big : d;
}
