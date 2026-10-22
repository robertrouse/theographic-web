/**
 * TIPNR — STEPBible's "Translators Individualised Proper Names with all
 * References" (CC BY 4.0). One record per individual person or place, with
 * every name form it goes by (ESV, KJV, NIV spellings) and every verse it is
 * mentioned in. That exhaustive reference list is what makes it the best
 * matching evidence of all the sources.
 *
 * Layout (tab-separated): a `$====== PERSON(s)` / `PLACE` / ... section line,
 * a header line `Name@FirstRef...=Strong<TAB>Description...`, sub-lines
 * starting `– ` (one of them `– Total<TAB>All names<TAB>...<TAB>All refs`),
 * then `@Brief=` / `@Short=` / `@Article=` lines.
 */

import { swordToText } from './sword.js';

export type TipnrKind = 'person' | 'place' | 'other';

export interface TipnrRecord {
  /** Unique id, e.g. "Abiel@1Sa.9.1-1Ch". */
  id: string;
  kind: TipnrKind;
  /** Every name form ("Abiel", "Jeiel", "Jehiel", "Ner", …). */
  names: string[];
  /** The `– Total` reference list, possibly abbreviated ("1Sa.9.1; 14.51"). */
  refs: string;
  /** `@Short`, else `@Brief`, else the header description. */
  text: string;
}

function sectionKind(line: string): TipnrKind | 'skip' {
  if (/EXCLUDED/.test(line)) return 'skip';
  if (/PLACE\+PERSON|PERSON/.test(line)) return 'person';
  if (/PLACE/.test(line)) return 'place';
  return 'other';
}

export function parseTipnr(text: string): TipnrRecord[] {
  const out: TipnrRecord[] = [];
  let kind: TipnrKind | 'skip' = 'skip';
  let cur: (TipnrRecord & { brief?: string; desc?: string }) | undefined;
  const flush = (): void => {
    if (cur && cur.names.length && cur.refs) {
      const t = swordToText(cur.text || cur.brief || cur.desc || '');
      out.push({ id: cur.id, kind: cur.kind, names: cur.names, refs: cur.refs, text: t });
    }
    cur = undefined;
  };
  for (const raw of text.split(/\r?\n/)) {
    const cells = raw.split('\t');
    const first = cells[0] ?? '';
    if (first.startsWith('$')) {
      flush();
      kind = sectionKind(first);
    } else if (/^[^\s–@#=][^@]*@[^=\s]*=/.test(first) && kind !== 'skip') {
      flush();
      cur = {
        id: first.split('=')[0]!,
        kind,
        names: [],
        refs: '',
        text: '',
        desc: (cells[1] ?? '').trim(),
      };
    } else if (!cur) {
      continue;
    } else if (first === '– Total') {
      cur.names = (cells[1] ?? '')
        .split(/\s+or\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      cur.refs = (cells[4] ?? '').trim();
    } else if (first.startsWith('@Short=')) {
      cur.text = first.slice('@Short='.length).trim();
    } else if (first.startsWith('@Brief=')) {
      cur.brief = first.slice('@Brief='.length).trim();
    }
  }
  flush();
  return out;
}
