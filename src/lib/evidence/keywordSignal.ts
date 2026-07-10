const STOPWORDS = new Set([
  "the","a","an","and","or","not","of","in","on","at","to","for","with","by","is",
  "be","are","was","were","as","it","this","that","from","but","if","so","do","does",
  "did","have","has","had","can","could","should","will","would","may","might","must",
  "no","yes","up","down","out","over","into","than","then","because","use","using",
  "via","after","before","still","only","also","more","most","such","very","just",
  "any","all","each","few","many","one","two","three","four","five","six","seven",
  "make","made","need","needs","needed","add","adds","added","update","updates",
  "updated","change","changes","changed","fix","fixes","fixed","feat","feature","chore",
  "refactor","refactored","remove","removed","wip","todo","test","tests",
  "type","types","user","users","page","pages","step","steps","issue","issues",
  "ticket","tickets","field","fields","value","values","click","clicks","button",
  "buttons","error","errors","working","works","work","task","tasks","story","stories",
  "module","modules","view","views","option","options","select","selection","case",
  "cases","property","properties","email","emails","mail","send","sent","data",
]);

const WORD_RE = /[a-z0-9_]+/g;

export function tokenize(text: string | null | undefined, minLen = 3): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(WORD_RE)) {
    const w = match[0];
    if (w.length >= minLen && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Keyword signal: Jaccard × 3, capped at 1.0 (RFC §4.3). */
export function keywordSignalScore(
  ticketText: string,
  commitText: string,
): number {
  const score = jaccard(tokenize(ticketText), tokenize(commitText)) * 3;
  return Math.min(1, score);
}
