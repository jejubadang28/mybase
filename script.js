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
    svg.setAttribute('stroke-width', '2.3'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
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
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2400);
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
  var driveFiles = [], driveDecks = [];
  function allFiles() { return driveFiles.concat(SITE.files); }
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
    return { id: 'g_' + it.id, driveId: it.id, drive: true, name: base, type: (ext || 'FILE').toUpperCase().slice(0, 4), group: GROUP[ext] || 'doc', size: it.size ? fmtSize(it.size) : '', when: whenText(it.updated), public: !!it.public, url: it.url };
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
    if (f.public) nm.appendChild(pubBadge());
    a.appendChild(nm); a.appendChild(el('span', 'fmeta', f.when));
    row.appendChild(a);
    var side = el('div', 'fside');
    side.appendChild(el('span', 'fsize', f.size));
    if (withShare) {
      var b = el('button', 'share-btn'); b.type = 'button';
      b.appendChild(shareIcon()); b.appendChild(document.createTextNode('공유'));
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
      b.appendChild(shareIcon()); b.appendChild(document.createTextNode('공유'));
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
  function loadDriveList() {
    if (!DRIVE || (page === 'app' && !driveOn)) return;
    drive(page === 'app' ? 'list' : 'listPublic').then(function (j) {
      driveFiles = []; driveDecks = [];
      (j.items || []).forEach(function (it) { (it.kind === 'decks' ? driveDecks : driveFiles).push(fromDrive(it)); });
      renderFiles(); renderDecks(); updateCounts(); flashTarget();
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
    st.className = 'sh-state ' + (pub ? 'public' : 'private');
    st.textContent = pub ? '공개 자료실에 보여요. 링크가 있으면 누구나 로그인 없이 볼 수 있어요.' : '나만 볼 수 있어요.';
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
    var shDel = document.getElementById('sh-delete');
    if (shDel) shDel.addEventListener('click', function () {
      var item = shItem; if (!item || !item.drive) return;
      closeModal(shModal);
      askChoice('지우기', '"' + (item.title || item.name) + '" 을 지울까요?', [{ label: '지우기', sub: '드라이브 휴지통으로 옮겨요', danger: true, run: function () {
        drive('remove', { id: item.driveId }).then(function () {
          driveFiles = driveFiles.filter(function (x) { return x !== item; });
          driveDecks = driveDecks.filter(function (x) { return x !== item; });
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
  function saveEvents() { store.events = events; saveStore(); }
  onStoreReload(function () { events = normEvents(Array.isArray(store.events) ? store.events : SITE.events); evSeq = maxSeq(events); if (calGrid) refreshCalendar(); else renderGlance(); });
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

  /* 시간표 */
  function periodState(dayIdx, isToday) {
    var subjects = SITE.timetable[dayIdx] || [];
    var cur = now.getHours() * 60 + now.getMinutes(), nextMarked = false;
    return subjects.map(function (sj, i) {
      var pr = SITE.periods[i] || ['', ''], st = 'later';
      if (isToday && pr[0]) {
        if (cur >= mins(pr[1])) st = 'past';
        else if (cur >= mins(pr[0])) { st = 'now'; nextMarked = true; }
        else if (!nextMarked) { st = 'next'; nextMarked = true; }
      }
      return { no: i + 1, subject: sj, from: pr[0], to: pr[1], state: st };
    });
  }
  function renderPeriods(box, dayIdx, isToday) {
    box.textContent = '';
    var list = periodState(dayIdx, isToday);
    list.forEach(function (p, i) {
      var li = el('li', 'per' + (p.state === 'later' ? '' : ' ' + p.state));
      li.appendChild(el('span', 'no', String(p.no)));
      var s = el('span', 'sj', p.subject);
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
      b.setAttribute('aria-label', dayLabel(d) + (evs.length ? ', 일정 ' + evs.length + '개' : ''));
      b.style.animationDelay = (i * 0.008) + 's';
      b.appendChild(el('span', 'dn', String(d.getDate())));
      var wrap = el('span', 'evs');
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
    dh.textContent = dayLabel(d) + (isToday ? ' · 오늘' : '');
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
    if (wd >= 1 && wd <= 5 && SITE.timetable[wd]) { noClass.hidden = true; perBox.hidden = false; renderPeriods(perBox, wd, isToday); }
    else { perBox.hidden = true; noClass.hidden = false; }
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
    var maxP = 0; for (var d = 1; d <= 5; d++) maxP = Math.max(maxP, (SITE.timetable[d] || []).length);
    var thead = el('thead'), hr = el('tr'); hr.appendChild(el('th', '', '교시'));
    for (var d2 = 1; d2 <= 5; d2++) hr.appendChild(el('th', '', DAYS[d2]));
    thead.appendChild(hr);
    var tb = el('tbody');
    for (var p = 0; p < maxP; p++) {
      var r = el('tr'); r.appendChild(el('th', '', String(p + 1)));
      for (var d3 = 1; d3 <= 5; d3++) r.appendChild(el('td', d3 === now.getDay() ? 'today-col' : '', (SITE.timetable[d3] || [])[p] || ''));
      tb.appendChild(r);
    }
    wk.appendChild(thead); wk.appendChild(tb);
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
      var opts = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: ev.id + '-' + key, data: { key: key } };
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
  if (calGrid) { checkAlarms(); setInterval(function () { checkAlarms(); renderAlarmPanel(); }, 20000); }

  /* ---------- 홈: 오늘 한눈에 ---------- */
  function renderGlance() {
    var gc = document.getElementById('g-class'); if (!gc) return;
    var wd = now.getDay(), isSchool = wd >= 1 && wd <= 5 && SITE.timetable[wd];
    var main = '', sub = '', hot = false;
    if (isSchool) {
      var ps = periodState(wd, true);
      var cur = ps.filter(function (p) { return p.state === 'now'; })[0];
      var nxt = ps.filter(function (p) { return p.state === 'next'; })[0];
      if (cur) { main = cur.no + '교시 ' + cur.subject; sub = cur.from + '–' + cur.to + (nxt ? ' · 다음 ' + nxt.subject : ''); hot = true; }
      else if (nxt) { main = '다음 ' + nxt.no + '교시 ' + nxt.subject; sub = nxt.from + '에 시작'; }
      else { main = '오늘 수업 끝'; var tw = wd === 5 ? 1 : wd + 1; var t1 = (SITE.timetable[tw] || [])[0]; sub = t1 ? (wd === 5 ? '월요일' : '내일') + ' 1교시 ' + t1 : ''; }
    } else { main = '주말이에요'; var m1 = (SITE.timetable[1] || [])[0]; sub = m1 ? '월요일 1교시 ' + m1 : ''; }
    gc.textContent = main;
    document.getElementById('g-class-sub').textContent = sub;
    gc.parentNode.classList.toggle('hot', hot);
    var tk = ymd(now);
    var dd = events.filter(function (e) { return e.dday; }).map(function (e) { return { e: e, k: nextOccurrence(e, tk) }; })
      .filter(function (x) { return x.k; }).sort(function (a, b) { return a.k < b.k ? -1 : 1; })[0];
    var gd = document.getElementById('g-dday');
    gd.textContent = '';
    if (dd) {
      var left = daysLeft(parseYmd(dd.k));
      gd.appendChild(el('span', 'dd-badge', left === 0 ? 'D-DAY' : 'D-' + left));
      gd.appendChild(document.createTextNode(dd.e.title));
      document.getElementById('g-dday-sub').textContent = dayLabel(parseYmd(dd.k));
    } else { gd.textContent = '없음'; document.getElementById('g-dday-sub').textContent = ''; }
    var tEv = eventsOn(tk);
    document.getElementById('g-today').textContent = tEv.length ? tEv.length + '개' : '없음';
    document.getElementById('g-today-sub').textContent = tEv.length ? tEv.map(function (e) { return e.title + (e.allDay ? '' : ' ' + e.start); }).join(', ') : '';
  }
  renderGlance();

  /* =========================================================
     아침 영어 읽기 (사이트 안에서 보기)
     ========================================================= */
  var R = null, readings = [], routeFn = null;
  var STATUS = { known: '외운 단어', shaky: '거의 다 온', learning: '배우는 중', expose: '익히는 중' };
  function setReading(data) {
    R = data || { readings: [], wordbook: [], tests: [] };
    R.readings = R.readings || []; R.wordbook = R.wordbook || []; R.tests = R.tests || [];
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
        get('reading/tests.json').catch(function () { return []; })
      ]).then(function (all) { return { streak: idx.streak || 0, readings: all[0].filter(Boolean), wordbook: all[1], tests: all[2] }; });
    });
  }
  function findReading(key) { return readings.filter(function (r) { return r.date === key; })[0]; }
  function readTitle(r) { var d = parseYmd(r.date); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 아침 읽기'; }
  function resultText(r) {
    if (!r.result) return null;
    return '뜻 고르기 ' + r.result.quiz + '/' + r.result.quizN + ' · 떠올리기 ' + r.result.recall + '/' + r.result.recallN;
  }
  function readMinutes(r) { return r.minutes || Math.max(1, Math.round((r.wordCount || 0) / 120)); }
  function titleList(r) {
    var ul = el('ul', 'rd-titles');
    r.articles.forEach(function (a) { var li = el('li'); li.appendChild(el('span', 'tagc', a.tag)); li.appendChild(el('span', '', a.title)); ul.appendChild(li); });
    return ul;
  }
  function renderReadingList() {
    var latestBox = document.getElementById('rd-latest'); if (!latestBox || !R) return;
    var latest = readings[0];
    latestBox.textContent = '';
    var arc0 = document.getElementById('rd-archive');
    if (!latest) { latestBox.appendChild(el('p', 'empty', '아직 올라온 읽기가 없어요.')); if (arc0) arc0.textContent = ''; return; }
    var left = el('div');
    var dt = el('p', 'hello-date', dayLabel(parseYmd(latest.date))); left.appendChild(dt);
    left.appendChild(el('p', 'today', readTitle(latest)));
    var meta = el('p', 'rd-meta'); meta.style.margin = '10px 0 14px'; meta.style.color = 'var(--ink-dim)';
    meta.textContent = latest.articles.length + '편 · 약 ' + latest.wordCount + '단어 · 약 ' + readMinutes(latest) + '분';
    left.appendChild(meta);
    var st = resultText(latest);
    left.appendChild(el('span', 'rd-state ' + (st ? 'done' : 'todo'), st ? '다 풀었어요 · ' + st : '아직 안 읽었어요'));
    var acts = el('div', 'actions'); acts.style.marginTop = '18px';
    var go = el('a', 'btn primary', '보러가기'); go.href = '#read-' + latest.date; acts.appendChild(go);
    left.appendChild(acts);
    latestBox.appendChild(left);
    latestBox.appendChild(titleList(latest));
    var arc = document.getElementById('rd-archive'); arc.textContent = '';
    readings.slice(1).forEach(function (r) {
      var li = el('li', 'arc'); var d = parseYmd(r.date);
      var dd = el('span', 'arc-date'); dd.appendChild(el('b', '', (d.getMonth() + 1) + '.' + d.getDate())); dd.appendChild(el('span', '', DAYS[d.getDay()] + '요일'));
      li.appendChild(dd);
      var body = el('div', 'arc-body'); body.appendChild(titleList(r));
      var rt = resultText(r); body.appendChild(el('span', 'arc-res', rt ? rt : '아직 안 읽었어요'));
      li.appendChild(body);
      var b = el('a', 'btn small', '보러가기'); b.href = '#read-' + r.date; li.appendChild(b);
      arc.appendChild(li);
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
    if (tests.length >= 2) {
      var diff = tests[tests.length - 1].pct - tests[tests.length - 2].pct, cap = document.getElementById('st-cap'); cap.textContent = '';
      cap.appendChild(document.createTextNode('지난 점검 정답률 ' + tests[tests.length - 1].pct + '% · 그 전보다 '));
      cap.appendChild(el('b', '', (diff >= 0 ? '+' : '') + diff + '%p'));
    }
    var tk = ymd(now), rv = document.getElementById('st-review'); rv.textContent = '';
    var due = wb.filter(function (w) { return w.status !== 'expose' && w.due && w.due <= tk; });
    if (!due.length) rv.appendChild(el('p', 'day-none', '오늘 복습할 단어가 없어요.'));
    due.forEach(function (w) { var s = el('span', '', w.word); s.appendChild(el('small', '', w.ko)); rv.appendChild(s); });
    var wl = document.getElementById('st-words'); wl.textContent = '';
    wb.forEach(function (w) {
      var li = el('li'); li.setAttribute('data-s', w.status);
      li.appendChild(el('span', 'ww', w.word));
      var k = el('span', 'wk', w.ko); if (w.parts) k.appendChild(el('small', '', w.parts)); li.appendChild(k);
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
  function markNewReading() {
    var box = document.querySelector('[data-new-reading]'); if (!box) return;
    var r = readings[0], fresh = r && r.date === ymd(now) && !r.result;
    box.hidden = !fresh;
    if (fresh) box.querySelector('[data-new-n]').textContent = r.articles.length + '편';
  }
  function initReadingUI() { if (R && document.getElementById('rd-latest')) { renderReadingList(); renderStatus(); markNewReading(); } }
  onStoreReload(function () { if (!R) return; applyLocalResults(); initReadingUI(); });
  if (document.getElementById('rd-latest')) {
    if (window.READING) { setReading(window.READING); initReadingUI(); }
    else {
      document.getElementById('rd-latest').textContent = '읽기 자료를 불러오는 중이에요…';
      loadReadingFiles().then(function (d) {
        setReading(d); initReadingUI();
        if (routeFn && /^#read-/.test(location.hash)) routeFn(true);
      }).catch(function () {
        setReading(null);
        document.getElementById('rd-latest').textContent = '읽기 자료를 불러오지 못했어요. reading 폴더에 index.json이 있는지 확인해 주세요.';
      });
    }
    document.querySelectorAll('[data-rtab]').forEach(function (b, _, all) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-rtab');
        all.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        document.getElementById('rd-list').hidden = t !== 'list';
        document.getElementById('rd-status').hidden = t !== 'status';
        if (t === 'status') { renderStatus(); applyWords(); countUp(document.getElementById('rd-status')); }
      });
    });
    document.querySelectorAll('[data-wfilter] button').forEach(function (b, _, all) {
      b.addEventListener('click', function () { wFilter = b.getAttribute('data-f'); all.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); applyWords(); });
    });
    document.getElementById('st-search').addEventListener('input', applyWords);
  }

  /* 읽기 화면 */
  var wordCard = document.getElementById('word-card'), wordBtn = null;
  function hideWord() { if (!wordCard) return; wordCard.classList.remove('show'); if (wordBtn) wordBtn.setAttribute('aria-expanded', 'false'); wordBtn = null; }
  function showWord(btn, lemma, gloss) {
    var g = gloss[lemma] || {};
    if (wordBtn) wordBtn.setAttribute('aria-expanded', 'false');
    wordBtn = btn; btn.setAttribute('aria-expanded', 'true');
    $('wc-w').textContent = lemma;
    $('wc-k').textContent = g.ko || '뜻이 아직 없어요';
    $('wc-p').textContent = g.parts || ''; $('wc-p').hidden = !g.parts;
    $('wc-n').textContent = g.note || ''; $('wc-n').hidden = !g.note;
    wordCard.classList.add('show');
  }
  function richText(text, gloss, asButtons) {
    var frag = document.createDocumentFragment(), re = /\{\{([^|}]+)\|([^}]+)\}\}/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (asButtons) {
        var b = el('button', 'w', m[1]); b.type = 'button'; b.setAttribute('aria-expanded', 'false');
        (function (lemma, btn) { btn.addEventListener('click', function () { if (wordBtn === btn) hideWord(); else showWord(btn, lemma, gloss); }); })(m[2], b);
        frag.appendChild(b);
      } else frag.appendChild(el('mark', '', m[1]));
      last = re.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var tally = null;
  function updateTally() {
    var t = $('rd-tally'); t.textContent = '';
    var s = el('span');
    s.appendChild(document.createTextNode('핵심 질문 ')); s.appendChild(el('b', '', tally.k + '/' + tally.kN));
    s.appendChild(document.createTextNode(' · 뜻 고르기 ')); s.appendChild(el('b', '', tally.q + '/' + tally.qN));
    s.appendChild(document.createTextNode(' · 떠올리기 ')); s.appendChild(el('b', '', tally.r + '/' + tally.rN));
    t.appendChild(s);
    var done = tally.kd === tally.kN && tally.qd === tally.qN && tally.rd === tally.rN;
    t.appendChild(el('span', '', done ? '다 풀었어요' : '남은 문제 ' + ((tally.kN - tally.kd) + (tally.qN - tally.qd) + (tally.rN - tally.rd)) + '개'));
    if (done && tally.entry && !tally.saved) {
      tally.saved = true;
      var res = { quiz: tally.q, quizN: tally.qN, recall: tally.r, recallN: tally.rN };
      tally.entry.result = res;
      var mk = marksFor(tally.entry.date, true); mk.result = res; mk.doneAt = Date.now(); saveMark(tally.entry.date);
      renderReadingList(); markNewReading();
      toast('다 풀었어요 · 뜻 고르기 ' + tally.q + '/' + tally.qN + ' · 떠올리기 ' + tally.r + '/' + tally.rN);
    }
  }
  function choiceBlock(choices, answer, explain, onDone, preset) {
    var wrap = el('div', 'opts'), fbBox = el('div'), btns = [];
    function reveal(c) {
      var ok = c === answer;
      btns.forEach(function (x) { x.disabled = true; if (x.textContent === answer) x.classList.add('right'); if (!ok && x.textContent === c) x.classList.add('wrong'); });
      var f = el('p', 'fb ' + (ok ? 'ok' : 'no')); f.appendChild(el('b', '', ok ? '맞았어요' : '정답은 ' + answer));
      if (explain) f.appendChild(document.createTextNode(explain));
      fbBox.appendChild(f);
      return ok;
    }
    shuffle(choices).forEach(function (c) {
      var b = el('button', '', c); b.type = 'button';
      b.addEventListener('click', function () { onDone(reveal(c), c); });
      wrap.appendChild(b); btns.push(b);
    });
    if (preset !== undefined && preset !== null) reveal(preset);
    var box = el('div'); box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '10px';
    box.appendChild(wrap); box.appendChild(fbBox);
    return box;
  }
  function renderReadingDetail(key) {
    if (!R) return false;
    var r = findReading(key); if (!r) return false;
    hideWord();
    $('rd-h').textContent = readTitle(r);
    $('rd-sub').textContent = r.articles.length + '편 · 약 ' + r.wordCount + '단어 · 약 ' + readMinutes(r) + '분' + (resultText(r) ? ' · 지난번 결과 ' + resultText(r) : '');
    var gg = $('rd-gloss'); gg.textContent = '';
    Object.keys(r.gloss).forEach(function (k) {
      var g = r.gloss[k], c = el('div', 'gcard');
      var w = el('span', 'gw', k); if (g.isNew) w.appendChild(el('span', 'new-w', '새 단어')); c.appendChild(w);
      c.appendChild(el('span', 'gk', g.ko));
      if (g.parts) c.appendChild(el('span', 'gp', g.parts));
      if (g.note) c.appendChild(el('span', 'gn', g.note));
      gg.appendChild(c);
    });
    var mk = marksFor(r.date, false) || {}, mkq = mk.keyq || {}, mq = mk.quiz || {}, mr = mk.recall || {};
    function rec(section, id, data) { var m = marksFor(r.date, true); m[section][id] = data; saveMark(r.date); }
    tally = { entry: r, saved: !!mk.result, k: 0, kd: 0, kN: r.articles.filter(function (a) { return a.keyQ; }).length, q: 0, qd: 0, qN: r.quiz.length, r: 0, rd: 0, rN: r.recall.length };
    var ab = $('rd-articles'); ab.textContent = '';
    r.articles.forEach(function (a, i) {
      var sec = el('section', 'panel'); sec.style.setProperty('--i', String(i + 1));
      var ph = el('div', 'ph'); var h = el('h2'); h.appendChild(el('span', 'tagc', a.tag)); h.appendChild(document.createTextNode(' ' + a.title)); ph.appendChild(h); sec.appendChild(ph);
      var pb = el('div', 'pb article');
      a.paragraphs.forEach(function (p) { var pe = el('p'); pe.appendChild(richText(p, r.gloss, true)); pb.appendChild(pe); });
      pb.appendChild(el('span', 'src', '출처: ' + (a.source || '')));
      if (a.keyQ) {
        var kq = el('div', 'keyq'); kq.appendChild(el('h3', '', '핵심 질문 · ' + a.keyQ.question));
        var pk = mkq[a.id];
        if (pk) { tally.kd += 1; if (pk.status === 'correct') tally.k += 1; }
        kq.appendChild(choiceBlock(a.keyQ.choices, a.keyQ.answer, a.keyQ.explain, function (ok, c) {
          tally.kd += 1; if (ok) tally.k += 1;
          rec('keyq', a.id, { word: a.keyQ.hingesOn || '', status: ok ? 'correct' : 'wrong', picked: c });
          updateTally();
        }, pk ? pk.picked : null));
        pb.appendChild(kq);
      }
      sec.appendChild(pb);
      ab.appendChild(sec);
    });
    var qb = $('rd-quiz'); qb.textContent = '';
    r.quiz.forEach(function (q, i) {
      var it = el('div', 'qitem'); it.appendChild(el('h3', '', (i + 1) + '. 표시한 단어의 뜻은?'));
      var s = el('p', 'qsent'); s.appendChild(richText(q.sentence, r.gloss, false)); it.appendChild(s);
      var qid = q.id || 'q' + (i + 1), pq = mq[qid];
      if (pq) { tally.qd += 1; if (pq.status === 'correct') tally.q += 1; }
      it.appendChild(choiceBlock(q.choices, q.answer, q.explain, function (ok, c) {
        tally.qd += 1; if (ok) tally.q += 1;
        rec('quiz', qid, { word: q.word, status: ok ? 'correct' : 'wrong', picked: c });
        updateTally();
      }, pq ? pq.picked : null));
      qb.appendChild(it);
    });
    var rb = $('rd-recall'); rb.textContent = '';
    r.recall.forEach(function (q, i) {
      var it = el('div', 'qitem'), rid = q.id || 'r' + (i + 1), pr = mr[rid];
      if (q.type === 'pattern') {
        it.appendChild(el('h3', '', (i + 1) + '. 예문을 보고 따라 쓰기'));
        var ex = el('div', 'pattern-ex'); ex.appendChild(el('p', 'qsent', q.example || '')); ex.appendChild(el('p', 'hint', q.exampleKo || '')); it.appendChild(ex);
        it.appendChild(el('p', 'qsent', '영어로 써 보세요: ' + (q.prompt || '')));
        var ta = el('textarea', 'field'); ta.rows = 2; ta.setAttribute('aria-label', (i + 1) + '번 영어 문장'); it.appendChild(ta);
        var show = el('button', 'btn', '모범 답안 보기'); show.type = 'button'; show.style.alignSelf = 'flex-start';
        var box = el('div'); box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '8px';
        var selfBtns = [];
        function judge(b, ok) { selfBtns.forEach(function (x) { x.disabled = true; }); b.classList.add(ok ? 'right' : 'wrong'); }
        function showModel() {
          show.hidden = true; ta.disabled = true;
          var m = el('p', 'fb ok'); m.appendChild(el('b', '', '모범 답안')); m.appendChild(document.createTextNode(q.model || '')); box.appendChild(m);
          if (q.hint) box.appendChild(el('p', 'hint', '틀리기 쉬운 점: ' + q.hint));
          box.appendChild(el('p', 'hint', '내 답과 비교해 보고 골라 주세요.'));
          var self = el('div', 'opts');
          [['맞게 썼어요', true], ['고칠 데가 있어요', false]].forEach(function (o) {
            var b = el('button', '', o[0]); b.type = 'button';
            b.addEventListener('click', function () {
              judge(b, o[1]); tally.rd += 1; if (o[1]) tally.r += 1;
              rec('recall', rid, { word: q.word, type: 'pattern', typed: ta.value.trim(), status: o[1] ? 'correct' : 'wrong' });
              updateTally();
            });
            self.appendChild(b); selfBtns.push(b);
          });
          box.appendChild(self);
        }
        show.addEventListener('click', function () { if (!ta.value.trim()) { ta.focus(); return; } showModel(); });
        it.appendChild(show); it.appendChild(box);
        if (pr && pr.status) {
          ta.value = pr.typed || ''; showModel();
          var ok0 = pr.status === 'correct'; judge(selfBtns[ok0 ? 0 : 1], ok0);
          tally.rd += 1; if (ok0) tally.r += 1;
        }
        rb.appendChild(it);
        return;
      }
      it.appendChild(el('h3', '', (i + 1) + '. ' + (q.type === 'ko2en' ? '이 뜻의 영어 단어는?' : '빈칸에 들어갈 단어는?')));
      it.appendChild(el('p', 'qsent', q.prompt));
      var hb = el('button', 'hint-btn', '힌트 보기'); hb.type = 'button';
      var hint = el('p', 'hint', '힌트: ' + q.hint); hint.hidden = true;
      hb.addEventListener('click', function () { hint.hidden = false; hb.hidden = true; });
      it.appendChild(hb); it.appendChild(hint);
      var row = el('form', 'recall-row');
      var inp = el('input', 'field'); inp.type = 'text'; inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', (i + 1) + '번 답'); inp.placeholder = '영어로 쓰기';
      var go = el('button', 'btn', '확인'); go.type = 'submit';
      row.appendChild(inp); row.appendChild(go);
      var fb = el('div');
      function showFb(ok) {
        inp.disabled = true; go.disabled = true;
        var f = el('p', 'fb ' + (ok ? 'ok' : 'no')); f.appendChild(el('b', '', ok ? '맞았어요' : '정답은 ' + q.answer));
        if (q.explain) f.appendChild(document.createTextNode(q.explain));
        fb.appendChild(f);
      }
      row.addEventListener('submit', function (e) {
        e.preventDefault();
        var typed = inp.value.trim(), v = typed.toLowerCase(); if (!v) { inp.focus(); return; }
        var ok = (q.accept || [q.answer]).map(function (x) { return String(x).toLowerCase(); }).indexOf(v) !== -1;
        showFb(ok);
        tally.rd += 1; if (ok) tally.r += 1;
        rec('recall', rid, { word: q.word, type: q.type, typed: typed, status: ok ? 'correct' : 'wrong' });
        updateTally();
      });
      it.appendChild(row); it.appendChild(fb);
      if (pr && pr.status) { inp.value = pr.typed || ''; showFb(pr.status === 'correct'); tally.rd += 1; if (pr.status === 'correct') tally.r += 1; }
      rb.appendChild(it);
    });
    var ro = $('rd-roots'); ro.textContent = '';
    [['en', '영어 어근'], ['ko', '한자어']].forEach(function (p) {
      var x = r.roots && r.roots[p[0]]; if (!x) return;
      var c = el('div', 'root-card');
      c.appendChild(el('span', 'tagc', p[1] + (x.part ? ' · ' + x.part : '')));
      c.appendChild(el('span', 'rf', x.form)); c.appendChild(el('span', 'rm', x.meaning));
      var ul = el('ul');
      x.examples.forEach(function (ex) { var li = el('li'); li.appendChild(el('b', '', ex.word)); li.appendChild(el('span', '', ex.ko)); li.appendChild(el('em', '', ex.split)); ul.appendChild(li); });
      c.appendChild(ul);
      if (x.tip) c.appendChild(el('p', 'hint', x.tip));
      ro.appendChild(c);
    });
    updateTally();
    return true;
  }
  if (wordCard) {
    $('wc-close').addEventListener('click', hideWord);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideWord(); });
  }

  /* ---------- 자주 가는 사이트 ---------- */
  var lkBox = document.getElementById('links');
  if (lkBox) {
    var links = Array.isArray(store.links) ? store.links : (SITE.links || []).filter(function (l) { return l.url; });
    function saveLinks() { store.links = links; saveStore(); }
    function renderLinks() {
      lkBox.textContent = '';
      lkBox.hidden = !links.length;
      links.forEach(function (l) {
        var w = el('div', 'lk-wrap');
        var a = el('a', 'lk'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
        a.appendChild(el('span', 'ic', l.name.charAt(0)));
        a.appendChild(el('span', 'nm', l.name));
        a.appendChild(el('span', 'dm', l.url.replace(/^https?:\/\//, '').replace(/\/$/, '')));
        w.appendChild(a);
        w.appendChild(delBtn(l.name + ' 지우기', function () { links.splice(links.indexOf(l), 1); saveLinks(); renderLinks(); }));
        lkBox.appendChild(w);
      });
    }
    var linkForm = document.getElementById('link-form');
    if (linkForm) linkForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var nm = document.getElementById('link-name'), ur = document.getElementById('link-url');
      var url = ur.value.trim();
      if (!url) { ur.focus(); return; }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      var host = url.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].replace(/^www\./, '');
      links.push({ name: nm.value.trim() || host, url: url });
      saveLinks(); renderLinks();
      nm.value = ''; ur.value = ''; nm.focus();
    });
    renderLinks();
    onStoreReload(function () { links = Array.isArray(store.links) ? store.links : []; renderLinks(); });
  }

  /* ---------- 할 일 ---------- */
  var todoList = document.getElementById('todos');
  if (todoList) {
    var leftEls = document.querySelectorAll('[data-left]');
    var todoFilter = 'all';
    var todos = Array.isArray(store.todos) ? store.todos : [];
    function saveTodos() { store.todos = todos; saveStore(); }
    function applyTodoFilter() {
      todoList.querySelectorAll('li').forEach(function (li) {
        var done = li.querySelector('input').checked;
        li.hidden = (todoFilter === 'open' && done) || (todoFilter === 'done' && !done);
      });
    }
    function updateLeft() {
      var n = todos.filter(function (t) { return !t.done; }).length;
      leftEls.forEach(function (x) { x.textContent = !todos.length ? '없음' : n === 0 ? '다 했어요' : n + '개 남음'; });
    }
    function renderTodos(fresh) {
      todoList.textContent = '';
      todos.forEach(function (t, i) {
        var li = el('li', fresh === t ? 'new' : ''), label = el('label');
        var box = el('input', 'check'); box.type = 'checkbox'; box.id = 'todo-' + i; box.checked = !!t.done;
        box.addEventListener('change', function () { t.done = box.checked; saveTodos(); updateLeft(); applyTodoFilter(); });
        label.appendChild(box); label.appendChild(el('span', '', t.text)); li.appendChild(label);
        li.appendChild(delBtn(t.text + ' 지우기', function () { todos.splice(todos.indexOf(t), 1); saveTodos(); renderTodos(); }));
        todoList.appendChild(li);
      });
      updateLeft(); applyTodoFilter();
    }
    var addForm = document.getElementById('add-form');
    if (addForm) {
      var addInput = document.getElementById('new-todo');
      addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = addInput.value.trim();
        if (!text) { addInput.focus(); return; }
        var t = { text: text, done: false };
        todos.push(t); saveTodos(); renderTodos(t);
        addInput.value = '';
      });
    }
    document.querySelectorAll('[data-todo-filter] button').forEach(function (b, _, all) {
      b.addEventListener('click', function () {
        todoFilter = b.getAttribute('data-f');
        all.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        applyTodoFilter();
      });
    });
    renderTodos();
    onStoreReload(function () { todos = Array.isArray(store.todos) ? store.todos : []; renderTodos(); });
  }

  /* ---------- 메모 ---------- */
  var memoForm = document.getElementById('memo-form');
  if (memoForm) {
    var memoText = document.getElementById('memo-text');
    var memoBox = document.getElementById('memos');
    var memoList = Array.isArray(store.memos) ? store.memos : [];
    function saveMemos() { store.memos = memoList; saveStore(); }
    function memoTime(ms) {
      var d = new Date(ms);
      return (d.getMonth() + 1) + '.' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function renderMemos(fresh) {
      memoBox.textContent = '';
      memoList.forEach(function (m) {
        var card = el('p', 'memo-card' + (fresh === m ? ' new' : ''));
        card.appendChild(el('time', '', memoTime(m.at)));
        card.appendChild(document.createTextNode(m.text));
        card.appendChild(delBtn('메모 지우기', function () { memoList.splice(memoList.indexOf(m), 1); saveMemos(); renderMemos(); }));
        memoBox.appendChild(card);
      });
    }
    memoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = memoText.value.trim();
      if (!text) { memoText.focus(); return; }
      var m = { at: Date.now(), text: text };
      memoList.unshift(m); saveMemos(); renderMemos(m);
      memoText.value = '';
      toast('메모를 저장했어요');
    });
    renderMemos();
    onStoreReload(function () { memoList = Array.isArray(store.memos) ? store.memos : []; renderMemos(); });
  }

  /* ---------- 위쪽 띠: 내리면 숨고, 조금 올리거나 위를 쓸어내리면 다시 나와요 ---------- */
  var band = document.querySelector('.band.sticky');
  var ind = document.querySelector('.tab-ind');
  var bar = band ? band.querySelector('.bar') : null;
  function moveInd() {
    if (!ind || !bar) return;
    var cur = bar.querySelector('[data-nav][aria-current="page"]');
    if (!cur) { ind.style.opacity = '0'; return; }
    var b = bar.getBoundingClientRect(), r = cur.getBoundingClientRect();
    var isBrand = cur.classList.contains('brand');
    var w = isBrand ? r.width * 0.55 : r.width - 24;
    var x = r.left - b.left + (isBrand ? 0 : 12);
    var y = r.bottom - b.top - 3;
    ind.style.width = w + 'px';
    ind.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    ind.style.opacity = '1';
  }
  var showBand = function () {}, hideBand = function () {};
  if (band) {
    var pull = el('button', 'pull-tab'); pull.type = 'button';
    pull.setAttribute('aria-label', '위쪽 메뉴 꺼내기');
    pull.appendChild(svgIcon(['M6 9l6 6 6-6'])); pull.appendChild(el('span', '', '메뉴'));
    document.body.appendChild(pull);
    var bandHidden = false, lastY = window.scrollY, upAcc = 0;
    var TOP = 80;   // 이보다 위에서는 항상 보여요
    var UP = 48;    // 이만큼 위로 올리면 다시 나와요
    function modalOpen() { return Array.prototype.some.call(document.querySelectorAll('.modal'), function (m) { return !m.hidden; }); }
    showBand = function () {
      if (!bandHidden) return;
      bandHidden = false; band.classList.remove('hide'); pull.classList.remove('show');
      setTimeout(moveInd, 320);
    };
    hideBand = function () {
      if (bandHidden || window.scrollY < TOP || band.contains(document.activeElement) || modalOpen()) return;
      bandHidden = true; band.classList.add('hide'); pull.classList.add('show');
    };
    window.addEventListener('scroll', function () {
      var y = window.scrollY, dy = y - lastY; lastY = y;
      band.classList.toggle('lifted', y > 4);
      if (y < TOP) { upAcc = 0; showBand(); return; }
      if (dy > 0) { upAcc = 0; hideBand(); }
      else if (dy < 0) { upAcc -= dy; if (upAcc > UP) showBand(); }
    }, { passive: true });
    pull.addEventListener('click', showBand);
    band.addEventListener('focusin', showBand);
    // 손가락: 화면 맨 위 근처를 아래로 쓸면 꺼내고, 띠를 위로 쓸면 숨겨요.
    var touch = null;
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, onBand: band.contains(e.target) };
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!touch) return;
      var t = e.touches[0], dy = t.clientY - touch.y, dx = Math.abs(t.clientX - touch.x);
      if (dx > Math.abs(dy)) return;
      if (bandHidden && touch.y < 72 && dy > 24) { showBand(); touch = null; }
      else if (!bandHidden && touch.onBand && dy < -24) { hideBand(); touch = null; }
    }, { passive: true });
    document.addEventListener('touchend', function () { touch = null; }, { passive: true });
    window.addEventListener('resize', moveInd);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInd);
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
      if (viewName !== 'read' && typeof hideWord === 'function') hideWord();
      views.forEach(function (v) {
        var on = v.getAttribute('data-view') === viewName;
        v.hidden = !on;
        if (on) {
          countUp(v);
          var tt = dynTitle || v.getAttribute('data-title') || '';
          if (pageName) pageName.textContent = tt;
          document.title = 'MY BASE ' + tt;
        }
      });
      navs.forEach(function (a) {
        if (a.getAttribute('data-nav') === navName) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      moveInd();
      if (!first) window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
    }
    window.addEventListener('hashchange', function () { route(false); });
    routeFn = route;
    route(true);
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
