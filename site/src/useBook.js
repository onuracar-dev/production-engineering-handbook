import { useRef, useEffect, useCallback } from 'react';
import { REPO, ROMAN, SPINE, HEIGHTS } from './config.js';
import { esc, md, inline } from './markdown.js';

export function useBook({ books, setCurBook }) {
  const readerRef = useRef(null);
  const wrapRef = useRef(null);
  const spreadRef = useRef(null);
  const pageLRef = useRef(null);
  const pageRRef = useRef(null);

  const curRef = useRef(-1);
  const posRef = useRef(0);
  const busyRef = useRef(false);
  const singleRef = useRef(false);
  const pagesRef = useRef([]);
  const cRef = useRef(0);
  const activeBookRef = useRef(null);
  const bookCacheRef = useRef({});

  const no = (b, i) => `${b.n}.${String(i + 1).padStart(2, '0')}`;
  const tilt = (ci, k) => (((ci * 11 + k * 37) % 7) - 3) * 0.22;
  const caseBase = (b, c) => `${REPO}tree/main/${b.dir}/${c.slug}/`;
  const folio = (idx) => `<span class="folio">${idx + 1}</span>`;

  const titlePage = (b, i) => {
    const totalRoman =
      books && books.length > 0 && ROMAN[books.length - 1] ? ROMAN[books.length - 1] : 'IX';
    return `<div class="pg title">
      <p class="eyebrow">Book ${ROMAN[i]} of ${totalRoman}</p>
      <h1>${esc(b.name)}</h1>
      <p class="blurb">${esc(b.blurb)}</p>
      <div class="orn"></div>
      <p class="count">${b.cases.length} problems</p>
      <p class="howto">Left page: what broke, and what I tried first. Right page: the fix that held, with its source.</p>
    </div>`;
  };

  const tocHead = (first) =>
    first
      ? `<h2 class="toc-head">Contents</h2>`
      : `<h2 class="toc-head cont">Contents, continued</h2>`;

  const tocItem = (b, c, i) =>
    `<button type="button" class="toc" data-case="${i}"><span class="no">${no(b, i)}</span><span class="tx">${esc(c.q)}</span><span class="pn">{{p${i}}}</span></button>`;

  const paginateToc = (b) => {
    const spread = spreadRef.current;
    const R = pageRRef.current;
    if (!spread || !R) return [''];

    const m = document.createElement('div');
    m.className = 'page right measure';
    m.innerHTML = '<div class="pg"></div>';
    m.style.width = R.offsetWidth + 'px';
    m.style.height = R.offsetHeight + 'px';
    spread.appendChild(m);

    const pg = m.firstChild;
    const out = [];
    pg.innerHTML = tocHead(true);

    b.cases.forEach((c, i) => {
      const it = tocItem(b, c, i);
      pg.insertAdjacentHTML('beforeend', it);
      if (pg.scrollHeight > pg.clientHeight + 1 && pg.children.length > 2) {
        pg.lastElementChild.remove();
        out.push(pg.innerHTML);
        pg.innerHTML = tocHead(false) + it;
      }
    });

    out.push(pg.innerHTML);
    m.remove();
    return out;
  };

  const caseLeft = (b, c, i, idx) => {
    const base = caseBase(b, c);
    const drafts = (c.naive || [])
      .map(
        (d, k) =>
          `<li style="--tilt:${tilt(i, k).toFixed(2)}deg"><span class="struck">${inline(d.t, base)}</span>${(d.n || []).map((n) => `<span class="note">${inline(n, base)}</span>`).join('')}</li>`
      )
      .join('');

    return `<div class="pg"><p class="run">${no(b, i)} · The problem</p>
      <h2 class="q">${esc(c.q)}</h2>
      <div class="md">${md(c.problem, base)}</div>
      <h3 class="drafts-h">First tries</h3>
      <ol class="drafts">${drafts}</ol></div>${folio(idx)}`;
  };

  const caseRight = (b, c, i, idx) => {
    const base = caseBase(b, c);
    const blob = base.replace('/tree/', '/blob/');
    // Only cases with a test/ folder get the stamp; "How to Run" / "Derivation" show a plain label
    const label = c.verified
      ? '<span class="stamp">Verified</span>'
      : `<span class="stamp plain">${esc(c.verifyLabel || 'How to Run')}</span>`;
    const verify = c.verify
      ? `<section class="verify">${label}<div class="md">${md(c.verify, base)}</div></section>`
      : '';
    const src = c.src
      ? `<a href="${blob + c.src}" target="_blank" rel="noopener">${esc(c.src)} &nearr;</a>`
      : '';

    return `<div class="pg"><p class="run">${no(b, i)} · What held</p>
      <div class="md">${md(c.arch, base)}</div>${verify}
      <p class="srcs">${src}<a href="${base}" target="_blank" rel="noopener">Full write-up on GitHub &nearr;</a></p></div>${folio(idx)}`;
  };

  const buildPages = (b, curIdx) => {
    const pgs = [titlePage(b, curIdx)];
    const toc = paginateToc(b);
    let C = 1 + toc.length;
    if (!singleRef.current && C % 2) C++;

    toc.forEach((h, k) =>
      pgs.push(
        `<div class="pg">${h.replace(/\{\{p(\d+)\}\}/g, (_, i) => C + 2 * +i + 1)}</div>${folio(1 + k)}`
      )
    );

    if (pgs.length < C) {
      pgs.push(`<div class="pg notes"><p>notes</p></div>${folio(pgs.length)}`);
    }

    b.cases.forEach((c, i) => {
      pgs.push(caseLeft(b, c, i, C + 2 * i));
      pgs.push(caseRight(b, c, i, C + 2 * i + 1));
    });

    pagesRef.current = pgs;
    cRef.current = C;
  };

  const cover = (b, curIdx) => {
    return `<div class="cv"><p class="cv-no">${ROMAN[curIdx]}</p><h2>${esc(b.name)}</h2><span class="cv-rule"></span><p class="cv-ct">${b.cases.length} problems</p><p class="cv-by">Onur Acar · Handbook</p></div>`;
  };

  const maxPos = () =>
    singleRef.current ? pagesRef.current.length - 1 : pagesRef.current.length / 2 - 1;

  const caseAt = () => {
    const p = singleRef.current ? posRef.current : 2 * posRef.current;
    const C = cRef.current;
    return p >= C ? Math.floor((p - C) / 2) : null;
  };

  const posForCase = (i) =>
    singleRef.current ? cRef.current + 2 * i : (cRef.current + 2 * i) / 2;

  const render = () => {
    const L = pageLRef.current;
    const R = pageRRef.current;
    const pages = pagesRef.current;
    const pos = posRef.current;
    if (!L || !R) return;

    if (singleRef.current) {
      R.innerHTML = pages[pos] || '';
      L.innerHTML = '';
    } else {
      L.innerHTML = pages[2 * pos] || '';
      R.innerHTML = pages[2 * pos + 1] || '';
    }
  };

  const leaf = (kind, front, frontSide, back, backSide) => {
    const el = document.createElement('div');
    el.className = 'leaf ' + kind;
    const face = (cls, side, html) =>
      side === 'cover'
        ? `<div class="face ${cls} cover">${html}</div>`
        : `<div class="face ${cls} page ${side}">${html}</div>`;

    el.innerHTML =
      face('f', frontSide, front) + (back != null ? face('b', backSide, back) : '');
    spreadRef.current?.appendChild(el);
    return el;
  };

  const keepScroll = (fromPage, el) => {
    const a = fromPage.querySelector('.pg');
    const b = el.querySelector('.face.f .pg');
    if (a && b) b.scrollTop = a.scrollTop;
  };

  const turn = (el, done) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.classList.add('go');
        const end = (e) => {
          if (e.target !== el) return;
          el.removeEventListener('animationend', end);
          done();
        };
        el.addEventListener('animationend', end);
      })
    );
  };

  const settle = () => {
    const b = activeBookRef.current;
    if (!b) return;
    const ci = caseAt();
    const reader = readerRef.current;
    const spread = spreadRef.current;
    if (!reader || !spread) return;

    const posEl = reader.querySelector('.bar .pos');
    if (posEl) {
      posEl.textContent =
        ci == null ? 'Contents' : `${no(b, ci)} · ${ci + 1} of ${b.cases.length}`;
    }

    const ghEl = reader.querySelector('.bar .gh');
    if (ghEl) {
      ghEl.href = ci == null ? `${REPO}tree/main/${b.dir}` : caseBase(b, b.cases[ci]);
    }

    const atStart = posRef.current === 0;
    const atEnd = posRef.current === maxPos();

    const prevTurn = spread.querySelector('.turn.prev');
    if (prevTurn) prevTurn.hidden = atStart;
    const nextTurn = spread.querySelector('.turn.next');
    if (nextTurn) nextTurn.hidden = atEnd;

    const prevBtn = reader.querySelector('.bar [data-act="prev"]');
    if (prevBtn) prevBtn.disabled = atStart;
    const nextBtn = reader.querySelector('.bar [data-act="next"]');
    if (nextBtn) nextBtn.disabled = atEnd;

    spread.querySelectorAll(':scope > .page .pg').forEach((pg) => {
      pg.classList.toggle('more', pg.scrollHeight > pg.clientHeight + 4);
      pg.classList.remove('end');
    });

    const hash = `#/${b.dir}` + (ci == null ? '' : `/${b.cases[ci].slug}`);
    try {
      history.replaceState(null, '', hash);
    } catch {}
  };

  const go = useCallback((t) => {
    if (
      busyRef.current ||
      curRef.current < 0 ||
      t === posRef.current ||
      t < 0 ||
      t > maxPos()
    )
      return;

    busyRef.current = true;
    const finish = (lf, extra) => () => {
      extra && extra();
      lf.remove();
      posRef.current = t;
      busyRef.current = false;
      settle();
    };

    const isSingle = singleRef.current;
    const pages = pagesRef.current;
    const pos = posRef.current;
    const R = pageRRef.current;
    const L = pageLRef.current;

    if (isSingle) {
      if (t > pos) {
        const lf = leaf('fwd single', pages[pos], 'right', null);
        keepScroll(R, lf);
        R.innerHTML = pages[t];
        turn(lf, finish(lf));
      } else {
        const lf = leaf('in single', pages[t], 'right', null);
        turn(
          lf,
          finish(lf, () => {
            R.innerHTML = pages[t];
          })
        );
      }
      return;
    }

    if (t > pos) {
      const lf = leaf('fwd', pages[2 * pos + 1], 'right', pages[2 * t], 'left');
      keepScroll(R, lf);
      R.innerHTML = pages[2 * t + 1];
      turn(
        lf,
        finish(lf, () => {
          L.innerHTML = pages[2 * t];
        })
      );
    } else {
      const lf = leaf('back', pages[2 * pos], 'left', pages[2 * t + 1], 'right');
      keepScroll(L, lf);
      L.innerHTML = pages[2 * t];
      turn(
        lf,
        finish(lf, () => {
          R.innerHTML = pages[2 * t + 1];
        })
      );
    }
  }, []);

  const openBook = useCallback(
    async (i, at) => {
      if (busyRef.current || curRef.current >= 0) return;
      busyRef.current = true;
      curRef.current = i;
      setCurBook(i);

      const bMeta = books[i];
      if (!bMeta) {
        busyRef.current = false;
        curRef.current = -1;
        setCurBook(-1);
        return;
      }

      // Load full book content if not already cached
      let b = bookCacheRef.current[bMeta.n];
      if (!b || !b.cases?.[0]?.problem) {
        try {
          const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
          const res = await fetch(`${base}/data/book-${bMeta.n}.json`);
          b = await res.json();
          bookCacheRef.current[bMeta.n] = b;
        } catch (err) {
          console.error(`Failed to load book-${bMeta.n}.json:`, err);
          busyRef.current = false;
          curRef.current = -1;
          setCurBook(-1);
          return;
        }
      }
      activeBookRef.current = b;

      const spineEl = document.querySelector(`.book[data-book="${i}"]`);
      spineEl?.classList.add('pulled');

      const reader = readerRef.current;
      const wrap = wrapRef.current;
      const L = pageLRef.current;
      const R = pageRRef.current;

      const phoneBook = window.matchMedia('(max-width: 760px)');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      setTimeout(
        () => {
          reader.hidden = false;
          reader.setAttribute('aria-label', `Book ${ROMAN[i]}: ${b.name}`);
          reader.style.setProperty('--bind', SPINE[i][1]);
          reader.style.setProperty('--bind-ink', SPINE[i][2]);

          const rnEl = reader.querySelector('.bar .rn');
          if (rnEl) rnEl.textContent = ROMAN[i];
          const nmEl = reader.querySelector('.bar .nm');
          if (nmEl) nmEl.textContent = b.name;

          const mainEl = document.getElementById('main');
          if (mainEl) mainEl.inert = true;

          singleRef.current = phoneBook.matches;
          wrap.classList.toggle('single', singleRef.current);
          buildPages(b, i);

          if (at != null) {
            posRef.current = posForCase(at);
            render();
            reader.classList.add('show');
            busyRef.current = false;
            settle();
            reader.querySelector('.bar [data-act="shelf"]')?.focus();
            return;
          }

          posRef.current = 0;
          let lf;
          if (singleRef.current) {
            R.innerHTML = pagesRef.current[0];
            lf = leaf('fwd single', cover(b, i), 'cover', null);
          } else {
            wrap.classList.add('closed');
            L.innerHTML = pagesRef.current[0];
            R.innerHTML = pagesRef.current[1];
            L.style.visibility = 'hidden';
            lf = leaf('fwd', cover(b, i), 'cover', pagesRef.current[0], 'left');
          }

          requestAnimationFrame(() => reader.classList.add('show'));
          reader.querySelector('.bar [data-act="shelf"]')?.focus();

          setTimeout(
            () => {
              wrap.classList.remove('closed');
              turn(lf, () => {
                L.style.visibility = '';
                lf.remove();
                busyRef.current = false;
                settle();
              });
            },
            reduced ? 0 : 520
          );
        },
        at != null || reduced ? 0 : 220
      );
    },
    [books, setCurBook]
  );

  const closeBook = useCallback(
    (onClosed) => {
      if (busyRef.current || curRef.current < 0) return;
      busyRef.current = true;
      const closingIdx = curRef.current;
      const b = activeBookRef.current;
      const reader = readerRef.current;
      const wrap = wrapRef.current;
      const L = pageLRef.current;
      const R = pageRRef.current;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const isSingle = singleRef.current;
      const pages = pagesRef.current;
      const pos = posRef.current;

      let lf;
      if (isSingle) {
        lf = leaf('in single', cover(b, closingIdx), 'cover', null);
      } else {
        lf = leaf('back', pages[2 * pos], 'left', cover(b, closingIdx), 'cover');
        L.style.visibility = 'hidden';
        wrap.classList.add('closed');
      }

      turn(lf, () => {
        reader.classList.remove('show');
        setTimeout(
          () => {
            reader.hidden = true;
            lf.remove();
            L.innerHTML = R.innerHTML = '';
            L.style.visibility = '';
            wrap.classList.remove('closed');

            const mainEl = document.getElementById('main');
            if (mainEl) mainEl.inert = false;

            const spineEl = document.querySelector(`.book[data-book="${closingIdx}"]`);
            spineEl?.classList.remove('pulled');
            if (!onClosed) {
              spineEl?.focus({ preventScroll: true });
            }

            curRef.current = -1;
            activeBookRef.current = null;
            setCurBook(-1);
            busyRef.current = false;

            if (!onClosed) {
              try {
                history.replaceState(null, '', location.pathname + location.search);
              } catch {}
            }

            if (typeof onClosed === 'function') {
              onClosed();
            }
          },
          reduced ? 0 : 340
        );
      });
    },
    [setCurBook]
  );

  const prefetchBook = useCallback(
    (i) => {
      const bMeta = books[i];
      if (!bMeta) return;
      if (bookCacheRef.current[bMeta.n]) return;
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      fetch(`${base}/data/book-${bMeta.n}.json`)
        .then((res) => res.json())
        .then((data) => {
          bookCacheRef.current[bMeta.n] = data;
        })
        .catch(() => {});
    },
    [books]
  );

  // Keyboard navigation & Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (curRef.current < 0) return;
      if (e.key === 'ArrowRight') go(posRef.current + 1);
      else if (e.key === 'ArrowLeft') go(posRef.current - 1);
      else if (e.key === 'Escape') closeBook();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [go, closeBook]);

  // Reader event delegation (clicks for [data-act] and .toc, touch for swipe, scroll)
  useEffect(() => {
    const reader = readerRef.current;
    const spread = spreadRef.current;
    if (!reader || !spread) return;

    const act = {
      shelf: closeBook,
      toc: () => go(singleRef.current ? 1 : 0),
      prev: () => go(posRef.current - 1),
      next: () => go(posRef.current + 1),
    };

    const handleClick = (e) => {
      const a = e.target.closest('[data-act]');
      if (a && act[a.dataset.act]) {
        act[a.dataset.act]();
        return;
      }
      const t = e.target.closest('.toc');
      if (t) {
        go(posForCase(+t.dataset.case));
      }
    };

    const handleScroll = (e) => {
      const pg = e.target;
      if (pg.classList?.contains('pg')) {
        pg.classList.toggle(
          'end',
          pg.scrollTop + pg.clientHeight >= pg.scrollHeight - 6
        );
      }
    };

    let touch = null;
    const handleTouchStart = (e) => {
      touch = [e.touches[0].clientX, e.touches[0].clientY];
    };
    const handleTouchEnd = (e) => {
      if (!touch) return;
      const dx = e.changedTouches[0].clientX - touch[0];
      const dy = e.changedTouches[0].clientY - touch[1];
      touch = null;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50) {
        dx < 0 ? act.next() : act.prev();
      }
    };

    reader.addEventListener('click', handleClick);
    spread.addEventListener('scroll', handleScroll, true);
    spread.addEventListener('touchstart', handleTouchStart, { passive: true });
    spread.addEventListener('touchend', handleTouchEnd);

    return () => {
      reader.removeEventListener('click', handleClick);
      spread.removeEventListener('scroll', handleScroll, true);
      spread.removeEventListener('touchstart', handleTouchStart);
      spread.removeEventListener('touchend', handleTouchEnd);
    };
  }, [go, closeBook]);

  // Window resize debounced handler
  useEffect(() => {
    let rz;
    const handleResize = () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        if (curRef.current < 0 || busyRef.current) return;
        const b = activeBookRef.current;
        if (!b) return;

        const ci = caseAt();
        const phoneBook = window.matchMedia('(max-width: 760px)');
        singleRef.current = phoneBook.matches;
        wrapRef.current?.classList.toggle('single', singleRef.current);

        buildPages(b, curRef.current);
        posRef.current = ci == null ? 0 : posForCase(ci);
        render();
        settle();
      }, 180);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(rz);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Hash routing boot handling & hashchange
  useEffect(() => {
    if (!books || books.length === 0) return;

    const handleHash = () => {
      const m = location.hash.match(/^#\/([^/]+)(?:\/([^/]+))?/);
      if (!m) {
        if (curRef.current >= 0) closeBook();
        return;
      }
      const bi = books.findIndex((b) => b.dir === m[1]);
      if (bi < 0) return;
      const ci = m[2] ? books[bi].cases.findIndex((c) => c.slug === m[2]) : -1;

      if (curRef.current === bi) {
        if (ci >= 0) {
          go(posForCase(ci));
        } else {
          go(singleRef.current ? 1 : 0);
        }
      } else {
        if (curRef.current >= 0) {
          closeBook(() => openBook(bi, ci >= 0 ? ci : undefined));
        } else {
          openBook(bi, ci >= 0 ? ci : undefined);
        }
      }
    };

    const fonts = document.fonts
      ? Promise.all([
          document.fonts.load('16px "Newsreader"'),
          document.fonts.load('600 16px "Caveat"'),
          document.fonts.load('12px "JetBrains Mono"'),
        ]).catch(() => {})
      : Promise.resolve();

    fonts.then(handleHash);

    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [books, openBook, closeBook, go]);

  return {
    readerRef,
    wrapRef,
    spreadRef,
    pageLRef,
    pageRRef,
    curBook: curRef.current,
    openBook,
    closeBook,
    go,
    prefetchBook,
  };
}
