/* Leitura de nomes (OCR) -> itens/sets. Separado do index.html para poder ser testado. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Matcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ROMAN = { ii: '2', iii: '3', iv: '4' };
  const SIM = new Set(['0o', '1l', '1i', 'il', '5s', '8b', '2z', '9g', '6g', 'rn:m']);
  const simPair = (a, b) => SIM.has(a + b) || SIM.has(b + a);
  const tokens = t => String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(x => ROMAN[x] || x).filter(x => x !== 'chroma');
  const normName = s => tokens(s).join('');
  const lim = n => n <= 3 ? 0.4 : n <= 5 ? 1 : n <= 8 ? 1.5 : 2.2;

  function wdist(a, b, cap) {
    const n = a.length, m = b.length;
    if (Math.abs(n - m) > cap) return cap + 1;
    let prev = Array.from({ length: m + 1 }, (_, j) => j), cur = new Array(m + 1);
    for (let i = 1; i <= n; i++) {
      cur[0] = i; let mn = i;
      for (let j = 1; j <= m; j++) {
        const x = a[i - 1], y = b[j - 1], sub = x === y ? 0 : simPair(x, y) ? 0.35 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
        if (cur[j] < mn) mn = cur[j];
      }
      if (mn > cap) return cap + 1;
      [prev, cur] = [cur, prev];
    }
    return prev[m];
  }

  const buildIndex = list => list.map(c => ({ ...c, n: normName(c.name) })).filter(c => c.n.length >= 3);

  function best(w, index) {
    let b1 = null, d1 = 99, d2 = 99;
    for (const c of index) {
      const cap = lim(c.n.length), d = wdist(w, c.n, cap);
      if (d > cap) continue;
      if (d < d1) { if (b1) d2 = d1; d1 = d; b1 = c; } else if (d < d2) d2 = d;
    }
    return b1 ? { cand: b1, d: d1, amb: d2 - d1 < 0.5 } : null;
  }

  // lines: [{text, bbox:{x0,y0,x1,y1}}]  ->  { hits:[{cand,d,amb,text}], rest:[string] }
  function matchLines(lines, index) {
    const L = lines.map((l, i) => ({ i, toks: tokens(l.text), b: l.bbox })).filter(l => l.toks.length);
    const seqs = L.map(l => l.toks.map((t, k) => ({ t, id: l.i + ':' + k })));
    for (const a of L) for (const b of L) {          // linhas empilhadas (nome quebrado em duas linhas)
      if (a === b || !a.b || !b.b) continue;
      const h = Math.max(1, a.b.y1 - a.b.y0), gap = b.b.y0 - a.b.y1;
      const ov = Math.min(a.b.x1, b.b.x1) - Math.max(a.b.x0, b.b.x0);
      if (gap > -h * 0.3 && gap < h * 1.2 && ov > 0.5 * Math.min(a.b.x1 - a.b.x0, b.b.x1 - b.b.x0))
        seqs.push(a.toks.map((t, k) => ({ t, id: a.i + ':' + k })).concat(b.toks.map((t, k) => ({ t, id: b.i + ':' + k }))));
    }
    const acc = [];
    for (const s of seqs) for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= s.length; i++) {
      const win = s.slice(i, i + n), w = win.map(x => x.t).join('');
      if (w.length < 3) continue;
      const m = best(w, index);
      if (m) acc.push({ ...m, text: w, ids: win.map(x => x.id) });
    }
    acc.sort((x, y) => y.text.length - x.text.length || x.d - y.d);
    const used = new Set(), hits = [];
    for (const a of acc) if (!a.ids.some(id => used.has(id))) { a.ids.forEach(id => used.add(id)); hits.push(a); }
    const rest = [];
    for (const l of L) { let run = []; l.toks.concat([null]).forEach((t, k) => {
      if (t !== null && !used.has(l.i + ':' + k)) run.push(t); else { if (run.length) rest.push(run.join('')); run = []; } }); }
    return { hits, rest };
  }

  function suggest(str, index, n = 5) {
    return index.map(c => ({ c, r: wdist(str, c.n, 99) / Math.max(str.length, c.n.length) })).sort((a, b) => a.r - b.r).slice(0, n);
  }

  function createTally(index) {
    const found = {}, unk = {};
    return {
      add(res) {
        for (const h of res.hits) {
          const k = h.cand.kind + '|' + h.cand.ref, f = found[k] || (found[k] = { ...h.cand, count: 0, minD: 99, amb: 0 });
          f.count++; f.minD = Math.min(f.minD, h.d); if (h.amb) f.amb++;
        }
        for (const r of res.rest) if (r.length >= 4 && r.length <= 24 && /[a-z]{3}/.test(r)) unk[r] = (unk[r] || 0) + 1;
      },
      results() {
        return Object.values(found).map(f => ({ ...f,
          sure: !(f.amb * 2 >= f.count) && ((f.count >= 2 && f.minD <= 0.5) || (f.minD === 0 && f.n.length >= 6)) }))
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      unknown() {
        return Object.entries(unk).filter(([, c]) => c >= 2).map(([s, c]) => ({ text: s, count: c, sug: suggest(s, index) }))
          .filter(u => u.sug[0].r <= 0.5).sort((a, b) => b.count - a.count).slice(0, 12);
      }
    };
  }
  return { tokens, normName, wdist, buildIndex, matchLines, createTally, suggest };
});
