/* MY BASE 공통 동작 */
(function () {
  var SITE = window.SITE || {};
  ['files', 'decks', 'events', 'periods', 'links'].forEach(function (k) { if (!SITE[k]) SITE[k] = []; });
  if (!SITE.timetable) SITE.timetable = {};
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var page = document.body.getAttribute('data-page');
  var root = document.documentElement;
  var now = new Date();
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var KIND = { exam: '시험', task: '과제', event: '일정' };

  /* ---------- 작은 도구 ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function svgIcon(paths, extra) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) { var p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    if (extra) extra(svg, ns);
    return svg;
  }
  function eyeIcon() {
    return svgIcon(['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'], function (svg, ns) {
      var c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3'); svg.appendChild(c);
    });
  }
  function shareIcon() { return svgIcon(['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M12 3v12', 'M7 8l5-5 5 5']); }
  function pubBadge() { var b = el('span', 'pub'); b.appendChild(eyeIcon()); b.appendChild(document.createTextNode('공개')); return b; }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayLabel(d) { return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()] + '요일'; }
  var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  function daysLeft(d) { return Math.round((d - today0) / 86400000); }
  function mins(s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; }
  function fmtSize(b) {
    if (b < 1024) return b + 'B';
    if (b < 1048576) return Math.round(b / 1024) + 'KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + 'MB';
    return (b / 1073741824).toFixed(1) + 'GB';
  }

  /* ---------- 알림 ---------- */
  var toastEl = document.getElementById('toast'), toastTimer = null;
  function toast(msg, ms, action) {
    if (!toastEl) return;
    toastEl.textContent = '';
    toastEl.appendChild(el('span', '', msg));
    if (action) {
      var b = el('button', '', action.label); b.type = 'button';
      b.addEventListener('click', function () { toastEl.classList.remove('show'); action.run(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || (action ? 5000 : 2400));
  }

  /* ---------- 저장: 이 기기 + (연결했으면) 구글 드라이브 ----------
     build.mjs 가 window.DRIVE = { url, key } 를 넣어 줘요. 없으면 이 기기에만 저장해요. */
  var STORE_KEY = 'mybase-data';
  var store = {};
  try { store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { store = {}; }
  var DRIVE = window.DRIVE && window.DRIVE.url ? window.DRIVE : null;
  var driveOn = !!(DRIVE && DRIVE.key);
  function drive(action, payload) {
    if (!DRIVE) return Promise.reject(new Error('드라이브가 연결되지 않았어요'));
    var body = Object.assign({ action: action, key: DRIVE.key || '' }, payload || {});
    return fetch(DRIVE.url, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || '드라이브에서 답이 없어요'); return j; });
  }
  /* 드라이브로 보낼 일을 잠깐 모았다가 한 번에 보내요. 화면을 닫을 때는 바로 보내요. */
  var pending = {}, pendTimer = null;
  function queue(id, action, payloadFn) {
    if (!driveOn) return;
    pending[id] = { action: action, fn: payloadFn };
    clearTimeout(pendTimer); pendTimer = setTimeout(function () { flush(false); }, 1200);
  }
  function flush(useBeacon) {
    clearTimeout(pendTimer); pendTimer = null;
    var jobs = pending; pending = {};
    Object.keys(jobs).forEach(function (id) {
      var payload = jobs[id].fn(), action = jobs[id].action;
      if (useBeacon && navigator.sendBeacon) {
        try { if (navigator.sendBeacon(DRIVE.url, JSON.stringify(Object.assign({ action: action, key: DRIVE.key }, payload)))) return; } catch (e) {}
      }
      drive(action, payload).catch(function () {});
    });
  }
  var reloaders = [];
  function onStoreReload(fn) { reloaders.push(fn); }
  function writeLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }
  function saveStore() {
    store._t = Date.now();
    if (!writeLocal()) toast('이 기기에 저장하지 못했어요');
    queue('store', 'save', function () { return { data: store }; });
  }
  function storeHasData(x) {
    return ['events', 'todos', 'memos', 'links'].some(function (k) { return Array.isArray(x[k]) && x[k].length; }) || !!(x.marks && Object.keys(x.marks).length);
  }
  /* 다른 기기에서 더 나중에 바꾼 내용이 있으면 그걸로 바꿔요. */
  function pullStore() {
    if (!driveOn || page !== 'app') return;
    drive('load').then(function (j) {
      var remote = j.data && typeof j.data === 'object' ? j.data : null;
      var lt = store._t || 0, rt = (remote && remote._t) || 0;
      if (remote && rt > lt) {
        store = remote; writeLocal();
        reloaders.forEach(function (fn) { try { fn(); } catch (e) {} });
      } else if (lt > rt || (!remote && storeHasData(store))) {
        drive('save', { data: store }).catch(function () {});
      }
    }).catch(function () {});
  }
  function xIcon() { return svgIcon(['M6 6l12 12', 'M18 6L6 18']); }
  function delBtn(label, onClick) {
    var b = el('button', 'del-btn'); b.type = 'button'; b.setAttribute('aria-label', label);
    b.appendChild(xIcon());
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  }

  /* ---------- 밤 모드 ---------- */
  function syncModeButtons() {
    var night = root.getAttribute('data-mode') === 'night';
    document.querySelectorAll('[data-mode-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', night ? 'true' : 'false');
      var l = b.querySelector('.lbl'); if (l) l.textContent = night ? '낮 모드' : '밤 모드';
      b.setAttribute('aria-label', night ? '낮 모드로 바꾸기' : '밤 모드로 바꾸기');
    });
  }
  document.querySelectorAll('[data-mode-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var night = root.getAttribute('data-mode') !== 'night';
      if (night) root.setAttribute('data-mode', 'night'); else root.removeAttribute('data-mode');
      try { localStorage.setItem('mybase-mode', night ? 'night' : 'day'); } catch (e) {}
      syncModeButtons();
    });
  });
  syncModeButtons();

  /* ---------- 날짜와 인사 ---------- */
  document.querySelectorAll('[data-today]').forEach(function (n) { n.textContent = dayLabel(now); });
  document.querySelectorAll('[data-greet]').forEach(function (n) {
    var h = now.getHours();
    n.textContent = h < 5 ? '아직 깨어 있네요' : h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
  });

  /* ---------- 숫자 올라가는 효과 ---------- */
  function countUp(scope) {
    if (still) return;
    (scope || document).querySelectorAll('[data-count]').forEach(function (n) {
      var target = parseInt(n.getAttribute('data-count'), 10);
      var start = null, dur = 1100, delay = 650;
      n.textContent = '0';
      function step(t) {
        if (start === null) start = t + delay;
        var p = Math.min(Math.max((t - start) / dur, 0), 1);
        n.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* =========================================================
     파일·발표 목록
     ========================================================= */
  var withShare = page === 'app';
  var driveFiles = [], driveDecks = [], driveInbox = [];
  function allFiles() { return driveInbox.concat(driveFiles, SITE.files); }
  function allDecks() { return driveDecks.concat(SITE.decks); }
  function whenText(ms) {
    var d = new Date(ms), k = ymd(d), tk = ymd(new Date());
    if (k === tk) return '오늘';
    if (k === addDays(tk, -1)) return '어제';
    return (d.getMonth() + 1) + '.' + d.getDate();
  }
  function fromDrive(it) {
    var ext = extOf(it.name), base = ext ? it.name.slice(0, -(ext.length + 1)) : it.name;
    if (it.kind === 'decks') return { id: 'g_' + it.id, driveId: it.id, drive: true, title: base, date: whenText(it.updated), slides: 0, public: !!it.public, url: '#' };
    var f = { id: 'g_' + it.id, driveId: it.id, drive: true, name: base, type: (ext || 'FILE').toUpperCase().slice(0, 4), group: GROUP[ext] || 'doc', size: it.size ? fmtSize(it.size) : '', when: whenText(it.updated), public: !!it.public, url: it.url };
    if (it.kind === 'inbox') { f.inbox = true; f.from = it.from || ''; f.note = it.note || ''; }
    return f;
  }
  function openDriveDeck(d) {
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) {}
    if (w) {
      try {
        w.document.write('<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-content:center;background:#0B1512;color:#C9D7CD;font:16px sans-serif">여는 중…</body>');
        w.document.title = d.title;
      } catch (e) {}
    }
    drive(page === 'share' ? 'getPublic' : 'get', { id: d.driveId }).then(function (j) {
      if (w && !w.closed) { w.document.open(); w.document.write(j.text); w.document.close(); }
      else location.href = URL.createObjectURL(new Blob([j.text], { type: 'text/html' }));
    }).catch(function (e) {
      if (w) { try { w.close(); } catch (x) {} }
      toast('발표를 열지 못했어요: ' + e.message);
    });
  }
  function fileItem(f) {
    var li = el('li', 'in' + (f.fresh ? ' fresh' : ''));
    li.id = f.id;
    li.setAttribute('data-g', f.group);
    if (f.public) li.setAttribute('data-pub', '1');
    var row = el('div', 'frow');
    row.appendChild(el('span', 'ftype' + (f.group === 'media' ? ' media' : f.group === 'pack' ? ' pack' : ''), f.type));
    var a = el('a', 'fmain'); a.href = f.url || '#';
    if (f.url && (f.drive || f.url.indexOf('blob:') === 0)) { a.target = '_blank'; a.rel = 'noopener'; }
    var nm = el('span', 'fname', f.name);
    if (f.fresh) nm.appendChild(el('span', 'newtag', '방금'));
    if (f.inbox) nm.appendChild(el('span', 'newtag', '받음'));
    if (f.public) nm.appendChild(pubBadge());
    a.appendChild(nm); a.appendChild(el('span', 'fmeta', (f.inbox && f.from ? f.from + ', ' : '') + f.when));
    if (f.inbox && f.note && page !== 'share') a.appendChild(el('span', 'fnote', f.note));
    row.appendChild(a);
    var side = el('div', 'fside');
    side.appendChild(el('span', 'fsize', f.size));
    if (withShare) {
      var b = el('button', 'share-btn'); b.type = 'button';
      b.appendChild(shareIcon());
      b.setAttribute('aria-label', f.name + ' 공유');
      b.addEventListener('click', function () { openShare('file', f.id, b); });
      side.appendChild(b);
    }
    row.appendChild(side);
    li.appendChild(row);
    return li;
  }
  function deckCard(d) {
    var box = el('div', 'deck'); box.id = d.id;
    var a = el('a', 'deck-link'); a.href = d.url || '#';
    if (d.drive) a.addEventListener('click', function (e) { e.preventDefault(); openDriveDeck(d); });
    var th = el('span', 'thumb'); th.appendChild(el('i')); th.appendChild(el('i'));
    var tt = el('span', 'deck-title', d.title);
    if (d.fresh) tt.appendChild(el('span', 'newtag', '방금'));
    a.appendChild(th); a.appendChild(tt);
    box.appendChild(a);
    var foot = el('div', 'deck-foot');
    var meta = el('span', 'deck-meta', d.date + (d.slides ? ' · ' + d.slides + '장' : ''));
    foot.appendChild(meta);
    if (d.public) foot.appendChild(pubBadge());
    if (withShare) {
      var b = el('button', 'share-btn'); b.type = 'button';
      b.appendChild(shareIcon());
      b.setAttribute('aria-label', d.title + ' 공유');
      b.addEventListener('click', function () { openShare('deck', d.id, b); });
      foot.appendChild(b);
    }
    box.appendChild(foot);
    return box;
  }
  function renderFiles() {
    ['file-list', 'share-files'].forEach(function (id) {
      var box = document.getElementById(id); if (!box) return;
      var onlyPublic = id === 'share-files';
      box.textContent = '';
      allFiles().filter(function (f) { return !onlyPublic || f.public; }).forEach(function (f, i) {
        var li = fileItem(f); li.style.animationDelay = (i * 0.04) + 's'; box.appendChild(li);
      });
    });
    if (typeof applyFiles === 'function') applyFiles();
  }
  function renderDecks() {
    ['deck-list', 'share-decks'].forEach(function (id) {
      var box = document.getElementById(id); if (!box) return;
      var onlyPublic = id === 'share-decks';
      box.textContent = '';
      allDecks().filter(function (d) { return !onlyPublic || d.public; }).forEach(function (d) { box.appendChild(deckCard(d)); });
      if (!onlyPublic) {
        var n = el('button', 'deck new-deck'); n.type = 'button';
        n.appendChild(svgIcon(['M12 5v14', 'M5 12h14']));
        n.appendChild(el('b', '', '발표 올리기'));
        n.addEventListener('click', function () { openUpload('deck', n); });
        box.appendChild(n);
      }
    });
  }
  function updateCounts() {
    var map = {
      files: allFiles().length, decks: allDecks().length,
      'pub-files': allFiles().filter(function (f) { return f.public; }).length,
      'pub-decks': allDecks().filter(function (d) { return d.public; }).length
    };
    Object.keys(map).forEach(function (k) {
      document.querySelectorAll('[data-n="' + k + '"]').forEach(function (n) { n.textContent = map[k]; });
    });
  }

  /* 자료실: 이름 찾기 + 종류 고르기 */
  var applyFiles = null;
  var fileList = document.getElementById('file-list');
  if (fileList) {
    var search = document.getElementById('file-search');
    var empty = document.getElementById('file-empty');
    var kind = 'all';
    applyFiles = function () {
      var q = (search.value || '').trim().toLowerCase();
      var shown = 0;
      fileList.querySelectorAll('li').forEach(function (li) {
        var okKind = kind === 'all' || (kind === 'pub' ? li.hasAttribute('data-pub') : li.getAttribute('data-g') === kind);
        var okText = !q || li.textContent.toLowerCase().indexOf(q) !== -1;
        li.hidden = !(okKind && okText);
        if (!li.hidden) shown += 1;
      });
      empty.hidden = shown !== 0;
      if (shown === 0) empty.textContent = q ? '"' + search.value.trim() + '" 이름의 파일이 없어요.' : '파일이 없어요.';
    };
    search.addEventListener('input', applyFiles);
    document.querySelectorAll('[data-file-filter] button').forEach(function (b, _, all) {
      b.addEventListener('click', function () {
        kind = b.getAttribute('data-f');
        all.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        applyFiles();
      });
    });
  }
  renderFiles(); renderDecks(); updateCounts();

  /* 공개 자료실: 링크의 #이름 자료 찾아가기 */
  function flashTarget() {
    if (page !== 'share' || !location.hash) return;
    var target = document.getElementById(location.hash.slice(1));
    if (target && !target.classList.contains('flash')) {
      target.classList.add('flash');
      setTimeout(function () { target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' }); }, 300);
    }
  }
  flashTarget();

  /* 드라이브에 있는 파일·발표 불러오기 (공개 자료실은 공개한 것만) */
  function gb(b) { var v = b / 1073741824; return v >= 1 ? (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + 'GB' : Math.max(1, Math.round(b / 1048576)) + 'MB'; }
  function renderQuota(q) {
    var box = document.getElementById('drive-quota'); if (!box) return;
    if (!q || !(q.used >= 0)) { box.hidden = true; return; }
    box.hidden = false;
    var fill = document.getElementById('q-fill'), tx = document.getElementById('q-text');
    if (q.limit > 0) {
      var left = Math.max(0, q.limit - q.used), pct = Math.min(100, q.used / q.limit * 100);
      fill.style.width = pct.toFixed(1) + '%';
      box.classList.toggle('low', pct >= 90);
      tx.textContent = '드라이브 ' + gb(left) + ' 남음 (' + gb(q.limit) + ' 중 ' + gb(q.used) + ' 사용)';
      box.querySelector('.q-bar').hidden = false;
    } else {
      box.querySelector('.q-bar').hidden = true;
      tx.textContent = '드라이브 ' + gb(q.used) + ' 사용 중 (용량 제한 없음)';
    }
  }
  function loadDriveList() {
    if (!DRIVE || (page === 'app' && !driveOn)) return;
    drive(page === 'app' ? 'list' : 'listPublic').then(function (j) {
      driveFiles = []; driveDecks = []; driveInbox = [];
      (j.items || []).forEach(function (it) { (it.kind === 'decks' ? driveDecks : it.kind === 'inbox' ? driveInbox : driveFiles).push(fromDrive(it)); });
      renderFiles(); renderDecks(); updateCounts(); flashTarget();
      if (typeof renderGlance === 'function') renderGlance();
      renderQuota(j.quota);
    }).catch(function (e) { if (page === 'app') toast('드라이브 목록을 불러오지 못했어요: ' + e.message, 4000); });
  }
  loadDriveList();

  /* =========================================================
     창 열고 닫기 (올리기·공유)
     ========================================================= */
  var lastOpener = null;
  function openModal(m, opener) {
    lastOpener = opener || null;
    m.hidden = false;
    var f = m.querySelector('[data-autofocus]') || m.querySelector('button, input, a');
    if (f) setTimeout(function () { f.focus(); }, 50);
  }
  function closeModal(m) {
    m.hidden = true;
    if (lastOpener) { try { lastOpener.focus(); } catch (e) {} }
  }
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(m); });
    m.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeModal(m); }); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal').forEach(function (m) { if (!m.hidden) closeModal(m); });
  });

  /* ---------- 올리기 ---------- */
  var upModal = document.getElementById('upload-modal');
  var upMode = 'file', picked = [];
  var GROUP = {
    pdf: 'doc', hwp: 'doc', hwpx: 'doc', doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', xls: 'doc', xlsx: 'doc', txt: 'doc', md: 'doc', html: 'doc',
    png: 'media', jpg: 'media', jpeg: 'media', gif: 'media', webp: 'media', heic: 'media', mp4: 'media', mov: 'media', mp3: 'media', wav: 'media', m4a: 'media',
    zip: 'pack', '7z': 'pack', rar: 'pack'
  };
  function extOf(name) { var i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; }
  function openUpload(mode, opener) {
    if (!upModal) return;
    upMode = mode; picked = [];
    var input = document.getElementById('up-input');
    input.value = '';
    input.accept = mode === 'deck' ? '.html,.htm' : '';
    document.getElementById('up-title').textContent = mode === 'deck' ? '발표 올리기' : '파일 올리기';
    document.getElementById('up-public').checked = false;
    renderPicked();
    openModal(upModal, opener);
  }
  function renderPicked() {
    var list = document.getElementById('up-list');
    var go = document.getElementById('up-go');
    list.textContent = '';
    picked.forEach(function (f, i) {
      var li = el('li');
      var ext = extOf(f.name);
      li.appendChild(el('span', 'ftype' + (GROUP[ext] === 'media' ? ' media' : GROUP[ext] === 'pack' ? ' pack' : ''), (ext || 'FILE').toUpperCase().slice(0, 4)));
      var mid = el('span');
      mid.appendChild(el('span', 'nm', f.name)); mid.appendChild(document.createElement('br'));
      mid.appendChild(el('span', 'sz', fmtSize(f.size)));
      li.appendChild(mid);
      var rm = el('button', 'rm', '빼기'); rm.type = 'button'; rm.setAttribute('aria-label', f.name + ' 빼기');
      rm.addEventListener('click', function () { picked.splice(i, 1); renderPicked(); });
      li.appendChild(rm);
      var pr = el('div', 'prog'); pr.appendChild(el('i')); li.appendChild(pr);
      list.appendChild(li);
    });
    go.disabled = picked.length === 0;
    go.textContent = picked.length ? picked.length + '개 올리기' : '올리기';
  }
  if (upModal) {
    var drop = document.getElementById('up-drop');
    var input = document.getElementById('up-input');
    function addFiles(fl) {
      Array.prototype.forEach.call(fl, function (f) {
        if (upMode === 'deck' && !/\.html?$/i.test(f.name)) { toast('발표는 HTML 파일만 올릴 수 있어요'); return; }
        picked.push(f);
      });
      renderPicked();
    }
    input.addEventListener('change', function () { addFiles(input.files); });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    document.getElementById('up-go').addEventListener('click', function () {
      var go = this;
      if (!picked.length) return;
      go.disabled = true; go.textContent = '올리는 중…';
      var bars = upModal.querySelectorAll('.prog i');
      var done = 0, isPublic = document.getElementById('up-public').checked;
      if (driveOn) { uploadToDrive(picked.slice(), isPublic); return; }
      picked.forEach(function (f, i) {
        var p = 0, bar = bars[i];
        var tick = setInterval(function () {
          p = Math.min(100, p + 8 + Math.random() * 18);
          if (bar) bar.style.width = p + '%';
          if (p >= 100) {
            clearInterval(tick); done += 1;
            if (done === picked.length) finishUpload(isPublic);
          }
        }, still ? 10 : 120);
      });
    });
  }
  var MAX_UP = 30 * 1024 * 1024;
  function readB64(f) {
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onload = function () { var t = String(fr.result || ''); ok(t.slice(t.indexOf(',') + 1)); };
      fr.onerror = function () { no(fr.error || new Error('파일을 읽지 못했어요')); };
      fr.readAsDataURL(f);
    });
  }
  function uploadToDrive(files, isPublic) {
    var bars = upModal.querySelectorAll('.prog'), kind = upMode === 'deck' ? 'decks' : 'files';
    var okN = 0, failN = 0, bigN = 0, chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        var bar = bars[i];
        if (f.size > MAX_UP) { bigN += 1; if (bar) bar.classList.add('bad'); return; }
        if (bar) bar.classList.add('busy');
        return readB64(f).then(function (data) {
          return drive('upload', { kind: kind, name: f.name, mime: f.type || (kind === 'decks' ? 'text/html' : 'application/octet-stream'), data: data, public: isPublic });
        }).then(function (j) {
          var it = fromDrive(j.item); it.fresh = true;
          (kind === 'decks' ? driveDecks : driveFiles).unshift(it); okN += 1;
          if (bar) { bar.classList.remove('busy'); bar.classList.add('ok'); }
        }).catch(function () { failN += 1; if (bar) { bar.classList.remove('busy'); bar.classList.add('bad'); } });
      });
    });
    chain.then(function () {
      if (kind === 'decks') renderDecks(); else renderFiles();
      updateCounts();
      closeModal(upModal);
      var msg = okN ? (kind === 'decks' ? '발표 ' : '파일 ') + okN + '개를 드라이브에 올렸어요' : '올리지 못했어요';
      if (failN) msg += ' · 못 올린 파일 ' + failN + '개';
      if (bigN) msg += ' · 30MB가 넘는 ' + bigN + '개는 드라이브 앱으로 MY BASE 폴더에 넣어 주세요';
      toast(msg, bigN || failN ? 6000 : 2400);
    });
  }
  var seqId = 100;
  function finishUpload(isPublic) {
    var n = picked.length;
    picked.forEach(function (f) {
      seqId += 1;
      var ext = extOf(f.name), url = '#';
      try { url = URL.createObjectURL(f); } catch (e) {}
      if (upMode === 'deck') {
        SITE.decks.unshift({ id: 'd' + seqId, title: f.name.replace(/\.html?$/i, ''), date: (now.getMonth() + 1) + '.' + now.getDate(), slides: 0, public: isPublic, url: url, fresh: true });
      } else {
        SITE.files.unshift({ id: 'f' + seqId, name: f.name.replace(/\.[^.]+$/, ''), type: (ext || 'FILE').toUpperCase().slice(0, 4), group: GROUP[ext] || 'doc', size: fmtSize(f.size), when: '방금 올림', public: isPublic, url: url, fresh: true });
      }
    });
    setTimeout(function () {
      closeModal(upModal);
      if (upMode === 'deck') renderDecks(); else renderFiles();
      updateCounts();
      toast((upMode === 'deck' ? '발표 ' : '파일 ') + n + '개를 올렸어요 · 드라이브를 연결하지 않아서 새로 고침하면 사라져요', 4500);
    }, still ? 0 : 350);
  }
  document.querySelectorAll('[data-upload]').forEach(function (b) {
    b.addEventListener('click', function () { openUpload(b.getAttribute('data-upload'), b); });
  });

  /* ---------- 공유 ---------- */
  var shModal = document.getElementById('share-modal');
  var shItem = null;
  function shareUrl(id) {
    var base = location.href.split('#')[0].replace(/[^\/]*$/, '');
    return base + 'share.html#' + id;
  }
  function syncShare() {
    var pub = !!shItem.public;
    var st = document.getElementById('sh-state');
    var link = document.getElementById('sh-link');
    var copy = document.getElementById('sh-copy');
    var sw = document.getElementById('sh-public');
    sw.checked = pub; sw.disabled = !shItem.drive;
    var del = document.getElementById('sh-delete'); if (del) del.hidden = !shItem.drive;
    var inbox = !!shItem.inbox;
    link.parentNode.hidden = inbox && !pub;
    document.getElementById('sh-keep').hidden = !inbox;
    document.getElementById('sh-done').hidden = inbox;
    document.getElementById('sh-title').textContent = inbox ? '받은 파일' : '공유하기';
    st.className = 'sh-state ' + (pub ? 'public' : 'private');
    st.textContent = (inbox ? '보낸 사람: ' + (shItem.from || '이름 없음') + (shItem.note ? '\n남긴 말: ' + shItem.note : '') + '\n' : '') + (pub ? '공개 자료실에 보여요. 링크가 있으면 누구나 로그인 없이 볼 수 있어요.' : '나만 볼 수 있어요.');
    link.value = pub ? shareUrl(shItem.id) : '공개로 바꾸면 링크가 생겨요';
    link.disabled = !pub; copy.disabled = !pub;
  }
  function openShare(type, id, opener) {
    if (!shModal) return;
    var arr = type === 'deck' ? allDecks() : allFiles();
    shItem = arr.filter(function (x) { return x.id === id; })[0];
    if (!shItem) return;
    shItem._type = type;
    document.getElementById('sh-name').textContent = shItem.title || shItem.name;
    syncShare();
    openModal(shModal, opener);
  }
  if (shModal) {
    document.getElementById('sh-public').addEventListener('change', function () {
      var sw = this, want = sw.checked, item = shItem;
      if (!item.drive) { sw.checked = !!item.public; return; }
      sw.disabled = true;
      drive('share', { id: item.driveId, public: want }).then(function () {
        item.public = want;
        if (shItem === item) syncShare();
        if (item._type === 'deck') renderDecks(); else renderFiles();
        updateCounts();
        toast(want ? '공개로 바꿨어요' : '나만 보기로 바꿨어요');
      }).catch(function (e) {
        sw.checked = !!item.public; sw.disabled = false;
        toast('바꾸지 못했어요: ' + e.message, 4000);
      });
    });
    var shKeep = document.getElementById('sh-keep');
    if (shKeep) shKeep.addEventListener('click', function () {
      var item = shItem; if (!item || !item.inbox) return;
      shKeep.disabled = true;
      drive('keep', { id: item.driveId }).then(function () {
        shKeep.disabled = false;
        driveInbox = driveInbox.filter(function (x) { return x !== item; });
        item.inbox = false; item.fresh = true; driveFiles.unshift(item);
        closeModal(shModal); renderFiles(); updateCounts(); renderGlance();
        toast('자료실로 옮겼어요');
      }).catch(function (e) { shKeep.disabled = false; toast('옮기지 못했어요: ' + e.message, 4000); });
    });

    /* 파일 받기 링크: 이 링크를 받은 사람은 로그인 없이 파일을 보낼 수 있어요 */
    var ibModal = document.getElementById('inbox-modal'), ibOpen = document.getElementById('inbox-open');
    function inboxUrl(t) { return location.href.split('#')[0].replace(/[^\/]*$/, '') + 'send.html#t=' + t; }
    var ibSwitch = document.getElementById('ib-public');
    function ibSync(on) {
      ibSwitch.checked = on; ibSwitch.disabled = false;
      var st = document.getElementById('ib-state');
      st.className = 'sh-state ' + (on ? 'public' : 'private');
      st.textContent = on ? '받은 파일이 공개 자료실에 올라가서 로그인 없이 누구나 볼 수 있어요.' : '받은 파일은 나만 볼 수 있어요.';
    }
    if (ibOpen && ibModal && driveOn) {
      ibOpen.hidden = false;
      ibSwitch.addEventListener('change', function () {
        var want = ibSwitch.checked; ibSwitch.disabled = true;
        drive('inboxSetPublic', { public: want }).then(function (j) {
          ibSync(j.public !== false); loadDriveList();
          toast(want ? '받은 파일을 공개로 바꿨어요' : '받은 파일을 나만 보기로 바꿨어요');
        }).catch(function (e) { ibSync(!want); toast('바꾸지 못했어요: ' + e.message, 4000); });
      });
      ibOpen.addEventListener('click', function () {
        var link = document.getElementById('ib-link');
        link.value = '불러오는 중…';
        openModal(ibModal, ibOpen);
        ibSwitch.disabled = true;
        drive('inboxInfo').then(function (j) { link.value = inboxUrl(j.token); ibSync(j.public !== false); })
          .catch(function (e) { link.value = ''; toast('링크를 불러오지 못했어요: ' + e.message, 4000); });
      });
      document.getElementById('ib-copy').addEventListener('click', function () {
        var link = document.getElementById('ib-link');
        if (!/^https?:/.test(link.value)) return;
        var fail = function () { link.focus(); link.select(); toast('링크를 선택해 뒀어요. 길게 눌러 복사하세요'); };
        try { navigator.clipboard.writeText(link.value).then(function () { toast('파일 받기 링크를 복사했어요'); }, fail); } catch (e) { fail(); }
      });
      document.getElementById('ib-reset').addEventListener('click', function () {
        closeModal(ibModal);
        askChoice('링크 바꾸기', '지금 링크는 더 이상 쓸 수 없게 되고 새 링크가 생겨요.', [{ label: '새 링크 만들기', sub: '이미 링크를 받은 사람은 새 링크를 다시 받아야 해요', run: function () {
          drive('inboxReset').then(function (j) {
            document.getElementById('ib-link').value = inboxUrl(j.token); ibSync(j.public !== false);
            openModal(ibModal, ibOpen); toast('새 링크를 만들었어요');
          }).catch(function (e) { toast('바꾸지 못했어요: ' + e.message, 4000); });
        } }]);
      });
    }

    var shDel = document.getElementById('sh-delete');
    if (shDel) shDel.addEventListener('click', function () {
      var item = shItem; if (!item || !item.drive) return;
      closeModal(shModal);
      askChoice('지우기', '"' + (item.title || item.name) + '" 을 지울까요?', [{ label: '지우기', sub: '드라이브 휴지통으로 옮겨요', danger: true, run: function () {
        drive('remove', { id: item.driveId }).then(function () {
          driveFiles = driveFiles.filter(function (x) { return x !== item; });
          driveDecks = driveDecks.filter(function (x) { return x !== item; });
          driveInbox = driveInbox.filter(function (x) { return x !== item; });
          renderGlance();
          renderFiles(); renderDecks(); updateCounts(); toast('지웠어요');
        }).catch(function (e) { toast('지우지 못했어요: ' + e.message, 4000); });
      } }]);
    });
    document.getElementById('sh-copy').addEventListener('click', function () {
      var link = document.getElementById('sh-link');
      var done = function () { toast('링크를 복사했어요'); };
      var fail = function () { link.focus(); link.select(); toast('링크를 선택해 뒀어요. 길게 눌러 복사하세요'); };
      try { navigator.clipboard.writeText(link.value).then(done, fail); } catch (e) { fail(); }
    });
  }

  /* =========================================================
     캘린더 (반복 일정 포함)
     ========================================================= */
  var COLORS = ['blue', 'teal', 'amber', 'red', 'violet', 'pink'];
  var COLOR_NAME = { blue: '파랑', teal: '초록', amber: '주황', red: '빨강', violet: '보라', pink: '분홍' };
  function normEvents(list) {
    return (list || []).map(function (e) {
      var r = e.repeat || { freq: 'none' };
      return {
        id: e.id, title: e.title, date: e.date, allDay: e.allDay !== false && !e.start, start: e.start || '', end: e.end || '',
        location: e.location || '', color: COLORS.indexOf(e.color) !== -1 ? e.color : 'blue', dday: !!e.dday, memo: e.memo || '',
        repeat: { freq: r.freq || 'none', interval: r.interval || 1, byDay: (r.byDay || []).slice(), until: r.until || '' },
        skip: (e.skip || []).slice(), alarm: e.alarm === undefined || e.alarm === null ? '' : String(e.alarm)
      };
    });
  }
  function maxSeq(list) { return list.reduce(function (m, e) { var n = parseInt(String(e.id).replace(/\D/g, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 1000); }
  var events = normEvents(Array.isArray(store.events) ? store.events : SITE.events);
  var evSeq = maxSeq(events);
  function saveEvents() { store.events = events; saveStore(); if (typeof refreshPlan === 'function') refreshPlan(); }
  onStoreReload(function () { events = normEvents(Array.isArray(store.events) ? store.events : SITE.events); evSeq = maxSeq(events); if (calGrid) refreshCalendar(); else renderGlance(); refreshPlan(); });
  function startOfWeek(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); }
  function addDays(key, n) { var d = parseYmd(key); d.setDate(d.getDate() + n); return ymd(d); }
  function occursOn(ev, key) {
    if (key < ev.date) return false;
    if (ev.skip.indexOf(key) !== -1) return false;
    var r = ev.repeat;
    if (r.freq === 'none') return key === ev.date;
    if (r.until && key > r.until) return false;
    var d = parseYmd(key), s = parseYmd(ev.date), iv = Math.max(1, r.interval || 1);
    if (r.freq === 'daily') return Math.round((d - s) / 86400000) % iv === 0;
    if (r.freq === 'weekly') {
      var days = r.byDay.length ? r.byDay : [s.getDay()];
      if (days.indexOf(d.getDay()) === -1) return false;
      return Math.round((startOfWeek(d) - startOfWeek(s)) / (7 * 86400000)) % iv === 0;
    }
    if (r.freq === 'monthly') {
      if (d.getDate() !== s.getDate()) return false;
      return ((d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth()) % iv === 0;
    }
    if (r.freq === 'yearly') {
      if (d.getDate() !== s.getDate() || d.getMonth() !== s.getMonth()) return false;
      return (d.getFullYear() - s.getFullYear()) % iv === 0;
    }
    return false;
  }
  function eventsOn(key) {
    return events.filter(function (e) { return occursOn(e, key); }).sort(function (a, b) {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.start || '').localeCompare(b.start || '');
    });
  }
  function nextOccurrence(ev, fromKey) {
    var k = fromKey < ev.date ? ev.date : fromKey;
    for (var n = 0; n < 800; n++) { if (occursOn(ev, k)) return k; k = addDays(k, 1); if (ev.repeat.freq === 'none' && k > ev.date) return null; }
    return null;
  }
  function timeText(ev) { return ev.allDay ? '종일' : ev.start + (ev.end ? '–' + ev.end : ''); }
  var ALARM_TIMED = [['', '알림 없음'], ['0', '정시에'], ['5', '5분 전'], ['10', '10분 전'], ['30', '30분 전'], ['60', '1시간 전'], ['1440', '하루 전']];
  var ALARM_ALLDAY = [['', '알림 없음'], ['d8', '당일 오전 8시'], ['p20', '전날 오후 8시']];
  function alarmLabel(code, allDay) {
    var list = allDay ? ALARM_ALLDAY : ALARM_TIMED;
    for (var i = 0; i < list.length; i++) if (list[i][0] === code) return list[i][1];
    return '';
  }
  function alarmAt(ev, key) {
    if (!ev.alarm) return null;
    var d = parseYmd(key);
    if (ev.allDay) {
      if (ev.alarm === 'd8') { d.setHours(8, 0, 0, 0); return d; }
      if (ev.alarm === 'p20') { d.setDate(d.getDate() - 1); d.setHours(20, 0, 0, 0); return d; }
      return null;
    }
    if (!ev.start) return null;
    var p = ev.start.split(':'); d.setHours(+p[0], +p[1], 0, 0);
    return new Date(d.getTime() - (parseInt(ev.alarm, 10) || 0) * 60000);
  }
  function bellIcon() { return svgIcon(['M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6', 'M10 19a2 2 0 0 0 4 0']); }
  function shortDate(key) { var d = parseYmd(key); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function repeatText(r, startKey) {
    if (!r || r.freq === 'none') return '반복 안 함';
    var iv = Math.max(1, r.interval || 1), s = parseYmd(startKey), t = '';
    if (r.freq === 'daily') t = iv === 1 ? '매일' : iv + '일마다';
    if (r.freq === 'weekly') {
      var days = (r.byDay.length ? r.byDay : [s.getDay()]).slice().sort();
      t = (iv === 1 ? '매주 ' : iv + '주마다 ') + days.map(function (x) { return DAYS[x]; }).join('·') + '요일';
    }
    if (r.freq === 'monthly') t = (iv === 1 ? '매달 ' : iv + '개월마다 ') + s.getDate() + '일';
    if (r.freq === 'yearly') t = (iv === 1 ? '매년 ' : iv + '년마다 ') + (s.getMonth() + 1) + '월 ' + s.getDate() + '일';
    if (r.until) t += ' · ' + shortDate(r.until) + '까지';
    return t;
  }
  function pinIcon() { return svgIcon(['M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z'], function (svg, ns) { var c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '9.5'); c.setAttribute('r', '2.5'); svg.appendChild(c); }); }
  function clockIcon() { return svgIcon(['M12 7v5l3 2'], function (svg, ns) { var c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '9'); svg.appendChild(c); }); }
  function repeatIcon() { return svgIcon(['M17 2l3 3-3 3', 'M4 11V9a4 4 0 0 1 4-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 0 1-4 4H4']); }
  function calIcon() { return svgIcon(['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4']); }

  /* 시간표: 나이스에서 받은 날짜별 시간표(window.TT_LIVE)가 있으면 그날 것을, 없으면 data.js 의 기본 시간표를 써요.
     나이스의 평소 시간표(usual)와 그날 과목이 다르면 '바뀜'으로 보여 줘요. 평소대로면 사진 시간표의 과목 이름을 써요. */
  var TT_LIVE = window.TT_LIVE && window.TT_LIVE.days ? window.TT_LIVE : null;
  function lessonsFor(key) {
    var wd = parseYmd(key).getDay(), base = SITE.timetable[wd] || [];
    var live = TT_LIVE && TT_LIVE.days[key], usual = TT_LIVE && TT_LIVE.usual && TT_LIVE.usual[wd];
    if (!live || !live.length) return wd < 1 || wd > 5 ? [] : base.map(function (sj) { return { s: sj, ch: false, o: '' }; });
    var out = [];
    live.forEach(function (cur, i) {
      if (!usual) out.push({ s: cur, ch: false, o: '' });
      else if (cur === (usual[i] || '')) out.push({ s: base[i] || cur, ch: false, o: '' });
      else out.push({ s: cur || '수업 없음', ch: true, o: base[i] || usual[i] || '' });
    });
    if (usual) for (var j = live.length; j < usual.length; j++) if (usual[j]) out.push({ s: '수업 없음', ch: true, o: base[j] || usual[j] });
    return out;
  }
  function periodState(key, isToday) {
    var subjects = lessonsFor(key);
    var cur = now.getHours() * 60 + now.getMinutes(), nextMarked = false;
    return subjects.map(function (sj, i) {
      var pr = SITE.periods[i] || ['', ''], st = 'later';
      if (isToday && pr[0]) {
        if (cur >= mins(pr[1])) st = 'past';
        else if (cur >= mins(pr[0])) { st = 'now'; nextMarked = true; }
        else if (!nextMarked) { st = 'next'; nextMarked = true; }
      }
      return { no: i + 1, subject: sj.s, ch: sj.ch, o: sj.o, from: pr[0], to: pr[1], state: st };
    });
  }
  function renderPeriods(box, key, isToday) {
    box.textContent = '';
    var list = periodState(key, isToday);
    list.forEach(function (p, i) {
      var li = el('li', 'per' + (p.state === 'later' ? '' : ' ' + p.state) + (p.ch ? ' chg' : ''));
      li.appendChild(el('span', 'no', String(p.no)));
      var s = el('span', 'sj', p.subject);
      if (p.ch) { s.appendChild(el('span', 'tag chg', '바뀜')); if (p.o) s.appendChild(el('small', 'was', '원래 ' + p.o)); }
      if (p.state === 'now') s.appendChild(el('span', 'tag', '지금'));
      if (p.state === 'next') s.appendChild(el('span', 'tag', '다음'));
      li.appendChild(s);
      li.appendChild(el('span', 'tm', p.from + '–' + p.to));
      box.appendChild(li);
      if (i === 3 && list.length > 4) box.appendChild(el('li', 'lunch', '점심시간 ' + p.to + '–' + ((SITE.periods[4] || [''])[0])));
    });
  }

  var calGrid = document.getElementById('cal-grid');
  var viewY = now.getFullYear(), viewM = now.getMonth(), selKey = ymd(now);
  var editState = null;
  function renderMonth(animate) {
    if (!calGrid) return;
    document.getElementById('cal-title').textContent = viewY + '년 ' + (viewM + 1) + '월';
    var ctb = document.getElementById('cal-today'); if (ctb) ctb.hidden = viewY === now.getFullYear() && viewM === now.getMonth() && selKey === ymd(now);
    calGrid.textContent = '';
    calGrid.classList.toggle('anim', !!animate && !still);
    DAYS.forEach(function (d, i) { calGrid.appendChild(el('div', 'cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), d)); });
    var first = new Date(viewY, viewM, 1);
    var start = new Date(viewY, viewM, 1 - first.getDay());
    var todayKey = ymd(now);
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i >= 35 && d.getMonth() !== viewM) break;
      var key = ymd(d), evs = eventsOn(key);
      var b = el('button', 'cal-day' + (d.getMonth() !== viewM ? ' out' : '') + (key === todayKey ? ' today' : '') + (d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : ''));
      b.type = 'button';
      b.setAttribute('data-key', key);
      b.setAttribute('aria-pressed', key === selKey ? 'true' : 'false');
      b.style.animationDelay = (i * 0.008) + 's';
      b.appendChild(el('span', 'dn', String(d.getDate())));
      b.appendChild(el('span', 'sr-only', (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()] + '요일' + (evs.length ? ', 일정 ' + evs.length + '개' : '')));
      var wrap = el('span', 'evs');
      wrap.setAttribute('aria-hidden', 'true');
      evs.forEach(function (e) { wrap.appendChild(el('span', 'cal-ev cl cl-' + e.color, e.title)); });
      b.appendChild(wrap);
      b.addEventListener('click', function () {
        selKey = this.getAttribute('data-key');
        var sd = parseYmd(selKey);
        if (sd.getMonth() !== viewM) { viewY = sd.getFullYear(); viewM = sd.getMonth(); renderMonth(true); }
        else calGrid.querySelectorAll('.cal-day').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-key') === selKey ? 'true' : 'false'); });
        renderDay();
      });
      calGrid.appendChild(b);
    }
  }
  function renderDay() {
    var dh = document.getElementById('day-h'); if (!dh) return;
    var d = parseYmd(selKey), isToday = selKey === ymd(now);
    dh.textContent = (isToday ? '오늘, ' : '') + dayLabel(d);
    var ctb2 = document.getElementById('cal-today'); if (ctb2) ctb2.hidden = isToday && viewY === now.getFullYear() && viewM === now.getMonth();
    var evBox = document.getElementById('day-evs');
    evBox.textContent = '';
    var evs = eventsOn(selKey);
    document.getElementById('day-none').hidden = evs.length !== 0;
    evs.forEach(function (e) {
      var li = el('li');
      var b = el('button', 'ev-btn cl-' + e.color); b.type = 'button';
      b.setAttribute('aria-label', e.title + ' 고치기');
      var mid = el('span');
      mid.appendChild(el('span', 'ev-t', e.title));
      var meta = el('span', 'ev-m');
      var t = el('span'); t.appendChild(clockIcon()); t.appendChild(document.createTextNode(timeText(e))); meta.appendChild(t);
      if (e.location) { var l = el('span'); l.appendChild(pinIcon()); l.appendChild(document.createTextNode(e.location)); meta.appendChild(l); }
      if (e.repeat.freq !== 'none') { var r = el('span'); r.appendChild(repeatIcon()); r.appendChild(document.createTextNode(repeatText(e.repeat, e.date))); meta.appendChild(r); }
      if (e.alarm) { var al = el('span'); al.appendChild(bellIcon()); al.appendChild(document.createTextNode(alarmLabel(e.alarm, e.allDay))); meta.appendChild(al); }
      mid.appendChild(meta);
      b.appendChild(mid);
      var right = '';
      if (e.dday) { var left = daysLeft(parseYmd(selKey)); if (left >= 0) right = left === 0 ? 'D-DAY' : 'D-' + left; }
      b.appendChild(el('span', 'ev-r', right));
      b.addEventListener('click', function () { editState = { mode: 'edit', id: e.id, occKey: selKey }; location.hash = 'event-edit'; });
      li.appendChild(b);
      evBox.appendChild(li);
    });
    var wd = d.getDay(), perBox = document.getElementById('day-periods'), noClass = document.getElementById('day-noclass');
    var ttBox = document.getElementById('day-tt'), ttSum = document.getElementById('day-tt-sum');
    var les = lessonsFor(selKey), nch = les.filter(function (x) { return x.ch; }).length;
    if (les.length) {
      noClass.hidden = true; perBox.hidden = false; renderPeriods(perBox, selKey, isToday);
      if (ttBox) ttBox.hidden = false;
      if (ttSum) ttSum.textContent = '수업 ' + les.length + '교시' + (nch ? ', 바뀐 수업 ' + nch + '개' : '');
      if (ttBox && nch) ttBox.open = true;
    } else { perBox.hidden = true; noClass.hidden = false; if (ttBox) ttBox.hidden = true; }
  }
  function renderDdays() {
    var box = document.getElementById('ddays'); if (!box) return;
    var tk = ymd(now);
    var items = events.filter(function (e) { return e.dday; }).map(function (e) {
      var k = nextOccurrence(e, tk); return k ? { title: e.title, key: k, left: daysLeft(parseYmd(k)), color: e.color } : null;
    }).filter(Boolean).sort(function (a, b) { return a.left - b.left; });
    box.textContent = '';
    if (!items.length) box.appendChild(el('li', 'empty', '다가오는 D-day가 없어요.'));
    items.forEach(function (d) {
      var li = el('li', 'dd' + (d.left <= 7 ? ' soon' : ''));
      li.appendChild(el('span', 'n', d.left === 0 ? 'D-DAY' : 'D-' + d.left));
      var tx = el('span');
      tx.appendChild(el('span', 't', d.title)); tx.appendChild(document.createElement('br'));
      tx.appendChild(el('span', 'd', dayLabel(parseYmd(d.key))));
      li.appendChild(tx);
      box.appendChild(li);
    });
  }
  function renderWeekTable() {
    var wk = document.getElementById('tt-week'); if (!wk) return;
    var cap = wk.querySelector('caption'); wk.textContent = ''; if (cap) wk.appendChild(cap);
    // 이번 주 월~금 (토·일에는 다음 주)
    var base = new Date(now.getFullYear(), now.getMonth(), now.getDate()), wd0 = base.getDay();
    var mon = addDays(ymd(base), wd0 === 0 ? 1 : wd0 === 6 ? 2 : 1 - wd0);
    var keys = [0, 1, 2, 3, 4].map(function (i) { return addDays(mon, i); });
    var cols = keys.map(lessonsFor), maxP = 0;
    cols.forEach(function (c) { maxP = Math.max(maxP, c.length); });
    var thead = el('thead'), hr = el('tr'); hr.appendChild(el('th', '', '교시'));
    keys.forEach(function (k, i) { var d = parseYmd(k), th = el('th', k === ymd(now) ? 'today-col' : ''); th.appendChild(document.createTextNode(DAYS[i + 1])); th.appendChild(el('small', '', (d.getMonth() + 1) + '/' + d.getDate())); hr.appendChild(th); });
    thead.appendChild(hr);
    var tb = el('tbody');
    for (var p = 0; p < maxP; p++) {
      var r = el('tr'); r.appendChild(el('th', '', String(p + 1)));
      keys.forEach(function (k, i) {
        var x = cols[i][p], td = el('td', (k === ymd(now) ? 'today-col' : '') + (x && x.ch ? ' chg' : ''), x ? x.s : '');
        if (x && x.ch && x.o) td.title = '원래 ' + x.o;
        r.appendChild(td);
      });
      tb.appendChild(r);
    }
    wk.appendChild(thead); wk.appendChild(tb);
    var note = document.getElementById('tt-src');
    if (note) note.textContent = TT_LIVE ? '나이스 시간표 기준, ' + TT_LIVE.fetchedAt.slice(5).replace('-', '/') + '에 받아 왔어요. 색칠된 칸은 바뀐 수업이에요.' : '사진으로 받은 기본 시간표예요.';
  }
  function refreshCalendar() { renderMonth(false); renderDay(); renderDdays(); renderGlance(); if (typeof renderAlarmPanel === 'function') renderAlarmPanel(); }
  if (calGrid) {
    renderMonth(false); renderDay(); renderDdays(); renderWeekTable();
    document.getElementById('cal-prev').addEventListener('click', function () { viewM -= 1; if (viewM < 0) { viewM = 11; viewY -= 1; } renderMonth(true); });
    document.getElementById('cal-next').addEventListener('click', function () { viewM += 1; if (viewM > 11) { viewM = 0; viewY += 1; } renderMonth(true); });
    document.getElementById('cal-today').addEventListener('click', function () { viewY = now.getFullYear(); viewM = now.getMonth(); selKey = ymd(now); renderMonth(true); renderDay(); });
    document.getElementById('add-ev').addEventListener('click', function () { editState = { mode: 'new', date: selKey }; location.hash = 'event-new'; });
  }

  /* ---------- 일정 추가·고치기 화면 ---------- */
  var ef = document.getElementById('ev-form');
  var efDays = [];
  function $(id) { return document.getElementById(id); }
  function efColor() { var c = ef.querySelector('input[name="ef-color"]:checked'); return c ? c.value : 'blue'; }
  function efData() {
    var freq = $('ef-repeat').value;
    return {
      title: $('ef-title').value.trim(), date: $('ef-date').value, allDay: $('ef-allday').checked,
      start: $('ef-allday').checked ? '' : $('ef-start').value, end: $('ef-allday').checked ? '' : $('ef-end').value,
      location: $('ef-loc').value.trim(), color: efColor(), dday: $('ef-dday').checked, memo: $('ef-memo').value.trim(), alarm: $('ef-alarm').value,
      repeat: { freq: freq, interval: Math.max(1, parseInt($('ef-interval').value, 10) || 1), byDay: freq === 'weekly' ? efDays.slice().sort() : [], until: (freq !== 'none' && $('ef-endtype').value === 'until') ? $('ef-until').value : '' }
    };
  }
  function syncAlarmOptions(want) {
    var sel = $('ef-alarm'), allDay = $('ef-allday').checked, cur = want !== undefined ? want : sel.value;
    var list = allDay ? ALARM_ALLDAY : ALARM_TIMED;
    if (sel.getAttribute('data-mode') !== (allDay ? 'a' : 't') || want !== undefined) {
      sel.textContent = '';
      list.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; sel.appendChild(op); });
      sel.setAttribute('data-mode', allDay ? 'a' : 't');
      var ok = list.some(function (o) { return o[0] === cur; });
      sel.value = ok ? cur : (allDay ? 'd8' : '10');
    }
  }
  function syncEfVisibility() {
    syncAlarmOptions();
    var freq = $('ef-repeat').value;
    $('g-time').hidden = $('ef-allday').checked;
    $('g-interval').hidden = freq === 'none';
    $('g-wdays').hidden = freq !== 'weekly';
    $('g-end').hidden = freq === 'none';
    $('ef-until').hidden = $('ef-endtype').value !== 'until';
    $('ef-unit').textContent = { daily: '일마다', weekly: '주마다', monthly: '개월마다', yearly: '년마다' }[freq] || '';
    ef.querySelectorAll('#ef-wdays button').forEach(function (b) { b.setAttribute('aria-pressed', efDays.indexOf(+b.getAttribute('data-d')) !== -1 ? 'true' : 'false'); });
  }
  function renderPreview() {
    var d = efData(), pv = $('ef-preview');
    pv.className = 'ev-preview cl-' + d.color;
    $('pv-t').textContent = d.title || '이름 없는 일정';
    var box = $('pv-lines'); box.textContent = '';
    function line(icon, text) { var p = el('p', 'pv-l'); p.style.margin = '0'; p.appendChild(icon); p.appendChild(el('span', '', text)); box.appendChild(p); }
    if (d.date) line(calIcon(), dayLabel(parseYmd(d.date)));
    line(clockIcon(), d.allDay ? '종일' : (d.start || '시작 시간') + '–' + (d.end || '끝 시간'));
    if (d.repeat.freq !== 'none' && d.date) line(repeatIcon(), repeatText(d.repeat, d.date));
    if (d.location) line(pinIcon(), d.location);
    if (d.alarm) line(bellIcon(), '알림 ' + alarmLabel(d.alarm, d.allDay));
    if (d.dday) line(svgIcon(['M5 12l4 4 10-10']), 'D-day로 표시');
  }
  function fillForm(data, mode, isRepeat) {
    $('ef-heading').textContent = mode === 'edit' ? '일정 고치기' : '새 일정';
    $('ef-title').value = data.title || '';
    $('ef-date').value = data.date || ymd(now);
    $('ef-allday').checked = !!data.allDay;
    $('ef-start').value = data.start || '09:00';
    $('ef-end').value = data.end || '10:00';
    $('ef-repeat').value = data.repeat ? data.repeat.freq : 'none';
    $('ef-interval').value = data.repeat ? (data.repeat.interval || 1) : 1;
    efDays = data.repeat && data.repeat.byDay && data.repeat.byDay.length ? data.repeat.byDay.slice() : [parseYmd($('ef-date').value).getDay()];
    $('ef-endtype').value = data.repeat && data.repeat.until ? 'until' : 'never';
    $('ef-until').value = data.repeat && data.repeat.until ? data.repeat.until : '';
    var c = ef.querySelector('input[name="ef-color"][value="' + (data.color || 'blue') + '"]'); if (c) c.checked = true;
    $('ef-loc').value = data.location || '';
    $('ef-dday').checked = !!data.dday;
    $('ef-memo').value = data.memo || '';
    syncAlarmOptions(data.alarm !== undefined ? data.alarm : (data.allDay ? 'd8' : '10'));
    $('ef-err').hidden = true;
    $('ef-delete').hidden = mode !== 'edit';
    syncEfVisibility(); renderPreview();
  }
  function prepareEventForm(name) {
    if (!ef) return false;
    if (name === 'event-edit') {
      if (!editState || editState.mode !== 'edit') return false;
      var ev = events.filter(function (x) { return x.id === editState.id; })[0];
      if (!ev) return false;
      var copy = JSON.parse(JSON.stringify(ev));
      copy.date = ev.repeat.freq === 'none' ? ev.date : editState.occKey;
      fillForm(copy, 'edit', ev.repeat.freq !== 'none');
    } else {
      var dk = editState && editState.mode === 'new' ? editState.date : selKey;
      editState = { mode: 'new', date: dk };
      fillForm({ date: dk, allDay: false, color: 'blue', repeat: { freq: 'none', interval: 1, byDay: [], until: '' } }, 'new', false);
    }
    setTimeout(function () { $('ef-title').focus(); }, 60);
    return true;
  }
  function efError(msg, field) { var e = $('ef-err'); e.textContent = msg; e.hidden = false; if (field) $(field).focus(); }
  function finishEvent(msg, key) {
    editState = null;
    saveEvents();
    if (key) { selKey = key; var sd = parseYmd(key); viewY = sd.getFullYear(); viewM = sd.getMonth(); }
    location.hash = 'calendar';
    refreshCalendar();
    toast(msg);
  }
  function askChoice(title, desc, options) {
    var m = $('choice-modal');
    $('ch-title').textContent = title; $('ch-desc').textContent = desc;
    var list = $('ch-list'); list.textContent = '';
    options.forEach(function (o) {
      var b = el('button'); b.type = 'button';
      b.appendChild(el('b', '', o.label)); if (o.sub) b.appendChild(el('span', '', o.sub));
      if (o.danger) b.style.borderColor = 'var(--danger)';
      b.addEventListener('click', function () { m.hidden = true; o.run(); });
      list.appendChild(b);
    });
    openModal(m, document.activeElement);
  }
  if (ef) {
    var colorBox = $('ef-colors');
    COLORS.forEach(function (c, i) {
      var lab = el('label', 'swatch cl-' + c); lab.title = COLOR_NAME[c];
      var inp = el('input'); inp.type = 'radio'; inp.name = 'ef-color'; inp.value = c; inp.id = 'ef-color-' + c; if (i === 0) inp.checked = true;
      inp.setAttribute('aria-label', COLOR_NAME[c]);
      lab.appendChild(inp); lab.appendChild(el('span'));
      colorBox.appendChild(lab);
    });
    var wbox = $('ef-wdays');
    DAYS.forEach(function (d, i) {
      var b = el('button', '', d); b.type = 'button'; b.setAttribute('data-d', String(i)); b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', d + '요일');
      b.addEventListener('click', function () {
        var k = efDays.indexOf(i);
        if (k === -1) efDays.push(i); else if (efDays.length > 1) efDays.splice(k, 1);
        syncEfVisibility(); renderPreview();
      });
      wbox.appendChild(b);
    });
    ef.addEventListener('input', function () { syncEfVisibility(); renderPreview(); });
    ef.addEventListener('change', function (e) {
      if (e.target.id === 'ef-repeat' && e.target.value === 'weekly' && !efDays.length) efDays = [parseYmd($('ef-date').value || ymd(now)).getDay()];
      syncEfVisibility(); renderPreview();
    });
    ef.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = efData();
      if (!d.title) return efError('일정 이름을 적어 주세요.', 'ef-title');
      if (!d.date) return efError('날짜를 골라 주세요.', 'ef-date');
      if (!d.allDay && (!d.start || !d.end)) return efError('시작 시간과 끝 시간을 넣어 주세요. 시간이 없으면 종일로 바꿔 주세요.', 'ef-start');
      if (!d.allDay && d.end <= d.start) return efError('끝 시간이 시작 시간보다 늦어야 해요.', 'ef-end');
      if (d.repeat.freq !== 'none' && $('ef-endtype').value === 'until' && (!d.repeat.until || d.repeat.until < d.date)) return efError('반복이 끝나는 날은 시작 날짜보다 뒤여야 해요.', 'ef-until');
      if (!editState || editState.mode === 'new') {
        evSeq += 1;
        events.push(Object.assign({ id: 'e' + evSeq, skip: [] }, d));
        return finishEvent('일정을 추가했어요', d.date);
      }
      var ev = events.filter(function (x) { return x.id === editState.id; })[0];
      if (!ev) return finishEvent('일정을 찾지 못했어요', null);
      if (ev.repeat.freq === 'none') { Object.assign(ev, d); return finishEvent('일정을 고쳤어요', d.date); }
      var occ = editState.occKey;
      askChoice('반복 일정 고치기', '이 일정은 ' + repeatText(ev.repeat, ev.date) + ' 반복돼요. 어디까지 바꿀까요?', [
        { label: '이 일정만', sub: shortDate(occ) + ' 일정만 바꾸고 나머지는 그대로 둬요', run: function () {
          ev.skip.push(occ);
          evSeq += 1;
          var one = Object.assign({ id: 'e' + evSeq, skip: [] }, d); one.repeat = { freq: 'none', interval: 1, byDay: [], until: '' };
          events.push(one);
          finishEvent('이 일정만 고쳤어요', d.date);
        } },
        { label: '이 일정과 이후 일정 모두', sub: shortDate(occ) + '부터 앞으로 오는 일정을 모두 바꿔요', run: function () {
          if (occ === ev.date) { var keepSkip = ev.skip; Object.assign(ev, d); ev.skip = keepSkip.filter(function (k) { return k >= d.date; }); }
          else { ev.repeat.until = addDays(occ, -1); evSeq += 1; events.push(Object.assign({ id: 'e' + evSeq, skip: [] }, d)); }
          finishEvent('이후 일정을 모두 고쳤어요', d.date);
        } }
      ]);
    });
    $('ef-delete').addEventListener('click', function () {
      var ev = events.filter(function (x) { return x.id === (editState && editState.id); })[0];
      if (!ev) return;
      var occ = editState.occKey;
      function removeEv() { events = events.filter(function (x) { return x !== ev; }); }
      if (ev.repeat.freq === 'none') {
        askChoice('일정 지우기', ev.title + ' 일정을 지울까요?', [
          { label: '지우기', sub: '지운 일정은 되돌릴 수 없어요', danger: true, run: function () { removeEv(); finishEvent('일정을 지웠어요', ev.date); } }
        ]);
        return;
      }
      askChoice('반복 일정 지우기', '이 일정은 ' + repeatText(ev.repeat, ev.date) + ' 반복돼요. 어디까지 지울까요?', [
        { label: '이 일정만 지우기', sub: shortDate(occ) + ' 일정만 지워요', danger: true, run: function () { ev.skip.push(occ); finishEvent('이 일정만 지웠어요', occ); } },
        { label: '이 일정과 이후 일정 모두 지우기', sub: shortDate(occ) + '부터 앞으로 오는 일정을 모두 지워요', danger: true, run: function () {
          if (occ === ev.date) removeEv(); else ev.repeat.until = addDays(occ, -1);
          finishEvent('이후 일정을 모두 지웠어요', occ);
        } }
      ]);
    });
  }

  /* ---------- 알림 ---------- */
  var alarmCard = document.getElementById('alarm-card');
  var fired = {};
  try { fired = JSON.parse(localStorage.getItem('mybase-fired') || '{}') || {}; } catch (e) { fired = {}; }
  function saveFired() {
    var cut = Date.now() - 3 * 86400000;
    Object.keys(fired).forEach(function (k) { if (fired[k] < cut) delete fired[k]; });
    try { localStorage.setItem('mybase-fired', JSON.stringify(fired)); } catch (e) {}
  }
  function inFrame() { try { return window.self !== window.top; } catch (e) { return true; } }
  function notifySupported() { return 'Notification' in window && !inFrame(); }

  /* ---------- 알림창에 계속 띄우는 것들 (고른 메모, 오늘 일정) ----------
     shadeProviders 의 함수들이 { 태그: { title, body } } 를 돌려주면 알림창을 거기에 맞춰요.
     밀어서 지운 알림은 서비스 워커가 mybase-pins 목록을 보고 다시 띄워요. */
  var shadeProviders = [], shadeReady = false;
  function shadeReg() {
    if (!notifySupported() || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (reg) { return reg && reg.active ? reg : null; }).catch(function () { return null; });
  }
  function shadeWant() {
    var want = {};
    shadeProviders.forEach(function (fn) { var w = fn() || {}; Object.keys(w).forEach(function (k) { want[k] = w[k]; }); });
    return want;
  }
  function putShadeFile(name, obj) {
    if (!('caches' in window)) return Promise.resolve();
    return caches.open('mybase-pins').then(function (c) {
      return obj === null ? c.delete(name) : c.put(name, new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } }));
    }).catch(function () {});
  }
  function syncShade() {
    if (!shadeReady) return Promise.resolve(); // 화면 준비가 끝나면 한 번에 맞춰요
    var want = shadeWant();
    return putShadeFile('pins.json', want).then(shadeReg).then(function (reg) {
      if (!reg || !reg.getNotifications) return;
      return reg.getNotifications().then(function (list) {
        var shown = {};
        list.forEach(function (n) { if (/^(memo-|day-plan)/.test(n.tag)) shown[n.tag] = n; });
        Object.keys(shown).forEach(function (tag) { if (!want[tag]) shown[tag].close(); });
        return Promise.all(Object.keys(want).map(function (tag) {
          var w = want[tag], n = shown[tag];
          if (n && n.title === w.title && (n.body || '') === (w.body || '')) return null;
          return reg.showNotification(w.title, { body: w.body || '', tag: tag, silent: true, renotify: false, requireInteraction: true, icon: 'icons/app-192.png', badge: 'icons/app-192.png', data: { url: w.url || './' } });
        }));
      });
    }).catch(function () {});
  }
  function askNotify(then) {
    if (inFrame()) { toast('미리보기에서는 알림을 쓸 수 없어요'); return; }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) { toast('이 브라우저는 알림을 못 띄워요. 아이폰은 홈 화면에 추가한 MY BASE 아이콘으로 열어 주세요', 6000); return; }
    var go = function () {
      if (Notification.permission !== 'granted') { toast(Notification.permission === 'denied' ? '알림이 막혀 있어요. 폰 설정에서 MY BASE 알림을 허용해 주세요' : '알림을 허용해야 띄울 수 있어요', 6000); return; }
      shadeReg().then(function (reg) { if (!reg) { toast('잠시 뒤 다시 눌러 주세요(앱 준비 중)'); return; } then(); });
    };
    if (Notification.permission === 'default') {
      try { var pr = Notification.requestPermission(function () {}); if (pr && pr.then) pr.then(go); else setTimeout(go, 500); } catch (e) { go(); }
    } else go();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncShade(); });
  function alarmBody(ev, key) {
    var d = parseYmd(key), isToday = key === ymd(new Date());
    var when = (isToday ? '오늘' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일') + ' ' + (ev.allDay ? '종일' : ev.start);
    return when + (ev.location ? ' · ' + ev.location : '');
  }
  function showAlarmCard(title, body, key) {
    if (!alarmCard) return;
    $('al-title').textContent = title;
    $('al-body').textContent = body;
    alarmCard.setAttribute('data-key', key || '');
    alarmCard.classList.remove('show'); void alarmCard.offsetWidth; alarmCard.classList.add('show');
  }
  function fireAlarm(ev, key, isTest) {
    var title = (isTest ? '알림 시험 · ' : '') + ev.title, body = alarmBody(ev, key);
    showAlarmCard(title, body, key);
    if (notifySupported() && Notification.permission === 'granted') {
      var opts = { body: body, icon: 'icons/app-192.png', badge: 'icons/app-192.png', tag: ev.id + '-' + key, data: { key: key } };
      var plain = function () { try { new Notification(title, opts); } catch (e) {} };
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, opts); }).catch(plain);
      } else plain();
    }
  }
  function checkAlarms() {
    var nowMs = Date.now(), base = ymd(new Date());
    [0, 1, 2].forEach(function (off) {
      var key = addDays(base, off);
      eventsOn(key).forEach(function (ev) {
        var at = alarmAt(ev, key); if (!at) return;
        var t = at.getTime(), id = ev.id + '@' + key + '@' + ev.alarm;
        if (t <= nowMs && nowMs - t < 10 * 60000 && !fired[id]) { fired[id] = nowMs; saveFired(); fireAlarm(ev, key, false); }
      });
    });
  }
  function nextAlarmText() {
    var nowMs = Date.now(), base = ymd(new Date()), best = null;
    for (var off = 0; off < 8; off++) {
      var key = addDays(base, off);
      eventsOn(key).forEach(function (ev) {
        var at = alarmAt(ev, key); if (!at || at.getTime() <= nowMs) return;
        if (!best || at < best.at) best = { at: at, ev: ev, key: key };
      });
    }
    if (!best) return '앞으로 일주일 안에 울릴 알림이 없어요.';
    var a = best.at;
    return '다음 알림: ' + (a.getMonth() + 1) + '월 ' + a.getDate() + '일 ' + String(a.getHours()).padStart(2, '0') + ':' + String(a.getMinutes()).padStart(2, '0') + ' · ' + best.ev.title;
  }
  function renderAlarmPanel() {
    var st = document.getElementById('al-state'); if (!st) return;
    var btn = $('al-enable'), test = $('al-test');
    btn.hidden = true; test.hidden = true;
    if (inFrame()) st.textContent = '미리보기에서는 폰 알림을 켤 수 없어요. 사이트를 올리면 켤 수 있어요. 지금은 화면 안 알림 카드만 볼 수 있어요.';
    else if (!('Notification' in window)) st.textContent = '이 브라우저는 알림을 지원하지 않아요. 아이폰이라면 사이트를 홈 화면에 추가한 뒤 그 아이콘으로 열어 주세요.';
    else if (Notification.permission === 'granted') { st.textContent = '알림이 켜져 있어요.'; test.hidden = false; }
    else if (Notification.permission === 'denied') st.textContent = '알림이 막혀 있어요. 브라우저나 폰 설정에서 이 사이트의 알림을 허용해 주세요.';
    else { st.textContent = '알림을 켜면 일정 시간이 됐을 때 폰으로 알려 줘요.'; btn.hidden = false; }
    $('al-next').textContent = nextAlarmText();
  }
  if (alarmCard) {
    $('al-ok').addEventListener('click', function () { alarmCard.classList.remove('show'); });
    $('al-open').addEventListener('click', function () {
      var k = alarmCard.getAttribute('data-key');
      alarmCard.classList.remove('show');
      if (k) { selKey = k; var sd = parseYmd(k); viewY = sd.getFullYear(); viewM = sd.getMonth(); }
      if (location.hash === '#calendar') refreshCalendar(); else location.hash = 'calendar';
      setTimeout(refreshCalendar, 50);
    });
  }
  if (document.getElementById('al-state')) {
    $('al-enable').addEventListener('click', function () {
      try {
        var p = Notification.requestPermission(function () { renderAlarmPanel(); });
        if (p && p.then) p.then(function (r) { renderAlarmPanel(); if (r === 'granted') toast('알림을 켰어요'); });
      } catch (e) { renderAlarmPanel(); }
    });
    $('al-test').addEventListener('click', function () { fireAlarm({ id: 'test', title: '알림이 잘 와요', allDay: false, start: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'), location: '' }, ymd(new Date()), true); });
    renderAlarmPanel();
  }
  /* 오늘 일정을 알림창에: 그날 일정과 수업을 한 알림으로 보여 줘요(이 기기에서만). */
  var PLAN_KEY = 'mybase-dayplan', planDay = ymd(new Date());
  function planOn() { try { return localStorage.getItem(PLAN_KEY) === '1'; } catch (e) { return false; } }
  function planFor(key) {
    var d = parseYmd(key), wd = d.getDay(), lines = [];
    eventsOn(key).forEach(function (ev) { lines.push(timeText(ev) + '  ' + ev.title + (ev.location ? ' (' + ev.location + ')' : '')); });
    var tt = lessonsFor(key);
    if (tt.length) {
      var end = (SITE.periods[tt.length - 1] || [])[1];
      lines.push('수업  ' + tt.map(function (x) { return x.ch ? x.s + '(바뀜)' : x.s; }).join(' · ') + (end ? '  (' + end + ' 끝)' : ''));
    }
    return { title: '오늘 일정 · ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[wd] + '요일', body: lines.length ? lines.join('\n') : '오늘은 일정이 없어요', url: './#calendar' };
  }
  shadeProviders.push(function () { return planOn() ? { 'day-plan': planFor(ymd(new Date())) } : {}; });
  // 휴대폰이 허락하면(안드로이드 크롬, 홈 화면에 설치한 앱) 앱을 열지 않아도 날이 바뀌면 서비스 워커가 바꿔 띄워요.
  function writePlanFile() {
    if (!planOn()) return putShadeFile('plan.json', null);
    var days = {}, k = ymd(new Date());
    for (var i = 0; i < 14; i++) { days[k] = planFor(k); k = addDays(k, 1); }
    return putShadeFile('plan.json', { days: days });
  }
  function planBackground(on) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg || !reg.periodicSync) return;
      if (on) return reg.periodicSync.register('day-plan', { minInterval: 6 * 60 * 60 * 1000 }).catch(function () {});
      return reg.periodicSync.unregister('day-plan').catch(function () {});
    }).catch(function () {});
  }
  function refreshPlan() { if (!planOn()) return; writePlanFile(); syncShade(); }
  var planBox = document.getElementById('al-plan');
  if (planBox) {
    planBox.checked = planOn();
    planBox.addEventListener('change', function () {
      if (!planBox.checked) {
        try { localStorage.removeItem(PLAN_KEY); } catch (e) {}
        writePlanFile(); planBackground(false); syncShade();
        toast('오늘 일정을 알림창에서 내렸어요');
        return;
      }
      planBox.checked = false;
      askNotify(function () {
        try { localStorage.setItem(PLAN_KEY, '1'); } catch (e) {}
        planBox.checked = true;
        writePlanFile(); planBackground(true);
        syncShade().then(function () { toast('오늘 일정을 알림창에 띄웠어요'); });
        renderAlarmPanel();
      });
    });
  }
  if (calGrid) {
    checkAlarms(); refreshPlan();
    setInterval(function () {
      checkAlarms(); renderAlarmPanel();
      var k = ymd(new Date()); if (k !== planDay) { planDay = k; refreshPlan(); }
    }, 20000);
  }

  /* ---------- 홈: 오늘 줄 (다음 일정, 가까운 D-day, 새 아침 읽기) ---------- */
  function clockIcon2() { return clockIcon(); }
  function bookIcon() { return svgIcon(['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z', 'M4 21.5V5.5']); }
  function renderGlance() {
    var box = document.getElementById('today-links'); if (!box) return;
    box.textContent = '';
    var tk = ymd(now), cur = now.getHours() * 60 + now.getMinutes();
    function link(href, icon, parts) {
      var a = el('a'); a.href = href; a.appendChild(icon);
      parts.forEach(function (p) { a.appendChild(typeof p === 'string' ? document.createTextNode(p) : p); });
      box.appendChild(a);
    }
    var upcoming = eventsOn(tk).filter(function (e) { return e.allDay || mins(e.end || e.start) > cur; });
    if (upcoming.length) {
      var e = upcoming[0];
      link('#calendar', clockIcon2(), [(e.allDay ? '오늘 ' : e.start + ' ') + e.title + (upcoming.length > 1 ? ' 외 ' + (upcoming.length - 1) + '개' : '')]);
    }
    var dd = events.filter(function (e) { return e.dday; }).map(function (e) { return { e: e, k: nextOccurrence(e, tk) }; })
      .filter(function (x) { return x.k && x.k !== tk; }).sort(function (a, b) { return a.k < b.k ? -1 : 1; })[0];
    if (dd) {
      var left = daysLeft(parseYmd(dd.k));
      if (left <= 14) link('#calendar', calIcon(), [el('b', '', 'D-' + left), ' ' + dd.e.title]);
    }
    var chg = lessonsFor(tk).map(function (x, i) { return x.ch ? (i + 1) + '교시 ' + x.s : null; }).filter(Boolean);
    if (chg.length) link('#calendar', calIcon(), ['오늘 바뀐 수업: ' + chg.slice(0, 2).join(', ') + (chg.length > 2 ? ' 외 ' + (chg.length - 2) + '개' : '')]);
    var r = readings && readings[0];
    if (r && r.date === tk && !r.result) link('#read-' + r.date, bookIcon(), ['아침 읽기 ' + r.articles.length + '편']);
    var LT = readings && readings.length ? latestTest() : null;
    if (LT && !testDone(LT) && (parseYmd(tk) - parseYmd(LT.date)) / 864e5 <= 6) link('#test', bookIcon(), ['주간 점검']);
    if (driveInbox && driveInbox.length) link('#files', svgIcon(['M4 13h4l2 3h4l2-3h4', 'M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z']), ['받은 파일 ' + driveInbox.length + '개']);
  }
  renderGlance();

  /* =========================================================
     아침 영어 읽기 (사이트 안에서 보기)
     ========================================================= */
  var R = null, readings = [], routeFn = null, viewHooks = {};
  var STATUS = { known: '외운 단어', shaky: '거의 다 온', learning: '배우는 중', expose: '익히는 중' };
  function setReading(data) {
    R = data || { readings: [], wordbook: [], tests: [] };
    R.readings = R.readings || []; R.wordbook = R.wordbook || []; R.tests = R.tests || [];
    if (!R.roots || typeof R.roots !== 'object') R.roots = {};
    R.roots.en = Array.isArray(R.roots.en) ? R.roots.en : []; R.roots.ko = Array.isArray(R.roots.ko) ? R.roots.ko : [];
    R.readings.forEach(function (r) { r.articles = r.articles || []; r.gloss = r.gloss || {}; r.quiz = r.quiz || []; r.recall = r.recall || []; });
    readings = R.readings.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    applyLocalResults();
  }
  /* 사이트에서 푼 기록: 아침 읽기 페이지의 readmarks 와 같은 모양으로 저장해요. */
  function marksFor(date, create) {
    if (!store.marks || typeof store.marks !== 'object') { if (!create) return null; store.marks = {}; }
    var m = store.marks[date];
    if (!m && create) m = store.marks[date] = {};
    if (m) ['quiz', 'keyq', 'recall', 'gloss'].forEach(function (k) { if (!m[k] || typeof m[k] !== 'object') m[k] = {}; });
    if (m && !Array.isArray(m.unknown)) m.unknown = [];
    return m || null;
  }
  function saveMark(date) {
    saveStore();
    queue('mark:' + date, 'mark', function () { return { date: date, mark: store.marks[date] }; });
  }
  function applyLocalResults() {
    readings.forEach(function (r) { var m = marksFor(r.date, false); if (m && m.result) r.result = m.result; });
  }
  function loadReadingFiles() {
    function get(p) { return fetch(p, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(p); return r.json(); }); }
    return get('reading/index.json').then(function (idx) {
      var days = idx.days || [];
      return Promise.all([
        Promise.all(days.map(function (d) { return get('reading/' + d + '.json').catch(function () { return null; }); })),
        get('reading/wordbook.json').catch(function () { return []; }),
        get('reading/tests.json').catch(function () { return []; }),
        get('reading/roots.json').catch(function () { return {}; })
      ]).then(function (all) { return { streak: idx.streak || 0, readings: all[0].filter(Boolean), wordbook: all[1], tests: all[2], roots: all[3] }; });
    });
  }
  function findReading(key) { return readings.filter(function (r) { return r.date === key; })[0]; }
  function readTitle(r) { var d = parseYmd(r.date); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 아침 읽기'; }
  function resultText(r) {
    if (!r.result) return null;
    return '뜻 고르기 ' + r.result.quiz + '/' + r.result.quizN + ', 떠올리기 ' + r.result.recall + '/' + r.result.recallN;
  }
  function readMinutes(r) { return r.minutes || Math.max(1, Math.round((r.wordCount || 0) / 120)); }
  function titleList(r) {
    var ul = el('ul', 'rd-titles');
    r.articles.forEach(function (a) { var li = el('li'); li.appendChild(el('span', 'tagc', a.tag)); li.appendChild(el('span', '', a.title)); ul.appendChild(li); });
    return ul;
  }
  function chevronIcon() { return svgIcon(['M9 5l7 7-7 7']); }
  function renderReadingList() {
    var latestBox = document.getElementById('rd-latest'); if (!latestBox || !R) return;
    var latest = readings[0];
    var tl = document.getElementById('rd-test-link'), LT = latestTest();
    if (tl) { tl.hidden = !LT; tl.textContent = LT && !testDone(LT) ? '주간 점검 풀기' : '주간 점검'; }
    latestBox.textContent = '';
    var arc = document.getElementById('rd-archive');
    if (!latest) {
      latestBox.appendChild(el('h1', '', '아침 읽기'));
      latestBox.appendChild(el('p', 'muted', '아직 올라온 읽기가 없어요.'));
      if (arc) arc.textContent = '';
      return;
    }
    latestBox.appendChild(el('p', 'kicker', dayLabel(parseYmd(latest.date))));
    latestBox.appendChild(el('h1', '', '아침 읽기'));
    latestBox.appendChild(el('p', 'muted', latest.articles.length + '편, 약 ' + readMinutes(latest) + '분'));
    var st = resultText(latest);
    latestBox.appendChild(el('span', 'state' + (st ? '' : ' todo'), st ? '다 풀었어요. ' + st : ''));
    var go = el('a', 'btn primary lg', st ? '다시 보기' : '읽기 시작'); go.href = '#read-' + latest.date;
    latestBox.appendChild(go);
    arc.textContent = '';
    readings.slice(1).forEach(function (r) {
      var li = el('li'), a = el('a', 'arc'); a.href = '#read-' + r.date;
      var d = parseYmd(r.date);
      var dd = el('span', 'arc-date'); dd.appendChild(el('b', '', (d.getMonth() + 1) + '.' + d.getDate())); dd.appendChild(el('span', '', DAYS[d.getDay()] + '요일'));
      a.appendChild(dd);
      var body = el('span', 'arc-body');
      body.appendChild(el('span', 't', r.articles.map(function (x) { return x.title; }).join(', ')));
      var rt = resultText(r); body.appendChild(el('span', 'arc-res', rt ? rt : '아직 안 풀었어요'));
      a.appendChild(body);
      a.appendChild(chevronIcon());
      li.appendChild(a); arc.appendChild(li);
    });
    if (readings.length < 2) arc.appendChild(el('li', 'empty', '이전 읽기가 아직 없어요.'));
  }
  function renderStatus() {
    if (!R || !document.getElementById('st-tiles')) return;
    var wb = R.wordbook, c = { known: 0, shaky: 0, learning: 0, expose: 0 };
    wb.forEach(function (w) { if (c[w.status] !== undefined) c[w.status] += 1; });
    var tiles = document.getElementById('st-tiles'); tiles.textContent = '';
    ['known', 'shaky', 'learning', 'expose'].forEach(function (k) {
      var t = el('div', 'stat' + (k === 'known' ? ' known' : ''));
      var b = el('b', '', String(c[k])); b.setAttribute('data-count', String(c[k])); t.appendChild(b); t.appendChild(el('span', '', STATUS[k]));
      tiles.appendChild(t);
    });
    var sk = el('div', 'stat streak'); sk.appendChild(el('span', '', '연속으로 읽은 날'));
    var sb = el('b'); var si = el('i', '', String(R.streak || 0)); si.style.fontStyle = 'normal'; si.setAttribute('data-count', String(R.streak || 0)); sb.appendChild(si); sb.appendChild(document.createTextNode('일')); sk.appendChild(sb);
    tiles.appendChild(sk);
    var total = wb.length || 1, bar = document.getElementById('st-bar'); bar.textContent = '';
    [['k', 'known'], ['s', 'shaky'], ['l', 'learning'], ['e', 'expose']].forEach(function (p, i) { var x = el('i', p[0]); x.style.width = (c[p[1]] / total * 100) + '%'; x.style.animationDelay = (0.6 + i * 0.1) + 's'; bar.appendChild(x); });
    bar.setAttribute('aria-label', '단어장 ' + wb.length + '개 중 외운 단어 ' + c.known + '개');
    document.getElementById('st-total').textContent = wb.length;
    var ch = document.getElementById('st-chart'), cx = document.getElementById('st-chart-x'); ch.textContent = ''; cx.textContent = '';
    (R.tests || []).forEach(function (t, i, all) {
      var col = el('div', 'col' + (i === all.length - 1 ? ' last' : ''));
      col.appendChild(el('span', 'v', t.pct + '%'));
      var b = el('div', 'b'); b.style.height = 'calc(' + t.pct + '% - 26px)'; b.style.animationDelay = (0.3 + i * 0.12) + 's'; col.appendChild(b);
      ch.appendChild(col);
      var d = parseYmd(t.date); cx.appendChild(el('span', '', (d.getMonth() + 1) + '.' + d.getDate()));
    });
    var tests = R.tests || [];
    ch.hidden = cx.hidden = !tests.length;
    if (!tests.length) document.getElementById('st-cap').textContent = '일요일 점검을 풀면 여기에 정답률이 쌓여요.';
    if (tests.length >= 2) {
      var diff = tests[tests.length - 1].pct - tests[tests.length - 2].pct, cap = document.getElementById('st-cap'); cap.textContent = '';
      cap.appendChild(document.createTextNode('지난 점검 ' + tests[tests.length - 1].pct + '%, 그 전보다 '));
      cap.appendChild(el('b', '', (diff >= 0 ? '+' : '') + diff + '%p'));
    }
    var tk = ymd(now), rv = document.getElementById('st-review'); rv.textContent = '';
    var due = wb.filter(function (w) { return w.status !== 'expose' && w.due && w.due <= tk; });
    if (!due.length) rv.appendChild(el('p', 'muted', '오늘 복습할 단어가 없어요.'));
    due.forEach(function (w) { var s = el('span', '', w.word); s.appendChild(el('small', '', w.ko)); rv.appendChild(s); });
    var wl = document.getElementById('st-words'); wl.textContent = '';
    wb.forEach(function (w) {
      var li = el('li'); li.setAttribute('data-s', w.status);
      var ww = el('span', 'ww', w.word); if (w.kind === 'idiom') ww.appendChild(el('small', '', '관용어구')); li.appendChild(ww);
      var k = el('span', 'wk', w.ko); if (w.parts) k.appendChild(el('small', '', w.parts));
      var meta = [];
      if (w.status === 'expose') meta.push('익히는 중');
      else if (w.box) meta.push(w.box + '단계');
      if (w.encounters) meta.push('만난 횟수 ' + w.encounters);
      if (w.status !== 'expose' && w.due) { var dd = parseYmd(w.due); meta.push('다음 복습 ' + (dd.getMonth() + 1) + '/' + dd.getDate()); }
      if (meta.length) k.appendChild(el('small', 'wmeta', meta.join(', ')));
      li.appendChild(k);
      li.appendChild(el('span', 'spill ' + w.status, STATUS[w.status]));
      wl.appendChild(li);
    });
  }
  var wFilter = 'all';
  function applyWords() {
    var q = (document.getElementById('st-search').value || '').trim().toLowerCase();
    document.querySelectorAll('#st-words li').forEach(function (li) {
      li.hidden = !((wFilter === 'all' || li.getAttribute('data-s') === wFilter) && (!q || li.textContent.toLowerCase().indexOf(q) !== -1));
    });
  }
  function markNewReading() { renderGlance(); }
  function initReadingUI() { if (R && document.getElementById('rd-latest')) { renderReadingList(); renderStatus(); markNewReading(); } }
  onStoreReload(function () { if (!R) return; applyLocalResults(); initReadingUI(); });
  /* 아침 작업이 드라이브 'MY BASE 읽기 기록' 폴더에 올린 reading-날짜.json 을 받아 와요.
     받은 것은 이 기기에 저장해 두고, 다음에는 바뀐 날만 다시 받아요. */
  var RC_KEY = 'mybase-reading-drive', rcLast = 0, baseReading = null;
  function rcLoad() {
    try { var c = JSON.parse(localStorage.getItem(RC_KEY) || 'null'); if (c && c.days) { c.roots = c.roots || { en: {}, ko: {} }; return c; } } catch (e) {}
    return { days: {}, roots: { en: {}, ko: {} } };
  }
  function rcSave(c) {
    Object.keys(c.days).sort().reverse().slice(30).forEach(function (k) { delete c.days[k]; });
    try { localStorage.setItem(RC_KEY, JSON.stringify(c)); } catch (e) {}
  }
  function mergeDrive(c) {
    var base = baseReading || { readings: [] }, map = {};
    (base.readings || []).forEach(function (r) { map[r.date] = r; });
    Object.keys(c.days).forEach(function (k) { map[k] = c.days[k]; });
    var roots = { en: ((base.roots && base.roots.en) || []).slice(), ko: ((base.roots && base.roots.ko) || []).slice() };
    ['en', 'ko'].forEach(function (t) {
      var have = {}; roots[t].forEach(function (x) { have[x.date] = 1; });
      Object.keys(c.roots[t] || {}).forEach(function (d) { var x = c.roots[t][d]; if (x && x.form && !have[d]) roots[t].push(Object.assign({ date: d }, x)); });
    });
    setReading({
      streak: typeof c.streak === 'number' ? c.streak : base.streak,
      readings: Object.keys(map).map(function (k) { return map[k]; }),
      wordbook: c.wordbook || base.wordbook || [], tests: c.tests || base.tests || [], roots: roots
    });
  }
  function syncDriveReading(force) {
    if (!driveOn || !baseReading) return;
    if (!force && Date.now() - rcLast < 10 * 60 * 1000) return;
    rcLast = Date.now();
    var c = rcLoad(), have = {};
    Object.keys(c.days).forEach(function (k) { have[k] = c.days[k].u; });
    drive('readings', { have: have, limit: 21 }).then(function (res) {
      var fresh = [], meta = false;
      (res.days || []).forEach(function (d) {
        if (!d || !d.date || d.same) return;
        c.days[d.date] = d; fresh.push(d.date);
        if (d.roots) { c.roots.en[d.date] = d.roots.en || null; c.roots.ko[d.date] = d.roots.ko || null; }
      });
      if (Array.isArray(res.wordbook)) { c.wordbook = res.wordbook; meta = true; }
      if (Array.isArray(res.tests)) { c.tests = res.tests; meta = true; }
      if (typeof res.streak === 'number') { c.streak = res.streak; meta = true; }
      if (!fresh.length && !meta) return;
      rcSave(c);
      var before = readings.map(function (r) { return r.date; });
      mergeDrive(c); initReadingUI();
      var h = location.hash, m = /^#read-(.+)$/.exec(h);
      if (routeFn && (h === '#reading' || h === '#roots' || h === '#test' || (h === '#drill' && !drill.round) || (m && before.indexOf(m[1]) === -1))) routeFn(true);
    }).catch(function () {});
  }
  function startReading(d) {
    baseReading = d;
    var c0 = rcLoad();
    if (Object.keys(c0.days).length) mergeDrive(c0); else setReading(d);
    initReadingUI();
    syncDriveReading(true);
  }
  if (document.getElementById('rd-latest')) {
    if (driveOn) document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncDriveReading(false); });
    if (window.READING) startReading(window.READING);
    else {
      document.getElementById('rd-latest').textContent = '읽기 자료를 불러오는 중이에요…';
      loadReadingFiles().then(function (d) {
        startReading(d);
        if (routeFn && /^#(read-|drill|roots|test)/.test(location.hash)) routeFn(true);
      }).catch(function () {
        setReading(null);
        document.getElementById('rd-latest').textContent = '읽기 자료를 불러오지 못했어요. reading 폴더에 index.json이 있는지 확인해 주세요.';
      });
    }
    document.querySelectorAll('[data-rtab]').forEach(function (b, _, all) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-rtab'), on = b.getAttribute('aria-pressed') !== 'true';
        all.forEach(function (x) { x.setAttribute('aria-pressed', on && x === b ? 'true' : 'false'); });
        document.getElementById('rd-list').hidden = !(on && t === 'list');
        document.getElementById('rd-status').hidden = !(on && t === 'status');
        if (on && t === 'status') { renderStatus(); applyWords(); countUp(document.getElementById('rd-status')); }
      });
    });
    document.querySelectorAll('[data-wfilter] button').forEach(function (b, _, all) {
      b.addEventListener('click', function () { wFilter = b.getAttribute('data-f'); all.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); applyWords(); });
    });
    document.getElementById('st-search').addEventListener('input', applyWords);
  }

  /* 읽기 화면 */
  var wordCard = document.getElementById('word-card'), wordBtn = null, wcCtx = null;
  function hideWord() {
    if (!wordCard) return; wordCard.classList.remove('show');
    if (wordBtn) { wordBtn.classList.remove('on'); if (wordBtn.tagName === 'BUTTON') wordBtn.setAttribute('aria-expanded', 'false'); }
    wordBtn = null; wcCtx = null;
  }
  function curReading() { return tally && tally.entry; }
  function savedWords() {
    var r = curReading(), m = r && marksFor(r.date, false);
    return ((m && m.unknown) || []).map(function (u) { return String(u.word || '').toLowerCase(); });
  }
  function markSavedWords() {
    var set = savedWords(), box = $('rd-articles'); if (!box) return;
    box.querySelectorAll('.pw, .w').forEach(function (n) {
      var k = (n.getAttribute('data-lem') || n.textContent).toLowerCase();
      n.classList.toggle('saved', set.indexOf(k) !== -1);
    });
  }
  function sentenceOf(node) {
    var p = node.closest('p'); if (!p) return '';
    var t = p.textContent, i = t.indexOf(node.textContent);
    var a = t.lastIndexOf('. ', i); a = a < 0 ? 0 : a + 2;
    var b = t.indexOf('. ', i); b = b < 0 ? t.length : b + 1;
    return t.slice(a, b).trim();
  }
  function openCard(node, word, label) {
    if (wordBtn) { wordBtn.classList.remove('on'); if (wordBtn.tagName === 'BUTTON') wordBtn.setAttribute('aria-expanded', 'false'); }
    wordBtn = node; node.classList.add('on'); if (node.tagName === 'BUTTON') node.setAttribute('aria-expanded', 'true');
    wcCtx = { word: word, node: node };
    var done = savedWords().indexOf(word.toLowerCase()) !== -1;
    var sv = $('wc-save'); sv.disabled = done; sv.textContent = done ? '복습에 넣었어요' : label;
    wordCard.classList.add('show');
  }
  function showWord(btn, lemma, gloss) {
    var g = gloss[lemma] || {};
    $('wc-w').textContent = lemma;
    $('wc-k').textContent = g.ko || '뜻이 아직 없어요'; $('wc-k').hidden = false;
    $('wc-p').textContent = g.parts || ''; $('wc-p').hidden = !g.parts;
    $('wc-n').textContent = g.note || ''; $('wc-n').hidden = !g.note;
    openCard(btn, lemma, '아직 헷갈려요, 복습에 넣기');
  }
  function showPlain(span) {
    var w = span.textContent.replace(/[’']s$/, '');
    $('wc-w').textContent = w;
    $('wc-k').hidden = true; $('wc-p').hidden = true; $('wc-n').hidden = true;
    openCard(span, w, '모르는 단어로 저장');
  }
  function saveUnknownWord() {
    var r = curReading(); if (!r || !wcCtx) return;
    var m = marksFor(r.date, true), w = wcCtx.word, art = wcCtx.node.closest('article');
    if (!m.unknown.some(function (u) { return String(u.word).toLowerCase() === w.toLowerCase(); })) {
      m.unknown.push({ word: w, sentence: sentenceOf(wcCtx.node), articleId: art ? art.getAttribute('data-a') : '', at: new Date().toISOString() });
      saveMark(r.date);
    }
    $('wc-save').disabled = true; $('wc-save').textContent = '복습에 넣었어요';
    markSavedWords();
    toast('저장했어요. 다음 글과 문제에 다시 나와요.');
  }
  /* only 에 기본형을 주면 그 단어만 형광펜으로 칠하고, 나머지 표시 단어는 보통 글자로 둬요. */
  function richText(text, gloss, asButtons, only) {
    var frag = document.createDocumentFragment(), re = /\{\{([^|}]+)\|([^}]+)\}\}/g, last = 0, m;
    // 묻는 단어가 문장에 없으면 예전처럼 모두 칠해요.
    if (only && !new RegExp('\\|\\s*' + String(only).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'i').test(text)) only = null;
    function plain(t) {
      if (!asButtons) { frag.appendChild(document.createTextNode(t)); return; }
      t.split(/([A-Za-z][A-Za-z'’-]*)/).forEach(function (x, i) {
        if (!x) return;
        if (i % 2) frag.appendChild(el('span', 'pw', x)); else frag.appendChild(document.createTextNode(x));
      });
    }
    while ((m = re.exec(text))) {
      if (m.index > last) plain(text.slice(last, m.index));
      if (asButtons) {
        var b = el('button', 'w', m[1]); b.type = 'button'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('data-lem', m[2]);
        (function (lemma, btn) { btn.addEventListener('click', function () { if (wordBtn === btn) hideWord(); else showWord(btn, lemma, gloss); }); })(m[2], b);
        frag.appendChild(b);
      } else if (only && m[2].toLowerCase() !== String(only).toLowerCase()) frag.appendChild(document.createTextNode(m[1]));
      else frag.appendChild(el('mark', '', m[1]));
      last = re.lastIndex;
    }
    if (last < text.length) plain(text.slice(last));
    return frag;
  }
  var hlOn = true;
  try { hlOn = localStorage.getItem('mb-hl') !== '0'; } catch (e) {}
  function applyHl() {
    var box = $('rd-articles'), b = $('rd-hl'); if (!box || !b) return;
    box.classList.toggle('no-hl', !hlOn);
    b.textContent = hlOn ? '형광펜 끄기' : '형광펜 켜기';
  }
  if ($('rd-articles')) {
    $('rd-articles').addEventListener('click', function (e) {
      var t = e.target;
      if (!t.classList || !t.classList.contains('pw')) return;
      if (String(window.getSelection ? window.getSelection() : '').trim()) return;
      if (wordBtn === t) hideWord(); else showPlain(t);
    });
    $('rd-hl').addEventListener('click', function () { hlOn = !hlOn; try { localStorage.setItem('mb-hl', hlOn ? '1' : '0'); } catch (e) {} applyHl(); });
    applyHl();
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var tally = null;
  function updateTally() {
    if (!tally) return;
    var done = tally.kd === tally.kN && tally.qd === tally.qN && tally.rd === tally.rN;
    if (done && tally.entry && !tally.saved) {
      tally.saved = true;
      var res = { quiz: tally.q, quizN: tally.qN, recall: tally.r, recallN: tally.rN };
      tally.entry.result = res;
      var mk = marksFor(tally.entry.date, true); mk.result = res; mk.doneAt = Date.now(); saveMark(tally.entry.date);
      renderReadingList(); markNewReading();
    }
    return done;
  }
  /* 보기 고르기: 맞으면 correct, 틀리면 wrong, '모르겠어요'는 unknown 으로 알려 줘요. saved 는 { picked, status } */
  function choiceBlock(choices, answer, explain, onDone, saved) {
    var wrap = el('div', 'opts'), fbBox = el('div'), btns = [];
    var idk = el('button', 'idk', '모르겠어요'); idk.type = 'button';
    function reveal(c, status) {
      btns.forEach(function (x) {
        x.disabled = true;
        if (x.textContent === answer) x.classList.add('right');
        if (status === 'wrong' && x.textContent === c) x.classList.add('wrong');
      });
      idk.disabled = true; if (status === 'unknown') idk.classList.add('picked');
      var ok = status === 'correct';
      var f = el('p', 'fb ' + (ok ? 'ok' : 'no')); f.appendChild(el('b', '', ok ? '맞았어요' : '정답은 ' + answer));
      if (explain) f.appendChild(document.createTextNode(explain));
      fbBox.textContent = ''; fbBox.appendChild(f);
    }
    shuffle(choices).forEach(function (c) {
      var b = el('button', '', c); b.type = 'button';
      b.addEventListener('click', function () { var st = c === answer ? 'correct' : 'wrong'; reveal(c, st); onDone(st, c); });
      wrap.appendChild(b); btns.push(b);
    });
    idk.addEventListener('click', function () { reveal(null, 'unknown'); onDone('unknown', null); });
    wrap.appendChild(idk);
    if (saved && saved.status) reveal(saved.picked, saved.status);
    var box = el('div'); box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '10px';
    box.appendChild(wrap); box.appendChild(fbBox);
    return box;
  }
  var normAns = function (s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim(); };
  /* 떠올리기 한 문제(빈칸, 뜻 보고 쓰기, 예문 따라 쓰기)를 node 안에 그려요. onResult({ word, type, typed, status }) */
  function buildRecall(node, q, saved, onResult) {
    if (q.type === 'pattern') {
      var ex = el('div', 'pattern-ex'); var e1 = el('p', 'qsent', q.example || ''); e1.setAttribute('lang', 'en'); ex.appendChild(e1); ex.appendChild(el('p', 'hint', q.exampleKo || '')); node.appendChild(ex);
      node.appendChild(el('h2', '', q.prompt || ''));
      if (q.hint) node.appendChild(el('p', 'hint', '힌트: ' + q.hint));
      var ta = el('textarea', 'field'); ta.rows = 2; ta.setAttribute('aria-label', '영어로 쓰기'); ta.setAttribute('lang', 'en'); ta.placeholder = '영어로 쓰기'; node.appendChild(ta);
      var show = el('button', 'btn outline', '모범 답안 보기'); show.type = 'button';
      var box = el('div'); box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%';
      var selfBtns = [];
      var judge = function (b, ok) { selfBtns.forEach(function (x) { x.disabled = true; }); b.classList.add(ok ? 'right' : 'wrong'); };
      var showModel = function () {
        show.hidden = true; ta.disabled = true;
        var m = el('p', 'fb ok'); m.appendChild(el('b', '', '모범 답안')); var mt = el('span', '', q.model || ''); mt.setAttribute('lang', 'en'); m.appendChild(mt); box.appendChild(m);
        box.appendChild(el('p', 'hint', '내 문장과 비교해 보세요.'));
        var self = el('div', 'opts');
        [['맞게 썼어요', true], ['고칠 데가 있어요', false]].forEach(function (o) {
          var b = el('button', '', o[0]); b.type = 'button';
          b.addEventListener('click', function () { judge(b, o[1]); onResult({ word: q.word, type: 'pattern', typed: ta.value.trim(), status: o[1] ? 'correct' : 'wrong' }); });
          self.appendChild(b); selfBtns.push(b);
        });
        box.appendChild(self);
      };
      show.addEventListener('click', function () { if (!ta.value.trim()) { ta.focus(); return; } showModel(); });
      node.appendChild(show); node.appendChild(box);
      if (saved && saved.status) { ta.value = saved.typed || ''; showModel(); var ok0 = saved.status === 'correct'; judge(selfBtns[ok0 ? 0 : 1], ok0); }
      return;
    }
    node.appendChild(el('h2', '', q.type === 'ko2en' ? '이 뜻의 영어 단어는?' : '빈칸에 들어갈 단어는?'));
    var pp = el('p', 'qsent', q.prompt); if (q.type !== 'ko2en') pp.setAttribute('lang', 'en'); node.appendChild(pp);
    if (q.hint) node.appendChild(el('p', 'hint', (q.type === 'cloze' ? '뜻: ' : '힌트: ') + q.hint));
    var row = el('form', 'recall-row');
    var inp = el('input', 'field'); inp.type = 'text'; inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', '답'); inp.setAttribute('lang', 'en'); inp.placeholder = '영어로 쓰기';
    var go = el('button', 'btn primary', '확인'); go.type = 'submit';
    row.appendChild(inp); row.appendChild(go);
    var idk = el('button', 'text-btn', '모르겠어요'); idk.type = 'button';
    var fb = el('div');
    function showFb(status, typed) {
      inp.disabled = true; go.disabled = true; idk.hidden = true;
      var ok = status === 'correct';
      var f = el('p', 'fb ' + (ok ? 'ok' : 'no')); f.appendChild(el('b', '', ok ? '맞았어요' : '정답은 ' + q.answer));
      if (!ok && typed) f.appendChild(el('span', 'mine', '내 답: ' + typed));
      if (q.explain) f.appendChild(document.createTextNode(q.explain));
      fb.textContent = ''; fb.appendChild(f);
    }
    var accept = (q.accept && q.accept.length ? q.accept : [q.answer]).map(normAns);
    row.addEventListener('submit', function (e) {
      e.preventDefault();
      var typed = inp.value.trim(); if (!typed) { inp.focus(); return; }
      var st = accept.indexOf(normAns(typed)) !== -1 ? 'correct' : 'wrong';
      showFb(st, typed); onResult({ word: q.word, type: q.type, typed: typed, status: st });
    });
    idk.addEventListener('click', function () { showFb('unknown', ''); onResult({ word: q.word, type: q.type, typed: '', status: 'unknown' }); });
    node.appendChild(row); node.appendChild(idk); node.appendChild(fb);
    if (saved && saved.status) { inp.value = saved.typed || ''; showFb(saved.status, saved.typed); }
  }
  var rdSteps = [], rdIdx = 0;
  function rdStage(name) {
    ['read', 'quiz', 'done'].forEach(function (n) { $('rd-stage-' + n).hidden = n !== name; });
    if (name !== 'read') hideWord();
  }
  function rdDots() {
    var box = $('rd-dots'); box.textContent = '';
    rdSteps.forEach(function (st, i) { box.appendChild(el('i', i === rdIdx ? 'cur' : st.answered ? 'done' : '')); });
    box.setAttribute('aria-label', (rdIdx + 1) + ' / ' + rdSteps.length + '번째 문제');
  }
  function rdShow(i) {
    rdIdx = i;
    var q = $('rd-q'); q.textContent = '';
    q.appendChild(rdSteps[i].node);
    rdDots();
    var next = $('rd-next');
    next.hidden = !rdSteps[i].answered;
    var rest = rdSteps.some(function (st, k) { return k !== i && !st.answered; });
    next.textContent = rest || (tally && tally.reviewing && i < rdSteps.length - 1) ? '다음' : '결과 보기';
  }
  function rdAnswered(i) {
    rdSteps[i].answered = true;
    updateTally();
    if (rdIdx === i) { $('rd-next').hidden = false; rdShow(i); $('rd-next').focus({ preventScroll: true }); }
  }
  function rdNext() {
    var after = -1;
    for (var k = rdIdx + 1; k < rdSteps.length; k++) if (!rdSteps[k].answered) { after = k; break; }
    if (after === -1) for (var k2 = 0; k2 < rdSteps.length; k2++) if (!rdSteps[k2].answered) { after = k2; break; }
    if (after === -1) {
      if (rdIdx < rdSteps.length - 1 && tally && tally.reviewing) { rdShow(rdIdx + 1); return; }
      rdFinish(); return;
    }
    rdShow(after);
  }
  function rdFinish() {
    if (tally) tally.reviewing = false;
    $('rd-result').textContent = resultText(tally.entry) || '';
    rdStage('done');
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
  }
  function renderReadingDetail(key) {
    if (!R) return false;
    var r = findReading(key); if (!r) return false;
    hideWord();
    $('rd-date').textContent = dayLabel(parseYmd(r.date));
    $('rd-h').textContent = '아침 읽기';
    $('rd-sub').textContent = r.articles.length + '편, 약 ' + r.wordCount + '단어, 약 ' + readMinutes(r) + '분';
    var gg = $('rd-gloss'); gg.textContent = '';
    var gk = Object.keys(r.gloss);
    $('rd-words').hidden = !gk.length;
    $('rd-words').open = false;
    $('rd-words-sum').textContent = '오늘의 단어 ' + gk.length + '개';
    gk.forEach(function (k) {
      var g = r.gloss[k], c = el('div', 'gcard');
      var w = el('span', 'gw', k); w.setAttribute('lang', 'en'); if (g.isNew) w.appendChild(el('span', 'new-w', '새 단어')); c.appendChild(w);
      c.appendChild(el('span', 'gk', g.ko));
      if (g.parts) c.appendChild(el('span', 'gp', g.parts));
      if (g.note) c.appendChild(el('span', 'gn', g.note));
      gg.appendChild(c);
    });
    var mk = marksFor(r.date, false) || {}, mkq = mk.keyq || {}, mq = mk.quiz || {}, mr = mk.recall || {};
    function rec(section, id, data) { var m = marksFor(r.date, true); m[section][id] = data; saveMark(r.date); }
    tally = { entry: r, saved: !!mk.result, reviewing: false, k: 0, kd: 0, kN: r.articles.filter(function (a) { return a.keyQ; }).length, q: 0, qd: 0, qN: r.quiz.length, r: 0, rd: 0, rN: r.recall.length };
    rdSteps = [];
    function step(kind, build) {
      var idx = rdSteps.length, node = el('div', 'qitem');
      node.appendChild(el('p', 'qkind', kind));
      var st = { node: node, answered: false };
      rdSteps.push(st);
      build(node, function () { rdAnswered(idx); }, st);
    }

    var ab = $('rd-articles'); ab.textContent = '';
    r.articles.forEach(function (a) {
      var art = el('article', 'art'); art.setAttribute('data-a', a.id);
      art.appendChild(el('span', 'art-tag', a.tag));
      var h = el('h2', '', a.title); h.setAttribute('lang', 'en'); art.appendChild(h);
      a.paragraphs.forEach(function (p) { var pe = el('p'); pe.setAttribute('lang', 'en'); pe.appendChild(richText(p, r.gloss, true)); art.appendChild(pe); });
      if (a.source) art.appendChild(el('span', 'src', '출처: ' + a.source));
      ab.appendChild(art);
      if (a.keyQ) step('핵심 질문', function (node, done, st) {
        node.appendChild(el('h2', '', a.keyQ.question));
        var pk = mkq[a.id];
        if (pk && pk.status) { tally.kd += 1; if (pk.status === 'correct') tally.k += 1; st.answered = true; }
        node.appendChild(choiceBlock(a.keyQ.choices, a.keyQ.answer, a.keyQ.explain, function (status, c) {
          tally.kd += 1; if (status === 'correct') tally.k += 1;
          rec('keyq', a.id, { word: a.keyQ.hingesOn || '', status: status, picked: c });
          done();
        }, pk));
      });
    });

    r.quiz.forEach(function (q, i) {
      step('뜻 고르기', function (node, done, st) {
        node.appendChild(el('h2', '', '표시한 단어의 뜻은?'));
        var s2 = el('p', 'qsent'); s2.setAttribute('lang', 'en'); s2.appendChild(richText(q.sentence, r.gloss, false, q.word)); node.appendChild(s2);
        var qid = q.id || 'q' + (i + 1), pq = mq[qid];
        if (pq && pq.status) { tally.qd += 1; if (pq.status === 'correct') tally.q += 1; st.answered = true; }
        node.appendChild(choiceBlock(q.choices, q.answer, q.explain, function (status, c) {
          tally.qd += 1; if (status === 'correct') tally.q += 1;
          rec('quiz', qid, { word: q.word, status: status, picked: c });
          done();
        }, pq));
      });
    });

    r.recall.forEach(function (q, i) {
      var rid = q.id || 'r' + (i + 1), pr = mr[rid];
      step(q.type === 'pattern' ? '예문 따라 쓰기' : '떠올리기', function (node, done, st) {
        if (pr && pr.status) { tally.rd += 1; if (pr.status === 'correct') tally.r += 1; st.answered = true; }
        buildRecall(node, q, pr, function (res) {
          tally.rd += 1; if (res.status === 'correct') tally.r += 1;
          rec('recall', rid, res);
          done();
        });
      });
    });

    var ro = $('rd-roots'); ro.textContent = '';
    [['en', '영어 어근'], ['ko', '한자어']].forEach(function (p) {
      var x = r.roots && r.roots[p[0]]; if (!x) return;
      var c = el('div', 'root-card');
      c.appendChild(el('span', 'tagc', p[1] + (x.part && p[0] === 'en' ? ', ' + x.part : '')));
      var rf = el('span', 'rf', x.form); if (p[0] === 'en') rf.setAttribute('lang', 'en'); c.appendChild(rf);
      c.appendChild(el('span', 'rm', x.meaning));
      var ul = el('ul');
      (x.examples || []).forEach(function (ex) { var li = el('li'); li.appendChild(el('b', '', ex.word)); li.appendChild(el('span', '', ex.ko)); li.appendChild(el('em', '', ex.split)); ul.appendChild(li); });
      c.appendChild(ul);
      if (x.tip) c.appendChild(el('p', 'hint', x.tip));
      ro.appendChild(c);
    });

    markSavedWords();
    $('rd-go-quiz').hidden = !rdSteps.length;
    var allDone = rdSteps.length && rdSteps.every(function (st) { return st.answered; });
    if (allDone) { updateTally(); $('rd-result').textContent = resultText(r) || ''; rdStage('done'); }
    else rdStage('read');
    return true;
  }
  if ($('rd-go-quiz')) {
    $('rd-go-quiz').addEventListener('click', function () {
      var first = 0; for (var k = 0; k < rdSteps.length; k++) if (!rdSteps[k].answered) { first = k; break; }
      rdStage('quiz'); rdShow(first);
      window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
    });
    $('rd-next').addEventListener('click', function () { rdNext(); window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' }); });
    $('rd-back-read').addEventListener('click', function () { rdStage('read'); window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' }); });
    $('rd-reread').addEventListener('click', function () { rdStage('read'); window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' }); });
    $('rd-review').addEventListener('click', function () { if (tally) tally.reviewing = true; rdStage('quiz'); rdShow(0); window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' }); });
  }
  if (wordCard) {
    $('wc-close').addEventListener('click', hideWord);
    $('wc-save').addEventListener('click', saveUnknownWord);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideWord(); });
  }

  /* =========================================================
     연습 화면: 반복 테스트, 단어 조각, 주간 점검
     ========================================================= */
  var nk = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); };
  var nw = function (s) { return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); };
  function shortDate(k) { var d = parseYmd(k); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function goTop() { window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' }); }
  function emptyMsg(box, text) { box.appendChild(el('p', 'empty', text)); }

  /* 배운 단어 조각: roots.json 과 날짜 파일의 roots 를 날짜별로 모아요(오래된 것 먼저). */
  function rootLists() {
    var out = { en: [], ko: [] };
    ['en', 'ko'].forEach(function (t) {
      var byDate = {};
      ((R && R.roots && R.roots[t]) || []).forEach(function (x) { if (x && x.form && x.date) byDate[x.date] = x; });
      readings.forEach(function (r) { var x = r.roots && r.roots[t]; if (x && x.form && !byDate[r.date]) byDate[r.date] = Object.assign({ date: r.date }, x); });
      out[t] = Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
    });
    return out;
  }

  /* ---------- 반복 테스트 ---------- */
  var DMODES = {
    mc: ['영어 보고 뜻 고르기', '영어 단어를 보고 알맞은 뜻을 5개 중에서 골라요.'],
    parts: ['조각 맞춰 쓰기', '뜻을 보고 단어 조각을 하나씩 채워 써요. 배운 조각은 뜻을 숨겨요.'],
    write: ['뜻 보고 통째로 쓰기', '한국어 뜻만 보고 영어 철자를 처음부터 끝까지 써요.']
  };
  var VARIANTS = { con: ['com', 'co', 'col', 'cor'], sub: ['sus', 'suc', 'suf', 'sup'], mit: ['miss', 'mis'], plic: ['ply', 'pli', 'plex'], able: ['ible'], spect: ['spic'], ology: ['logy'], struct: ['stru'] };
  var drill = { range: '2', round: null };
  try { drill.range = localStorage.getItem('mb-drange') === '7' ? '7' : '2'; } catch (e) {}
  function learnedSet() {
    var s = {};
    rootLists().en.forEach(function (r) { var f = nk(r.form); if (!f) return; s[f] = 1; (VARIANTS[f] || []).forEach(function (v) { s[v] = 1; }); });
    return s;
  }
  function parsePieces(word, parts) {
    if (!parts) return null;
    var head = String(parts).split('→')[0];
    if (head.indexOf('+') === -1) return null;
    var ps = head.split('+').map(function (t) { return t.trim(); }).filter(Boolean).map(function (t) {
      var m = t.match(/^([A-Za-z][A-Za-z\- ]*?)\s*(?:\((.*)\))?\s*$/); return m ? { form: m[1].trim(), mean: (m[2] || '').trim() } : null;
    });
    if (!ps.length || ps.some(function (p) { return !p; })) return null;
    if (ps.map(function (p) { return nk(p.form); }).join('') !== nk(word)) return null;
    var L = learnedSet(); ps.forEach(function (p) { p.learned = !!L[nk(p.form)]; });
    return ps;
  }
  function drillDays() { return readings.slice(0, drill.range === '7' ? 7 : 2); }
  function drillPool() {
    var map = {};
    drillDays().forEach(function (r) {
      Object.keys(r.gloss || {}).forEach(function (l) {
        var g = r.gloss[l]; if (map[l] || !g || !g.ko) return;
        map[l] = { word: l, ko: g.ko, parts: g.parts || '', note: g.note || '', idiom: /\s/.test(l),
          alts: (g.choices || []).filter(function (c) { return c && c !== g.ko && c !== g.answer; }) };
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function drillLog() {
    var tk = ymd(new Date());
    if (!store.drill || store.drill.date !== tk) store.drill = { date: tk, rounds: [] };
    return store.drill;
  }
  function makeChoices(it, pool) {
    var out = [it.ko];
    function add(c) { if (c && out.indexOf(c) === -1 && out.length < 5) out.push(c); }
    shuffle(it.alts || []).forEach(add);
    shuffle(pool.filter(function (p) { return p.word !== it.word; }).map(function (p) { return p.ko; })).forEach(add);
    shuffle(((R && R.wordbook) || []).map(function (w) { return w.ko; })).forEach(add);
    return shuffle(out);
  }
  function renderDrill() {
    var box = $('dr-box'); if (!box) return;
    if (drill.round && !drill.round.over) { renderDrillQ(); return; }
    drill.round = null;
    box.textContent = '';
    if (!R) { emptyMsg(box, '읽기 자료를 불러오는 중이에요…'); return; }
    var seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '단어 범위');
    [['2', '오늘 + 어제'], ['7', '최근 1주']].forEach(function (o) {
      var b = el('button', '', o[1]); b.type = 'button'; b.setAttribute('aria-pressed', drill.range === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { drill.range = o[0]; try { localStorage.setItem('mb-drange', o[0]); } catch (e) {} renderDrill(); });
      seg.appendChild(b);
    });
    box.appendChild(seg);
    var pool = drillPool(), log = drillLog(), rounds = log.rounds || [];
    var info = '단어 ' + pool.length + '개, 읽기 ' + drillDays().map(function (r) { return shortDate(r.date); }).join(', ');
    if (rounds.length) info += '. 오늘 ' + rounds.length + '번 했어요(평균 ' + Math.round(rounds.reduce(function (a, r) { return a + r.c / r.n; }, 0) / rounds.length * 100) + '%)';
    box.appendChild(el('p', 'muted center dr-info', info));
    if (pool.length < 3) { emptyMsg(box, '단어가 아직 부족해요. 글이 더 올라오면 다시 열어 주세요.'); return; }
    var list = el('div', 'choice-list dr-modes');
    Object.keys(DMODES).forEach(function (k) {
      var b = el('button'); b.type = 'button';
      b.appendChild(el('b', '', DMODES[k][0])); b.appendChild(el('span', '', DMODES[k][1]));
      b.addEventListener('click', function () { startRound(k, null); });
      list.appendChild(b);
    });
    box.appendChild(list);
    if (rounds.length) {
      box.appendChild(el('h2', 'sec-h', '오늘 기록'));
      var ul = el('ul', 'dr-log');
      rounds.slice(-8).reverse().forEach(function (r) { ul.appendChild(el('li', '', DMODES[r.mode][0] + (r.retry ? ', 틀린 것 다시' : '') + ': ' + r.c + ' / ' + r.n)); });
      box.appendChild(ul);
    }
  }
  function startRound(mode, items) {
    var pool = drillPool();
    var list = items ? items.slice() : shuffle(pool).slice(0, 10);
    drill.round = { mode: mode, retry: !!items, i: 0, res: [], over: false,
      qs: shuffle(list).map(function (it) { return { it: it, choices: mode === 'mc' ? makeChoices(it, pool) : null, pieces: mode === 'parts' ? parsePieces(it.word, it.parts) : null }; }) };
    renderDrillQ(); goTop();
  }
  function renderDrillQ() {
    var box = $('dr-box'), rd = drill.round;
    if (rd.i >= rd.qs.length) { renderDrillEnd(); return; }
    var q = rd.qs[rd.i], it = q.it;
    box.textContent = '';
    var top = el('div', 'dr-top'); top.appendChild(el('span', '', DMODES[rd.mode][0] + (rd.retry ? ', 틀린 것 다시' : ''))); top.appendChild(el('span', '', (rd.i + 1) + ' / ' + rd.qs.length));
    box.appendChild(top);
    var bar = el('div', 'q-bar'), bi = el('i'); bi.style.width = (100 * rd.i / rd.qs.length) + '%'; bar.appendChild(bi); box.appendChild(bar);
    var node = el('div', 'qitem dr-q'); box.appendChild(node);
    var res = el('div', 'dr-res');
    if (rd.mode === 'mc') {
      var w = el('p', 'dr-word', it.word); w.setAttribute('lang', 'en'); node.appendChild(w);
      if (it.idiom) node.appendChild(el('p', 'hint', '관용어구'));
      var opts = el('div', 'opts'), btns = [];
      q.choices.forEach(function (c) { var b = el('button', '', c); b.type = 'button'; opts.appendChild(b); btns.push(b); });
      var idk = el('button', 'idk', '모르겠어요'); idk.type = 'button'; opts.appendChild(idk);
      function pick(c, b) {
        btns.concat([idk]).forEach(function (x) { x.disabled = true; if (x.textContent === it.ko && x !== idk) x.classList.add('right'); });
        var st = c === null ? 'unknown' : c === it.ko ? 'correct' : 'wrong';
        if (st === 'wrong') b.classList.add('wrong'); if (st === 'unknown') idk.classList.add('picked');
        finishQ(st, c, false, res);
      }
      btns.forEach(function (b) { b.addEventListener('click', function () { pick(b.textContent, b); }); });
      idk.addEventListener('click', function () { pick(null, idk); });
      node.appendChild(opts);
    } else {
      node.appendChild(el('p', 'dr-ko', it.ko));
      if (it.idiom) node.appendChild(el('p', 'hint', '관용어구' + (rd.mode === 'write' || !q.pieces ? ', 단어 사이는 띄어 쓰세요' : ', 칸마다 단어 하나씩')));
      var ins = [];
      var form = el('form', 'dr-form');
      if (rd.mode === 'parts' && q.pieces) {
        var pcs = el('div', 'pieces');
        q.pieces.forEach(function (p, i) {
          if (i) pcs.appendChild(el('span', 'plus', '+'));
          var pc = el('div', 'pc');
          var inp = el('input', 'field'); inp.type = 'text'; inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false; inp.setAttribute('lang', 'en');
          inp.setAttribute('aria-label', (i + 1) + '번째 조각'); inp.style.width = 'calc(' + Math.max(3, p.form.length + 1) + 'ch + 28px)';
          pc.appendChild(inp); pc.appendChild(el('small', p.learned ? 'lr' : '', p.learned ? '배운 조각' : (p.mean || ' ')));
          pcs.appendChild(pc); ins.push(inp);
        });
        form.appendChild(pcs);
      } else {
        if (rd.mode === 'parts') node.appendChild(el('p', 'hint', '조각으로 나누기 어려운 표현이에요. 통째로 써 보세요.'));
        var one = el('input', 'field dr-one'); one.type = 'text'; one.autocomplete = 'off'; one.autocapitalize = 'off'; one.spellcheck = false; one.setAttribute('lang', 'en'); one.setAttribute('aria-label', '영어로 쓰기'); one.placeholder = '영어로 쓰기';
        form.appendChild(one); ins.push(one);
      }
      var acts = el('div', 'dr-acts');
      var go = el('button', 'btn primary', '확인'); go.type = 'submit';
      var idk2 = el('button', 'text-btn', '모르겠어요'); idk2.type = 'button';
      acts.appendChild(go); acts.appendChild(idk2);
      var hinted = false, hintP = el('p', 'hint');
      if (rd.mode === 'write') {
        var hb = el('button', 'text-btn', '힌트'); hb.type = 'button';
        hb.addEventListener('click', function () { hinted = true; hb.disabled = true; var ww = it.word; hintP.textContent = ww[0] + '(으)로 시작, ' + ww.replace(/\s/g, '').length + '글자' + (/\s/.test(ww) ? ', ' + ww.split(/\s+/).length + '단어' : ''); });
        acts.appendChild(hb);
      }
      form.appendChild(acts); node.appendChild(form); node.appendChild(hintP);
      function check(isIdk) {
        if (go.disabled) return;
        var ok = false, typed = '';
        if (rd.mode === 'parts' && q.pieces) {
          if (!isIdk && ins.every(function (x) { return !x.value.trim(); })) { ins[0].focus(); return; }
          typed = ins.map(function (x) { return x.value.trim(); }).join(' + ');
          var all = true;
          ins.forEach(function (x, i) { var r2 = nk(x.value) === nk(q.pieces[i].form); all = all && r2; x.classList.add(r2 ? 'r' : 'x'); if (!r2) x.value = q.pieces[i].form; x.disabled = true; });
          ok = all && !isIdk;
        } else {
          typed = ins[0].value.trim(); if (!isIdk && !typed) { ins[0].focus(); return; }
          ok = !isIdk && nw(typed) === nw(it.word); ins[0].disabled = true;
        }
        go.disabled = true; idk2.disabled = true;
        finishQ(ok ? 'correct' : (isIdk ? 'unknown' : 'wrong'), typed, hinted, res);
      }
      form.addEventListener('submit', function (e) { e.preventDefault(); check(false); });
      idk2.addEventListener('click', function () { check(true); });
      setTimeout(function () { if (ins[0]) ins[0].focus({ preventScroll: true }); }, 50);
    }
    node.appendChild(res);
  }
  function finishQ(status, typed, hinted, res) {
    var rd = drill.round, q = rd.qs[rd.i], it = q.it, ok = status === 'correct';
    rd.res.push({ word: it.word, status: status, typed: typed || null, hint: !!hinted });
    res.textContent = '';
    var f = el('div', 'fb ' + (ok ? 'ok' : 'no'));
    f.appendChild(el('b', '', ok ? '맞았어요' : (status === 'unknown' ? '이렇게 기억해요' : '아쉬워요')));
    var line = el('p', 'dr-ans'); var lw = el('span', 'w2', it.word); lw.setAttribute('lang', 'en'); line.appendChild(lw); line.appendChild(document.createTextNode(' ' + it.ko)); f.appendChild(line);
    if (it.parts) f.appendChild(el('p', 'hint', it.parts));
    if (!ok && it.note) f.appendChild(el('p', 'hint', it.note));
    res.appendChild(f);
    var nx = el('button', 'btn primary lg', rd.i + 1 < rd.qs.length ? '다음' : '결과 보기'); nx.type = 'button';
    var cur = rd.i;
    function next() { if (drill.round !== rd || rd.i !== cur) return; rd.i += 1; renderDrillQ(); goTop(); }
    nx.addEventListener('click', next);
    var wrap = el('div', 'center-actions tight'); wrap.appendChild(nx); res.appendChild(wrap);
    nx.focus({ preventScroll: true });
  }
  function renderDrillEnd() {
    var rd = drill.round, box = $('dr-box');
    var c = rd.res.filter(function (r) { return r.status === 'correct'; }).length, n = rd.res.length;
    var wrong = rd.qs.filter(function (q, i) { return rd.res[i].status !== 'correct'; }).map(function (q) { return q.it; });
    if (!rd.over) {
      rd.over = true;
      var log = drillLog(); log.rounds.push({ mode: rd.mode, range: drill.range, retry: rd.retry, n: n, c: c, at: new Date().toISOString() });
      saveStore();
    }
    box.textContent = '';
    var head = el('div', 'done-head');
    head.appendChild(el('p', 'kicker', DMODES[rd.mode][0] + (rd.retry ? ', 틀린 것 다시' : '')));
    var sc = el('h2', 'dr-sum', c + ' / ' + n); head.appendChild(sc);
    head.appendChild(el('p', 'muted', Math.round(100 * c / n) + '%' + (c === n ? ', 모두 맞혔어요' : '')));
    box.appendChild(head);
    if (wrong.length) {
      box.appendChild(el('h2', 'sec-h', '틀리거나 모른 단어 ' + wrong.length + '개'));
      var ul = el('ul', 'wlist');
      wrong.forEach(function (w) {
        var li = el('li'); var ww = el('span', 'ww', w.word); ww.setAttribute('lang', 'en'); li.appendChild(ww);
        var k = el('span', 'wk', w.ko); if (w.parts) k.appendChild(el('small', '', w.parts)); li.appendChild(k); li.appendChild(el('span'));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    var acts = el('div', 'center-actions');
    if (wrong.length) { var a1 = el('button', 'btn primary lg', '틀린 것만 다시'); a1.type = 'button'; a1.addEventListener('click', function () { startRound(rd.mode, wrong); }); acts.appendChild(a1); }
    var a2 = el('button', wrong.length ? 'text-btn' : 'btn primary lg', '새로 섞어서 다시'); a2.type = 'button'; a2.addEventListener('click', function () { startRound(rd.mode, null); }); acts.appendChild(a2);
    var a3 = el('button', 'text-btn', '다른 유형 고르기'); a3.type = 'button'; a3.addEventListener('click', function () { drill.round = null; renderDrill(); goTop(); }); acts.appendChild(a3);
    box.appendChild(acts);
  }

  /* ---------- 단어 조각 ---------- */
  var rtTrack = 'en';
  var RSTAT = { correct: '맞힘', wrong: '틀림', unknown: '모름', unsure: '헷갈림' };
  function rootMarks(date, track, create) {
    var m = marksFor(date, create); if (!m) return {};
    if (!m.roots || typeof m.roots !== 'object') { if (!create) return {}; m.roots = {}; }
    if (!m.roots[track]) { if (!create) return {}; m.roots[track] = {}; }
    return m.roots[track];
  }
  function splitNode(split, form) {
    var key = String(form || '').replace(/-/g, '').toLowerCase(), span = el('span', 'rsplit');
    String(split || '').split('+').forEach(function (p, i) {
      if (i) span.appendChild(document.createTextNode(' + '));
      var t = p.trim(), head = t.replace(/\(.*\)$/, '').replace(/-/g, '').trim().toLowerCase();
      span.appendChild(key && head === key ? el('b', '', t) : document.createTextNode(t));
    });
    return span;
  }
  function rootCardFull(x, label) {
    var c = el('div', 'root-card big');
    c.appendChild(el('span', 'tagc', label + (x.part && rtTrack === 'en' ? ', ' + x.part : '') + (x.date ? ', ' + shortDate(x.date) : '')));
    var rf = el('span', 'rf', x.form); if (rtTrack === 'en') rf.setAttribute('lang', 'en'); c.appendChild(rf);
    c.appendChild(el('span', 'rm', x.meaning || ''));
    if (x.origin) c.appendChild(el('p', 'hint', x.origin));
    var ul = el('ul');
    (x.examples || []).forEach(function (ex) {
      var li = el('li'); li.appendChild(el('b', '', ex.word)); li.appendChild(el('span', '', ex.ko));
      var em = el('em'); em.appendChild(splitNode(ex.split, x.form)); li.appendChild(em);
      if (ex.sentence) { var s = el('em', 'ex-s', ex.sentence); if (rtTrack === 'en') s.setAttribute('lang', 'en'); li.appendChild(s); }
      ul.appendChild(li);
    });
    c.appendChild(ul);
    if (x.tip) c.appendChild(el('p', 'hint', x.tip));
    return c;
  }
  function promptNode(text) {
    var h = el('h2'), parts = String(text || '').split(/'([^']+)'/);
    parts.forEach(function (p, i) { h.appendChild(i % 2 ? el('b', 'qmark', "'" + p + "'") : document.createTextNode(p)); });
    return h;
  }
  function renderRoots() {
    var box = $('rt-box'); if (!box) return;
    document.querySelectorAll('[data-track]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-track') === rtTrack ? 'true' : 'false'); });
    box.textContent = '';
    if (!R) { emptyMsg(box, '읽기 자료를 불러오는 중이에요…'); return; }
    var list = rootLists()[rtTrack], today = list[list.length - 1];
    var label = rtTrack === 'en' ? '오늘의 영어 조각' : '오늘의 한자어';
    if (today) box.appendChild(rootCardFull(today, label)); else emptyMsg(box, '오늘의 조각을 기다리는 중이에요. 아침 7시 반쯤 올라와요.');

    var qday = readings.filter(function (r) { return r.rootQuiz && r.rootQuiz[rtTrack] && r.rootQuiz[rtTrack].length; })[0];
    box.appendChild(el('h2', 'sec-h', rtTrack === 'en' ? '퀴즈: 단어 보고 뜻 맞히기' : '퀴즈: 뜻 맞히기와 같은 뜻 글자 찾기'));
    if (!qday) emptyMsg(box, '퀴즈를 기다리는 중이에요.');
    else {
      var qs = qday.rootQuiz[rtTrack], marks = rootMarks(qday.date, rtTrack, false);
      var score = el('p', 'muted center'); box.appendChild(score);
      var updScore = function () {
        var mk = rootMarks(qday.date, rtTrack, false);
        var done = qs.filter(function (q) { return mk[q.id]; }).length, right = qs.filter(function (q) { return mk[q.id] && mk[q.id].status === 'correct'; }).length;
        score.textContent = shortDate(qday.date) + ' 퀴즈, ' + done + ' / ' + qs.length + ' 풀었어요' + (done ? ', ' + right + '개 맞힘' : '');
      };
      updScore();
      var ql = el('div', 'qlist');
      qs.forEach(function (q, i) {
        var node = el('div', 'qitem');
        node.appendChild(el('p', 'qkind', (i + 1) + ' / ' + qs.length + (q.isReview ? ', 다시 보기' : '')));
        if (q.type === 'pick') node.appendChild(promptNode(q.word));
        else { var w = el('p', 'dr-word sm', q.word); if (rtTrack === 'en') w.setAttribute('lang', 'en'); node.appendChild(w); }
        if (q.hint) node.appendChild(el('p', 'hint', '힌트: ' + q.hint));
        var ex = (q.split ? q.split + ' → ' : '') + (q.explain || q.answer) + (q.rootForm ? ' (조각 ' + q.rootForm + ')' : '');
        var saved = marks[q.id];
        var disp = saved ? { picked: saved.picked, status: saved.picked === q.answer ? 'correct' : (saved.picked ? 'wrong' : 'unknown') } : null;
        var toggle = el('button', 'text-btn small', ''); toggle.type = 'button';
        var setToggle = function () {
          var st = (rootMarks(qday.date, rtTrack, false)[q.id] || {}).status;
          toggle.hidden = !st;
          toggle.textContent = st === 'correct' ? '맞혔지만 헷갈려요, 복습에 넣기' : '이제 알아요, 복습에서 빼기';
        };
        node.appendChild(choiceBlock(q.choices || [], q.answer, ' ' + ex, function (status, c) {
          var mk = rootMarks(qday.date, rtTrack, true); mk[q.id] = { status: status, picked: c, at: new Date().toISOString() };
          saveMark(qday.date); setToggle(); updScore(); renderRootReview();
        }, disp));
        toggle.addEventListener('click', function () {
          var mk = rootMarks(qday.date, rtTrack, true), cur = mk[q.id]; if (!cur) return;
          cur.status = cur.status === 'correct' ? 'unsure' : 'correct'; cur.at = new Date().toISOString();
          saveMark(qday.date); setToggle(); updScore(); renderRootReview();
          toast(cur.status === 'unsure' ? '복습에 넣었어요.' : '복습에서 뺐어요.');
        });
        node.appendChild(toggle); setToggle();
        ql.appendChild(node);
      });
      box.appendChild(ql);
    }

    box.appendChild(el('h2', 'sec-h', '복습할 단어'));
    var rv = el('div', 'rt-review'); box.appendChild(rv);
    renderRootReview();

    var past = list.slice(0, -1).reverse();
    box.appendChild(el('h2', 'sec-h', '지금까지 배운 조각 ' + past.length + '개'));
    if (!past.length) emptyMsg(box, '아직 이전에 배운 조각이 없어요.');
    var pl = el('div', 'past-list');
    past.forEach(function (x) {
      var d = el('details', 'past');
      var sm = el('summary'); var f = el('b', '', x.form); if (rtTrack === 'en') f.setAttribute('lang', 'en'); sm.appendChild(f); sm.appendChild(el('span', '', x.meaning || '')); sm.appendChild(el('small', '', shortDate(x.date)));
      d.appendChild(sm);
      var ul = el('ul');
      (x.examples || []).forEach(function (ex) { var li = el('li'); li.appendChild(el('b', '', ex.word)); li.appendChild(el('span', '', ex.ko)); var em = el('em'); em.appendChild(splitNode(ex.split, x.form)); li.appendChild(em); ul.appendChild(li); });
      d.appendChild(ul);
      if (x.tip) d.appendChild(el('p', 'hint', x.tip));
      pl.appendChild(d);
    });
    box.appendChild(pl);
  }
  function renderRootReview() {
    var rv = document.querySelector('#rt-box .rt-review'); if (!rv) return;
    rv.textContent = '';
    var seen = {}, rows = [];
    readings.forEach(function (r) {
      var qs = (r.rootQuiz && r.rootQuiz[rtTrack]) || [], mk = rootMarks(r.date, rtTrack, false);
      qs.forEach(function (q) {
        var m = mk[q.id]; if (!m || ['wrong', 'unknown', 'unsure'].indexOf(m.status) === -1) return;
        var k = String(q.word).toLowerCase(); if (seen[k]) return; seen[k] = 1; rows.push({ q: q, st: m.status });
      });
    });
    if (!rows.length) { rv.appendChild(el('p', 'empty', '틀리거나 모른 단어가 여기에 모이고, 다음 날 퀴즈에 다시 나와요.')); return; }
    var ul = el('ul', 'wlist');
    rows.forEach(function (x) {
      var li = el('li');
      li.appendChild(el('span', 'ww', x.q.type === 'pick' ? x.q.answer : x.q.word));
      li.appendChild(el('span', 'wk', (x.q.split ? x.q.split + ' → ' : '') + (x.q.explain || x.q.answer)));
      li.appendChild(el('span', 'spill ' + (x.st === 'unsure' ? 'shaky' : ''), RSTAT[x.st]));
      ul.appendChild(li);
    });
    rv.appendChild(ul);
  }
  document.querySelectorAll('[data-track]').forEach(function (b) {
    b.addEventListener('click', function () { rtTrack = b.getAttribute('data-track'); renderRoots(); });
  });

  /* ---------- 주간 점검 ---------- */
  var SEC = { recall: '떠올리기', recog: '뜻 고르기', reading: '읽기', writing: '쓰기', level: '단어 수준' };
  function latestTest() {
    var r = readings.filter(function (x) { return x.test && x.test.items && x.test.items.length; })[0];
    return r ? { date: r.date, T: r.test } : null;
  }
  function secOf(q) { return q.section || (q.type === 'mc' ? 'recog' : (q.type === 'write' || q.type === 'pattern') ? 'writing' : 'recall'); }
  function testSummary(T, items) {
    var by = {};
    T.items.forEach(function (q) { var s = secOf(q); by[s] = by[s] || { c: 0, n: 0 }; by[s].n += 1; if (items[q.id] && items[q.id].status === 'correct') by[s].c += 1; });
    var all = T.items.length, c = T.items.filter(function (q) { return items[q.id] && items[q.id].status === 'correct'; }).length, done = T.items.filter(function (q) { return items[q.id]; }).length;
    return { by: by, all: all, c: c, done: done, pct: all ? Math.round(100 * c / all) : 0 };
  }
  function testDone(L) { var m = L && marksFor(L.date, false); return !!(m && m.test && m.test.summary && m.test.summary.done === L.T.items.length); }
  function sentenceWithWord(s, word) {
    var p = el('p', 'qsent'); p.setAttribute('lang', 'en');
    if (/\{\{/.test(s)) { p.appendChild(richText(s, {}, false, word)); return p; }
    var w = String(word || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), m = w ? new RegExp('\\b(' + w + ')\\b', 'i').exec(s) : null;
    if (!m) { p.textContent = s; return p; }
    p.appendChild(document.createTextNode(s.slice(0, m.index))); p.appendChild(el('mark', '', m[1])); p.appendChild(document.createTextNode(s.slice(m.index + m[1].length)));
    return p;
  }
  function renderTest() {
    var box = $('ts-box'); if (!box) return;
    box.textContent = ''; $('ts-score').textContent = ''; $('ts-date').textContent = '';
    if (!R) { emptyMsg(box, '읽기 자료를 불러오는 중이에요…'); return; }
    var L = latestTest();
    if (!L) { emptyMsg(box, '아직 점검이 없어요. 일요일 아침에 올라와요.'); return; }
    var T = L.T;
    $('ts-date').textContent = dayLabel(parseYmd(L.date));
    var mk0 = marksFor(L.date, false), saved = (mk0 && mk0.test && mk0.test.items) || {};
    function upd() {
      var m = marksFor(L.date, false), items = (m && m.test && m.test.items) || {}, s = testSummary(T, items);
      $('ts-score').textContent = s.done + ' / ' + s.all + ' 풀었어요, ' + s.c + '개 맞힘(' + s.pct + '%)' +
        (s.done === s.all ? '. ' + Object.keys(s.by).map(function (k) { return (SEC[k] || k) + ' ' + s.by[k].c + '/' + s.by[k].n; }).join(', ') : '');
    }
    function save(q, rec) {
      var m = marksFor(L.date, true);
      if (!m.test || typeof m.test !== 'object') m.test = {};
      if (!m.test.items || typeof m.test.items !== 'object') m.test.items = {};
      m.test.items[q.id] = Object.assign({ section: secOf(q), type: q.type, at: new Date().toISOString() }, rec);
      m.test.summary = testSummary(T, m.test.items);
      saveMark(L.date); upd(); renderGlance();
    }
    if (T.passage && T.passage.paragraphs && T.passage.paragraphs.length) {
      var ps = el('div', 'passage');
      ps.appendChild(el('p', 'qkind', '읽기 지문'));
      T.passage.paragraphs.forEach(function (t) { var p = el('p', '', String(t).replace(/\{\{([^|}]+)\|[^}]+\}\}/g, '$1')); p.setAttribute('lang', 'en'); ps.appendChild(p); });
      box.appendChild(ps);
    }
    var last = '', ql = el('div', 'qlist');
    T.items.forEach(function (q) {
      var sec = secOf(q);
      if (sec !== last) { last = sec; ql.appendChild(el('h2', 'sec-h', SEC[sec] || sec)); }
      var node = el('div', 'qitem');
      if (q.type === 'mc') {
        if (q.sentence) node.appendChild(sentenceWithWord(q.sentence, q.word));
        if (q.question) node.appendChild(el('h2', '', q.question));
        node.appendChild(choiceBlock(q.choices || [], q.answer, q.explain ? ' ' + q.explain : '', function (status, c) { save(q, { word: q.word, picked: c, status: status }); }, saved[q.id]));
      } else {
        buildRecall(node, q, saved[q.id], function (res) { save(q, res); });
      }
      ql.appendChild(node);
    });
    box.appendChild(ql);
    upd();
  }
  viewHooks.reading = function () { if (R) renderReadingList(); };
  viewHooks.drill = renderDrill;
  viewHooks.roots = renderRoots;
  viewHooks.test = renderTest;

  /* ---------- 자주 가는 사이트 (메뉴 안) ---------- */
  var siteBox = document.getElementById('sites');
  var lkBox = document.getElementById('links');
  var siteModal = document.getElementById('site-modal');
  if (siteBox) {
    var links = Array.isArray(store.links) ? store.links : (SITE.links || []).filter(function (l) { return l.url; });
    function saveLinks() { store.links = links; saveStore(); }
    function host(u) { return u.replace(/^https?:\/\//i, '').replace(/^www\./, '').replace(/\/$/, ''); }
    function renderLinks() {
      siteBox.textContent = '';
      links.forEach(function (l) {
        var a = el('a', 'site'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
        a.appendChild(el('span', 'site-ic', l.name.charAt(0).toUpperCase()));
        a.appendChild(el('span', '', l.name));
        siteBox.appendChild(a);
      });
      var add = el('button', 'site'); add.type = 'button';
      var ic = el('span', 'site-ic'); ic.appendChild(svgIcon(links.length ? ['M4 20h4L19 9l-4-4L4 16z'] : ['M12 5v14', 'M5 12h14'])); add.appendChild(ic);
      add.appendChild(el('span', '', links.length ? '고치기' : '사이트 추가'));
      add.addEventListener('click', function () { closeMenus(); openModal(siteModal, document.getElementById('apps-btn')); });
      siteBox.appendChild(add);
      lkBox.textContent = '';
      links.forEach(function (l) {
        var li = el('li');
        li.appendChild(el('span', 'site-ic', l.name.charAt(0).toUpperCase()));
        var nm = el('span', 'nm'); nm.appendChild(el('b', '', l.name)); nm.appendChild(el('span', '', host(l.url))); li.appendChild(nm);
        li.appendChild(delBtn(l.name + ' 지우기', function () { links.splice(links.indexOf(l), 1); saveLinks(); renderLinks(); }));
        lkBox.appendChild(li);
      });
    }
    var linkForm = document.getElementById('link-form');
    if (linkForm) linkForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var nm = document.getElementById('link-name'), ur = document.getElementById('link-url');
      var url = ur.value.trim();
      if (!url) { ur.focus(); return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      links.push({ name: nm.value.trim() || host(url).split(/[\/?#]/)[0], url: url });
      saveLinks(); renderLinks();
      nm.value = ''; ur.value = ''; nm.focus();
    });
    renderLinks();
    onStoreReload(function () { links = Array.isArray(store.links) ? store.links : []; renderLinks(); });
  }

  /* ---------- 할 일·메모 (한 목록) ---------- */
  var itemList = document.getElementById('items');
  if (itemList) {
    var capForm = document.getElementById('cap-form'), capIn = document.getElementById('cap-in');
    var moreBtn = document.getElementById('items-more');
    var showAll = false, SHOW = 3;
    var items = [];
    // 예전에 따로 있던 메모와 할 일을 한 목록으로 합쳐요 (끝낸 일은 빼요).
    function loadItems() {
      var list = Array.isArray(store.todos) ? store.todos : [];
      var changed = false;
      if (Array.isArray(store.memos) && store.memos.length) {
        list = store.memos.map(function (m) { return { text: m.text, at: m.at || Date.now() }; }).concat(list);
        delete store.memos; changed = true;
      }
      var open = list.filter(function (t) { return t && t.text && !t.done; });
      if (open.length !== list.length) changed = true;
      items = open;
      store.todos = items;
      if (changed) saveStore();
    }
    function saveItems() { store.todos = items; saveStore(); }
    function renderItems(fresh) {
      itemList.textContent = '';
      var shown = showAll ? items : items.slice(0, SHOW);
      shown.forEach(function (t) {
        var li = el('li', fresh === t ? 'new' : '');
        var b = el('button', 'check-btn'); b.type = 'button'; b.setAttribute('aria-label', t.text + ' 끝내기'); b.appendChild(el('span'));
        b.addEventListener('click', function () {
          b.classList.add('on'); li.classList.add('leaving');
          var at = items.indexOf(t);
          setTimeout(function () {
            items.splice(items.indexOf(t), 1); saveItems(); renderItems(); syncPins();
            toast('끝냈어요', 5000, { label: '되돌리기', run: function () { items.splice(Math.min(at, items.length), 0, t); saveItems(); renderItems(t); syncPins(); } });
          }, still ? 0 : 220);
        });
        li.appendChild(b);
        li.appendChild(el('span', 'tx', t.text));
        var on = isPinned(t);
        var pb = el('button', 'pin-btn' + (on ? ' on' : '')); pb.type = 'button';
        pb.setAttribute('aria-pressed', on ? 'true' : 'false');
        pb.setAttribute('aria-label', (on ? '알림창에서 내리기: ' : '알림창에 띄우기: ') + t.text);
        pb.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3a5 5 0 0 0-5 5v3.2L5.3 14.6A1 1 0 0 0 6.2 16h11.6a1 1 0 0 0 .9-1.4L17 11.2V8a5 5 0 0 0-5-5Zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        pb.addEventListener('click', function () { togglePin(t); });
        li.appendChild(pb);
        itemList.appendChild(li);
      });
      var extra = items.length - SHOW;
      moreBtn.hidden = extra <= 0;
      moreBtn.textContent = showAll ? '접기' : extra + '개 더 보기';
    }
    capForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = capIn.value.trim();
      if (!text) { capIn.focus(); return; }
      var t = { text: text, at: Date.now() };
      items.unshift(t); saveItems(); renderItems(t);
      capIn.value = '';
    });
    moreBtn.addEventListener('click', function () { showAll = !showAll; renderItems(); });

    /* 알림창에 띄우기: 이 기기에서 고른 메모를 폰 알림창에 계속 보여 줘요.
       알림을 밀어서 지워도 사이트를 다시 열면 또 띄워요. 메모를 끝내거나 종을 다시 누르면 내려가요. */
    var PIN_KEY = 'mybase-pins', pins = [];
    try { pins = JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); if (!Array.isArray(pins)) pins = []; } catch (e) { pins = []; }
    function itemKey(t) { return String(t.at || t.id || t.text); }
    function isPinned(t) { return pins.indexOf(itemKey(t)) !== -1; }
    function savePins() { try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch (e) {} }
    shadeProviders.push(function () {
      var w = {};
      items.forEach(function (t) { if (isPinned(t)) w['memo-' + itemKey(t)] = { title: t.text.slice(0, 120), body: 'MY BASE 메모' }; });
      return w;
    });
    function syncPins() { return syncShade(); }
    function togglePin(t) {
      var k = itemKey(t);
      if (isPinned(t)) {
        pins.splice(pins.indexOf(k), 1); savePins(); renderItems(); syncPins();
        toast('알림창에서 내렸어요');
        return;
      }
      askNotify(function () {
        if (pins.indexOf(k) === -1) pins.push(k);
        savePins(); renderItems();
        syncPins().then(function () { toast('알림창에 띄웠어요'); });
      });
    }
    function prunePins() {
      var keys = items.map(itemKey), before = pins.length;
      pins = pins.filter(function (k) { return keys.indexOf(k) !== -1; });
      if (pins.length !== before) savePins();
    }
    loadItems(); prunePins(); renderItems(); syncPins();
    onStoreReload(function () { loadItems(); prunePins(); renderItems(); syncPins(); });
  }

  /* ---------- 위쪽 줄: 내리면 숨고, 조금 올리면 다시 나와요 ---------- */
  var topbar = document.getElementById('topbar') || document.querySelector('.topbar');
  var appsBtn = document.getElementById('apps-btn'), appsMenu = document.getElementById('apps-menu');
  var meBtn = document.getElementById('me-btn'), meMenu = document.getElementById('me-menu');
  function closeMenus() {
    [[appsBtn, appsMenu], [meBtn, meMenu]].forEach(function (p) { if (p[0] && p[1]) { p[1].hidden = true; p[0].setAttribute('aria-expanded', 'false'); } });
  }
  function toggleMenu(btn, menu) {
    var open = menu.hidden;
    closeMenus();
    if (open) { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); showBar(); }
  }
  if (appsBtn && appsMenu) appsBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(appsBtn, appsMenu); });
  if (meBtn && meMenu) meBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(meBtn, meMenu); });
  document.addEventListener('click', function (e) {
    if ((appsMenu && appsMenu.contains(e.target) && !e.target.closest('a, button')) || (meMenu && meMenu.contains(e.target) && !e.target.closest('a, button'))) return;
    closeMenus();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });
  var barHidden = false;
  function showBar() { if (!topbar || !barHidden) return; barHidden = false; topbar.classList.remove('hide'); }
  function hideBar() {
    if (!topbar || barHidden) return;
    if ((appsMenu && !appsMenu.hidden) || (meMenu && !meMenu.hidden) || topbar.contains(document.activeElement)) return;
    barHidden = true; topbar.classList.add('hide');
  }
  if (topbar) {
    var lastY = window.scrollY, upAcc = 0;
    window.addEventListener('scroll', function () {
      var y = window.scrollY, dy = y - lastY; lastY = y;
      topbar.classList.toggle('lifted', y > 4);
      if (y < 80) { upAcc = 0; showBar(); return; }
      if (dy > 0) { upAcc = 0; hideBar(); }
      else if (dy < 0) { upAcc -= dy; if (upAcc > 32) showBar(); }
    }, { passive: true });
    topbar.addEventListener('focusin', showBar);
  }

  /* ---------- 홈과 기능 화면: 주소의 #이름으로 바꾸기 ---------- */
  if (page === 'app') {
    var views = document.querySelectorAll('[data-view]');
    var navs = document.querySelectorAll('[data-nav]');
    var pageName = document.querySelector('[data-page-name]');
    function route(first) {
      var name = (location.hash || '').replace('#', '');
      var viewName = name, navName = name, dynTitle = null;
      if (/^read-\d{4}-\d{2}-\d{2}$/.test(name) && typeof renderReadingDetail === 'function' && renderReadingDetail(name.slice(5))) {
        viewName = 'read'; navName = 'reading'; dynTitle = document.getElementById('rd-h').textContent;
      } else if ((name === 'event-new' || name === 'event-edit') && prepareEventForm(name)) {
        viewName = 'event'; navName = 'calendar';
      } else {
        var valid = ['read', 'event'].indexOf(name) === -1 && Array.prototype.some.call(views, function (v) { return v.getAttribute('data-view') === name; });
        if (!valid) { viewName = (name === 'event-edit' || name === 'event-new') ? 'calendar' : 'home'; navName = viewName; }
      }
      if (['drill', 'roots', 'test'].indexOf(viewName) !== -1) navName = 'reading';
      if (viewName !== 'read' && typeof hideWord === 'function') hideWord();
      closeMenus(); showBar();
      document.body.setAttribute('data-view', viewName);
      views.forEach(function (v) {
        var on = v.getAttribute('data-view') === viewName;
        v.hidden = !on;
        if (on) {
          countUp(v);
          var tt = dynTitle || v.getAttribute('data-title') || '';
          if (pageName) pageName.textContent = tt;
          document.title = viewName === 'home' ? 'MY BASE' : tt + ' · MY BASE';
        }
      });
      if (viewHooks[viewName]) viewHooks[viewName]();
      navs.forEach(function (a) {
        if (a.getAttribute('data-nav') === navName) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      if (!first) window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
    }
    window.addEventListener('hashchange', function () { route(false); });
    /* 홈에서 화면을 왼쪽으로 밀면 캘린더, 캘린더에서 오른쪽으로 밀면 홈으로 가요. */
    var sw0 = null;
    document.addEventListener('touchstart', function (e) {
      sw0 = null;
      if (e.touches.length !== 1) return;
      var t = e.touches[0], tg = e.target;
      if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return; // 폰의 '뒤로 가기' 밀기와 겹치지 않게
      if (tg.closest && tg.closest('input, textarea, select, [contenteditable="true"], .tt-scroll, .modal, .word-card, .pop, .toast')) return;
      sw0 = { x: t.clientX, y: t.clientY, t: Date.now() };
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!sw0) return;
      var t = e.changedTouches[0], dx = t.clientX - sw0.x, dy = t.clientY - sw0.y, dt = Date.now() - sw0.t;
      sw0 = null;
      if (dt > 700 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (String(window.getSelection ? window.getSelection() : '').trim()) return;
      if (document.querySelector('.modal:not([hidden])')) return;
      var v = document.body.getAttribute('data-view'), to = null;
      if (dx < 0 && v === 'home') to = 'calendar';
      else if (dx > 0 && v === 'calendar') to = 'home';
      if (!to) return;
      document.body.setAttribute('data-swipe', dx < 0 ? 'left' : 'right');
      location.hash = to;
      setTimeout(function () { document.body.removeAttribute('data-swipe'); }, 400);
    }, { passive: true });

    routeFn = route;
    route(true);
    shadeReady = true; syncShade();
    // 알림을 누르면 서비스 워커가 열 화면(#calendar 등)을 알려 줘요.
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.hash) location.hash = e.data.hash; });
  } else {
    countUp(document);
  }

  /* ---------- 드라이브와 맞추기 ---------- */
  if (driveOn) {
    pullStore();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush(true); else pullStore();
    });
    window.addEventListener('pagehide', function () { flush(true); });
  }

  /* ---------- 앱 설치용 파일 (manifest.json, sw.js) ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
  }

  /* ---------- 로그인 ---------- */
  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    var pw = document.getElementById('pw');
    var err = document.getElementById('pw-err');
    var toggle = document.getElementById('pw-toggle');
    var btn = document.getElementById('login-btn');
    toggle.addEventListener('click', function () {
      var show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.textContent = show ? '숨기기' : '보기';
      toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
    pw.addEventListener('input', function () { pw.classList.remove('bad'); err.hidden = true; });
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!pw.value) {
        err.textContent = '비밀번호를 입력해 주세요.';
        err.hidden = false;
        pw.classList.remove('bad'); void pw.offsetWidth; pw.classList.add('bad');
        pw.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = '여는 중…';
      document.body.classList.add('unlocked');
      setTimeout(function () { location.href = 'app.html'; }, still ? 0 : 900);
    });
  }
})();
