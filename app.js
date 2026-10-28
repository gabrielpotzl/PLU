(() => {
  const $ = id => document.getElementById(id);
  const pluEl = $('plu'), nameEl = $('pname'), altsEl = $('alts'), heardEl = $('heard'),
        micBtn = $('mic'), qEl = $('q');

  /* ================= INTELLIGENS KERESÉS (hasonlósági / Levenshtein) ================= */
  // ékezetek le, fonetikai egyszerűsítés (ly→j, ikerbetűk egybe), csak a-z0-9
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const ph = s => norm(s).replace(/ly/g, 'j').replace(/y/g, 'i').replace(/(.)\1+/g, '$1');

  const lev = (a, b) => {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };

  const INDEX = PRODUCTS.map(p => ({
    ...p,
    keys: [p.name, ...(p.aliases || [])].map(ph).filter(Boolean),
    pluN: String(p.plu).replace(/\D/g, ''),
  }));

  // egy begépelt/hallott szó (w) és egy terméknév-szó (k) hasonlósága, 0 = nincs
  function wordScore(w, k) {
    if (w === k) return 100;
    if (w.length >= 3 && k.startsWith(w)) return 92;           // félig beírt szó: "pogac"
    if (w.length >= 3 && w.startsWith(k)) return 90;           // ragozott: "almát"
    const d = lev(w, k), lim = k.length >= 7 ? 2 : k.length >= 4 ? 1 : 0;
    return d <= lim ? 80 - d * 10 : 0;
  }
  // egy kulcs (több szavas név is lehet) pontszáma a lekérdezés szavaira
  function keyScore(words, key) {
    const kw = key.split(' '); let sum = 0, hit = 0;
    for (const k of kw) {
      let best = 0; for (const w of words) best = Math.max(best, wordScore(w, k));
      if (best) { sum += best; hit++; }
    }
    return hit ? (sum / hit) * (0.7 + 0.3 * hit / kw.length) : 0;
  }
  function search(texts) {
    const best = new Map();
    texts.forEach((t, i) => {
      const words = ph(t).split(' ').filter(Boolean); if (!words.length) return;
      const digits = norm(t).replace(/ /g, '');
      for (const p of INDEX) {
        let s = 0;
        if (/^\d+$/.test(digits) && p.pluN === digits) s = 100;  // beírt PLU-kód
        for (const k of p.keys) s = Math.max(s, keyScore(words, k));
        s -= i * 2;                                              // az első hangalternatíva előnyben
        if (s >= 55 && s > (best.get(p) || 0)) best.set(p, s);
      }
    });
    return [...best].sort((a, b) => b[1] - a[1] || a[0].name.length - b[0].name.length).map(x => x[0]).slice(0, 4);
  }

  /* ================= MEGJELENÍTÉS ================= */
  function fit() {
    pluEl.style.fontSize = Math.round(innerHeight * 0.3) + 'px';
    const maxW = innerWidth - 32, w = pluEl.getBoundingClientRect().width;
    if (w > maxW) pluEl.style.fontSize = Math.floor(parseFloat(pluEl.style.fontSize) * maxW / w) + 'px';
  }
  function setPlu(text, cls) { pluEl.textContent = text; pluEl.className = cls || ''; fit(); }
  function setHeard(t) { heardEl.textContent = t || '\u00A0'; }

  function show(p, others, silent) {
    setPlu(p.plu); nameEl.textContent = p.name; altsEl.innerHTML = '';
    (others || []).forEach(o => {
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = o.name; const s = document.createElement('b'); s.textContent = o.plu; b.append(s);
      b.onclick = () => show(o, [p, ...others.filter(x => x !== o)]);
      altsEl.append(b);
    });
    if (!silent) speak(p.plu);
  }
  function miss(text) { setPlu('?', 'miss'); nameEl.textContent = 'Nincs találat'; altsEl.innerHTML = ''; setHeard('„' + text + '”'); }
  function handle(texts) { const r = search(texts); if (r.length) show(r[0], r.slice(1)); else miss(texts[0] || ''); }

  /* ================= BEÁLLÍTÁSOK ================= */
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('plu-' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('plu-' + k, v); } catch (e) {} },
  };
  let soundOn = store.get('sound', '1') !== '0';
  let digitMode = store.get('digits', '0') === '1';
  let voiceName = store.get('voice', 'auto');

  /* ================= FELOLVASÁS: legjobb magyar hang kiválasztása ================= */
  const canSpeak = 'speechSynthesis' in window;
  let voices = [], unlocked = false;

  function rank(v) {
    const n = (v.name + ' ' + (v.voiceURI || '')).toLowerCase(); let s = 0;
    if (/premium|prémium/.test(n)) s += 40;
    if (/enhanced|továbbfejlesztett|natural|neural|online/.test(n)) s += 30;
    if (/siri/.test(n)) s += 25;
    if (/google/.test(n)) s += 15;
    if (/compact|kompakt/.test(n)) s -= 10;
    if (v.default) s += 1;
    return s;
  }
  const huVoices = () => voices.filter(v => /^hu([-_]|$)/i.test(v.lang || '')).sort((a, b) => rank(b) - rank(a));
  function pickVoice() {
    const list = huVoices();
    if (voiceName !== 'auto') { const m = list.find(v => v.name === voiceName); if (m) return m; }
    return list[0] || null;
  }
  function loadVoices() {
    if (!canSpeak) return;
    voices = speechSynthesis.getVoices();
    const sel = $('optVoice'), list = huVoices(); sel.innerHTML = '';
    const auto = pickVoice();
    const o0 = new Option('Automatikus' + (list[0] ? ' (' + list[0].name + ')' : ' (nincs magyar hang)'), 'auto'); sel.add(o0);
    list.forEach(v => sel.add(new Option(v.name, v.name)));
    sel.value = voiceName !== 'auto' && list.some(v => v.name === voiceName) ? voiceName : 'auto';
  }
  if (canSpeak) { loadVoices(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', loadVoices); }

  function unlock() { // iOS: a felolvasást érintésből kell "felébreszteni"
    if (!canSpeak || unlocked) return;
    const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); unlocked = true;
  }
  function speak(text, force) {
    if (!canSpeak || (!soundOn && !force)) return;
    speechSynthesis.cancel();
    const t = String(text), u = new SpeechSynthesisUtterance(digitMode ? t.split('').join(' ') : t);
    u.lang = 'hu-HU'; u.rate = 0.95;
    const v = pickVoice(); if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  /* ================= HANGFELISMERÉS ================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;

  function start() {
    unlock(); keepAwake();
    if (!SR) { setHeard('Ez a böngésző nem támogatja a hangfelismerést – írd be a nevet'); return; }
    rec = new SR(); rec.lang = 'hu-HU'; rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = false;
    rec.onstart = () => { listening = true; micBtn.classList.add('rec'); setHeard('Hallgatlak…'); };
    rec.onresult = e => {
      const r = e.results[e.results.length - 1], alts = [];
      for (let i = 0; i < r.length; i++) alts.push(r[i].transcript);
      setHeard(alts[0]); if (r.isFinal) handle(alts);
    };
    rec.onerror = e => setHeard(
      e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Mikrofon tiltva – engedélyezd a Beállításokban' :
      e.error === 'no-speech' ? 'Nem hallottam semmit' : e.error === 'aborted' ? '' : 'Hiba: ' + e.error);
    rec.onend = () => { listening = false; micBtn.classList.remove('rec'); };
    try { rec.start(); } catch (err) { setHeard('Nem sikerült elindítani'); }
  }
  micBtn.onclick = () => { if (listening && rec) rec.stop(); else start(); };

  /* ================= KÉZI KERESŐMEZŐ ================= */
  qEl.addEventListener('input', () => {
    const t = qEl.value.trim(); if (!t) return;
    const r = search([t]); if (r.length) show(r[0], r.slice(1), true); else miss(t);
  });
  qEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = qEl.value.trim(); if (t) { const r = search([t]); if (r.length) show(r[0], r.slice(1)); }
    qEl.blur();
  });

  /* ================= HAMBURGER MENÜ ================= */
  const menu = $('menu'), panel = $('panel'), menuBtn = $('menuBtn'), back = $('back'), ptitle = $('ptitle');
  const views = { main: $('v-main'), settings: $('v-settings'), list: $('v-list') };
  const titles = { main: 'Menü', settings: 'Beállítások', list: 'Terméklista' };

  function go(v) {
    for (const k in views) views[k].hidden = k !== v;
    ptitle.textContent = titles[v]; back.hidden = v === 'main';
    if (v === 'list') { $('lf').value = ''; renderList(''); }
  }
  function openMenu() {
    go('main'); menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => menu.classList.add('open')); unlock();
  }
  function closeMenu() {
    menu.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { menu.hidden = true; }, 220); menuBtn.focus();
  }
  menuBtn.onclick = openMenu; $('close').onclick = closeMenu; $('scrim').onclick = closeMenu; back.onclick = () => go('main');
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMenu(); });

  // beállítások
  const optSound = $('optSound'), optDigits = $('optDigits'), optVoice = $('optVoice');
  optSound.checked = soundOn; optDigits.checked = digitMode;
  optSound.onchange = () => { soundOn = optSound.checked; store.set('sound', soundOn ? '1' : '0'); if (soundOn) { unlock(); speak('222'); } };
  optDigits.onchange = () => { digitMode = optDigits.checked; store.set('digits', digitMode ? '1' : '0'); };
  optVoice.onchange = () => { voiceName = optVoice.value; store.set('voice', voiceName); };
  $('testVoice').onclick = () => { unlock(); speak('222', true); };

  // terméklista kategóriák szerint
  function renderList(filter) {
    const box = $('plist'), f = ph(filter); box.innerHTML = '';
    const groups = new Map();
    INDEX.forEach(p => {
      if (f && !p.keys.some(k => k.includes(f)) && !p.pluN.includes(f.replace(/ /g, ''))) return;
      const c = p.category || 'Egyéb'; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(p);
    });
    if (!groups.size) { box.innerHTML = '<div class="empty">Nincs találat</div>'; return; }
    const frag = document.createDocumentFragment();
    groups.forEach((items, cat) => {
      const h = document.createElement('h3'); h.textContent = cat; frag.append(h);
      items.sort((a, b) => a.name.localeCompare(b.name, 'hu')).forEach(p => {
        const b = document.createElement('button'); b.type = 'button';
        const n = document.createElement('span'); n.textContent = p.name;
        const c = document.createElement('b'); c.textContent = p.plu;
        b.append(n, c);
        b.onclick = () => { closeMenu(); show(p, [], false); setHeard(''); };
        frag.append(b);
      });
    });
    box.append(frag);
  }
  $('lf').addEventListener('input', e => renderList(e.target.value));

  /* ================= KÉPERNYŐ ÉBREN TARTÁSA ================= */
  let lock = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.onrelease = () => lock = null; } } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !listening) keepAwake(); });

  /* ================= INDULÁS ================= */
  setPlu('—', 'idle'); addEventListener('resize', fit);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
