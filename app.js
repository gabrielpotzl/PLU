(() => {
  const $ = id => document.getElementById(id);
  const pluEl = $('plu'), nameEl = $('pname'), altsEl = $('alts'),
        heardEl = $('heard'), micBtn = $('mic'), sndBtn = $('snd'), qEl = $('q');

  /* ---------- keresés ---------- */
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

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

  const INDEX = PRODUCTS.map(p => ({ ...p, keys: [p.name, ...(p.aliases || [])].map(norm).filter(Boolean) }));

  // egy szó illeszkedése egy kulcsszóra (0 = nincs)
  function wordScore(w, k) {
    if (w === k) return 100;
    if (w.length >= 3 && w.startsWith(k)) return 90;          // "almát" → "alma"
    if (k.length >= 4 && w.length >= 4 && k.startsWith(w)) return 70;
    const d = lev(w, k), lim = k.length >= 7 ? 2 : k.length >= 4 ? 1 : 0;
    return d <= lim ? 75 - d * 10 : 0;
  }
  function keyScore(words, key) {
    const kw = key.split(' '); let sum = 0;
    for (const k of kw) {
      let best = 0; for (const w of words) best = Math.max(best, wordScore(w, k));
      if (!best) return 0; sum += best;
    }
    return sum / kw.length;
  }
  function search(texts) {
    const best = new Map();
    texts.forEach((t, i) => {
      const words = norm(t).split(' ').filter(Boolean); if (!words.length) return;
      for (const p of INDEX) {
        let s = 0; for (const k of p.keys) s = Math.max(s, keyScore(words, k));
        s -= i * 2;                                            // az első alternatíva előnyben
        if (s >= 55 && s > (best.get(p) || 0)) best.set(p, s);
      }
    });
    return [...best].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 4);
  }

  /* ---------- megjelenítés ---------- */
  function fit() {
    pluEl.style.fontSize = Math.round(innerHeight * 0.3) + 'px';
    const maxW = innerWidth - 32, w = pluEl.getBoundingClientRect().width;
    if (w > maxW) pluEl.style.fontSize = Math.floor(parseFloat(pluEl.style.fontSize) * maxW / w) + 'px';
  }
  function setPlu(text, cls) { pluEl.textContent = text; pluEl.className = cls || ''; fit(); }

  function show(p, others) {
    setPlu(p.plu); nameEl.textContent = p.name; altsEl.innerHTML = '';
    (others || []).forEach(o => {
      const b = document.createElement('button'); b.type = 'button';
      b.textContent = o.name; const s = document.createElement('b'); s.textContent = o.plu; b.append(s);
      b.onclick = () => show(o, [p, ...others.filter(x => x !== o)]);
      altsEl.append(b);
    });
    speak(p.plu);
  }
  function miss(text) { setPlu('?', 'miss'); nameEl.textContent = 'Nincs találat'; altsEl.innerHTML = ''; setHeard('„' + text + '”'); }
  function setHeard(t) { heardEl.textContent = t || '\u00A0'; }

  function handle(texts) {
    const r = search(texts);
    if (r.length) show(r[0], r.slice(1)); else miss(texts[0] || '');
  }

  /* ---------- felolvasás ---------- */
  let soundOn = true, unlocked = false;
  try { soundOn = localStorage.getItem('plu-sound') !== '0'; } catch (e) {}
  const canSpeak = 'speechSynthesis' in window;
  const paintSnd = () => { sndBtn.classList.toggle('off', !soundOn || !canSpeak); sndBtn.textContent = soundOn ? '🔊' : '🔇'; };
  sndBtn.onclick = () => { soundOn = !soundOn; try { localStorage.setItem('plu-sound', soundOn ? '1' : '0'); } catch (e) {} paintSnd(); unlock(); };
  paintSnd();
  function unlock() { // iOS: felolvasást felhasználói érintésből kell "felébreszteni"
    if (!canSpeak || unlocked) return;
    const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); unlocked = true;
  }
  function speak(text) {
    if (!soundOn || !canSpeak) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text)); u.lang = 'hu-HU';
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('hu'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  /* ---------- hangfelismerés ---------- */
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
      e.error === 'no-speech' ? 'Nem hallottam semmit' :
      e.error === 'aborted' ? '' : 'Hiba: ' + e.error);
    rec.onend = () => { listening = false; micBtn.classList.remove('rec'); };
    try { rec.start(); } catch (err) { setHeard('Nem sikerült elindítani'); }
  }
  micBtn.onclick = () => { if (listening && rec) rec.stop(); else start(); };

  /* ---------- kézi beírás (tartalék) ---------- */
  qEl.addEventListener('input', () => {
    const t = qEl.value.trim(); if (!t) return;
    const r = search([t]); if (r.length) show(r[0], r.slice(1)); else miss(t);
  });
  qEl.addEventListener('keydown', e => { if (e.key === 'Enter') qEl.blur(); });

  /* ---------- képernyő ébren tartása ---------- */
  let lock = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.onrelease = () => lock = null; } } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !listening) keepAwake(); });

  /* ---------- indulás ---------- */
  setPlu('—', 'idle'); addEventListener('resize', fit);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
