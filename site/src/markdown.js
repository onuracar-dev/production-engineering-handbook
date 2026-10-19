import { REPO } from './config.js';

let BASE = REPO;

export function setBase(base) {
  BASE = base || REPO;
}

export function getBase() {
  return BASE;
}

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function latex(s) {
  return s.replace(/\$\$?([^$]+)\$\$?/g, (_, m) =>
    m
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 / $2')
      .replace(/\\approx/g, '≈')
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\left|\\right/g, '')
      .replace(/\\%/g, '%')
      .replace(/\\[,; ]/g, ' ')
      .replace(/_\{([^}]*)\}/g, ' $1')
      .replace(/[{}]/g, '')
  );
}

export function href(h, base = BASE) {
  if (/^https?:/.test(h)) return h;
  if (h.startsWith('./')) return (base || '').replace('/tree/', '/blob/') + h.slice(2);
  return h;
}

export function inline(s, base = BASE) {
  const codes = [];
  // CommonMark code spans: an opening run of N backticks closes at the next run of exactly N,
  // and one space on both ends is stripped, so `` ` `` renders a lone backtick.
  s = s.replace(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks, c) => {
    if (c.length > 2 && c.startsWith(' ') && c.endsWith(' ') && c.trim()) c = c.slice(1, -1);
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(latex(s));
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, t, h) => `<a href="${href(h, base)}" target="_blank" rel="noopener">${t}</a>`
  );
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*(?![\s*])(.+?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])_(?!\s)(.+?)_(?=[\s).,:;]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codes[n])}</code>`);
}

export function dedent(lines) {
  const ind = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length),
    99
  );
  return lines.map((l) => l.slice(ind));
}

export function md(src, base = BASE) {
  const lines = src.replace(/\r/g, '').split('\n');
  let out = '',
    para = [],
    top = null,
    li = false,
    sub = false;

  const flush = () => {
    if (para.length) {
      out += `<p>${inline(para.join(' '), base)}</p>`;
      para = [];
    }
  };
  const closeSub = () => {
    if (sub) {
      out += '</ul>';
      sub = false;
    }
  };
  const closeAll = () => {
    closeSub();
    if (li) {
      out += '</li>';
      li = false;
    }
    if (top) {
      out += `</${top}>`;
      top = null;
    }
  };
  // Drop a stray trailing "*" (an unclosed emphasis), but not the closing "**" of a bold label.
  const clean = (t) => t.replace(/(?<!\*)\*$/, '').trim();

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fence = l.match(/^\s*```(\w*)/);
    if (fence) {
      flush();
      const buf = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) buf.push(lines[i]);
      if (!li) closeAll();
      out += `<pre class="code"><code>${esc(dedent(buf).join('\n'))}</code></pre>`;
      continue;
    }
    if (!l.trim()) {
      flush();
      continue;
    }
    let m;
    if ((m = l.match(/^(\d+)\.\s+(.*)$/)) || (m = l.match(/^([*-])\s+(.*)$/))) {
      flush();
      closeSub();
      const type = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (li) {
        out += '</li>';
        li = false;
      }
      if (top !== type) {
        if (top) out += `</${top}>`;
        out += `<${type}>`;
        top = type;
      }
      out += `<li>${inline(clean(m[2]), base)}`;
      li = true;
      continue;
    }
    if ((m = l.match(/^\s{2,}(?:[*-]|\d+\.)\s+(.*)$/))) {
      flush();
      if (!li) {
        if (top !== 'ul') {
          closeAll();
          out += '<ul>';
          top = 'ul';
        }
        out += `<li>${inline(clean(m[1]), base)}</li>`;
        continue;
      }
      if (!sub) {
        out += '<ul>';
        sub = true;
      }
      out += `<li>${inline(clean(m[1]), base)}</li>`;
      continue;
    }
    if (li && /^\s{2,}\S/.test(l)) {
      out += ' ' + inline(l.trim(), base);
      continue;
    }
    flush();
    closeAll();
    if ((m = l.match(/^#{3,6}\s+(.*)$/))) {
      out += `<h4>${inline(m[1].replace(/:$/, ''), base)}</h4>`;
      continue;
    }
    if ((m = l.match(/^>\s?(.*)$/))) {
      out += `<blockquote>${inline(m[1], base)}</blockquote>`;
      continue;
    }
    if (/^\$\$/.test(l.trim())) {
      out += `<p class="math">${esc(latex(l.trim()))}</p>`;
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(lines[i]);
      i--;
      const cells = (r) =>
        r
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
      out +=
        '<table>' +
        rows
          .filter((r) => !/^\|[\s|:-]+\|$/.test(r))
          .map(
            (r, k) =>
              `<tr>${cells(r)
                .map((c) => (k ? `<td>${inline(c, base)}</td>` : `<th>${inline(c, base)}</th>`))
                .join('')}</tr>`
          )
          .join('') +
        '</table>';
      continue;
    }
    para.push(l.trim());
  }
  flush();
  closeAll();
  return out;
}
