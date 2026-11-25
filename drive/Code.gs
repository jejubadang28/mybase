// MY BASE 드라이브 연결 (Google Apps Script)
//
// 구글 드라이브에 "MY BASE" 폴더를 만들고 그 안에 저장해요.
//   MY BASE/자료실  사이트에서 올린 파일
//   MY BASE/발표    사이트에서 올린 HTML 발표
//   MY BASE/기록    메모·할 일·일정·사이트 (data.json)
//   MY BASE/받은 파일   다른 사람이 '파일 보내기' 링크로 보낸 파일
//   MY BASE/MY BASE 읽기 기록   사이트에서 푼 기록 (readmarks-날짜.json)과
//                   아침 작업이 올리는 그날 읽기 (reading-날짜.json)
//                   아침 작업이 읽고 올릴 수 있게 이 폴더만 Claude 에 연결된 구글 계정과 '편집자'로 공유해요.
//
// KEY 는 GitHub 의 DRIVE_KEY 와 똑같아야 해요. 이 파일을 GitHub 에 올릴 때는 KEY 를 비워 두세요.
// 코드를 고치면 "배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포" 를 해야 사이트에 반영돼요.
const KEY = '';
const ROOT_NAME = 'MY BASE';
const MAX_BYTES = 35 * 1024 * 1024;
const MARKS = 'MY BASE 읽기 기록';
const INBOX = '받은 파일';
const INBOX_MAX_BYTES = 20 * 1024 * 1024;   // 받는 파일 하나의 최대 크기
const INBOX_PER_HOUR = 40;                  // 한 시간에 받을 수 있는 파일 수 (장난 막기)

// 처음 한 번 ▶ 실행: 폴더를 만들고 드라이브 권한을 받아요.
function setup() {
  if (KEY.length < 16) throw new Error('맨 위 KEY 를 먼저 채워 주세요 (16자 이상).');
  ['자료실', '발표', '기록', MARKS, INBOX].forEach(folder_);
  inboxToken_();
  Logger.log('준비 끝: ' + root_().getUrl());
}

function doGet() {
  return json_({ ok: true, app: 'MY BASE' });
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: '요청을 읽지 못했어요' });
  }
  try {
    return json_(route_(p));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function route_(p) {
  const action = String(p.action || '');

  // 열쇠 없이 되는 일: 공개한 자료만
  if (action === 'listPublic') return { ok: true, items: list_(true) };
  if (action === 'getPublic') {
    const f = mine_(p.id);
    if (!isPublic_(f) || kindOf_(f) === 'inbox') return { ok: false, error: '공개 자료가 아니에요' };
    return { ok: true, name: f.getName(), text: f.getBlob().getDataAsString('UTF-8') };
  }

  // 열쇠 없이 되는 일: '파일 보내기' 링크로 파일 받기 (링크 안의 받기 표가 맞아야 해요)
  if (action === 'inbox') return withLock_(function () { return inbox_(p); });
  if (action === 'inboxStatus') {
    if (!inboxTokenOk_(p.token)) return { ok: false, error: '받기 링크가 맞지 않아요. 받은 링크를 다시 확인해 주세요.' };
    return { ok: true, public: inboxPublic_() };
  }

  if (KEY.length < 16 || p.key !== KEY) return { ok: false, error: '열쇠가 맞지 않아요' };

  switch (action) {
    case 'ping':
      return { ok: true };
    case 'list':
      return { ok: true, items: list_(false), quota: quota_() };
    case 'get': {
      const f = mine_(p.id);
      return { ok: true, name: f.getName(), text: f.getBlob().getDataAsString('UTF-8') };
    }
    case 'upload':
      return withLock_(function () { return upload_(p); });
    case 'inboxInfo':
      return { ok: true, token: inboxToken_(), public: inboxPublic_() };
    case 'inboxReset':
      PropertiesService.getScriptProperties().deleteProperty('inboxToken');
      return { ok: true, token: inboxToken_(), public: inboxPublic_() };
    case 'inboxSetPublic':
      return withLock_(function () {
        const on = !!p.public;
        PropertiesService.getScriptProperties().setProperty('inboxPublic', on ? 'true' : 'false');
        const it = folder_(INBOX).getFiles();
        while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) share_(f, on); }
        return { ok: true, public: on };
      });
    case 'keep': {
      const f = mine_(p.id);
      if (kindOf_(f) !== 'inbox') return { ok: false, error: '받은 파일이 아니에요' };
      f.moveTo(folder_('자료실'));
      return { ok: true, item: item_(f, 'files') };
    }
    case 'share': {
      const f = mine_(p.id);
      share_(f, !!p.public);
      return { ok: true, item: item_(f, kindOf_(f)) };
    }
    case 'remove': {
      mine_(p.id).setTrashed(true);
      return { ok: true };
    }
    case 'mark': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date))) return { ok: false, error: '날짜가 이상해요' };
      return withLock_(function () {
        writeText_(folder_(MARKS), 'readmarks-' + p.date + '.json', JSON.stringify(p.mark || {}, null, 1));
        return { ok: true };
      });
    }
    case 'readings':
      return readings_(p);
    case 'load': {
      const f = findFile_(folder_('기록'), 'data.json');
      const text = f ? f.getBlob().getDataAsString('UTF-8') : '';
      return { ok: true, data: text ? JSON.parse(text) : null };
    }
    case 'save':
      return withLock_(function () {
        writeText_(folder_('기록'), 'data.json', JSON.stringify(p.data || {}));
        return { ok: true };
      });
    default:
      return { ok: false, error: '모르는 요청이에요' };
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function cachedFolder_(prop, make) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(prop);
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {}
  }
  const f = make();
  props.setProperty(prop, f.getId());
  return f;
}

function root_() {
  return cachedFolder_('root', function () {
    const top = DriveApp.getRootFolder();
    const it = top.getFoldersByName(ROOT_NAME);
    return it.hasNext() ? it.next() : top.createFolder(ROOT_NAME);
  });
}

function folder_(name) {
  return cachedFolder_('folder:' + name, function () {
    const root = root_();
    const it = root.getFoldersByName(name);
    return it.hasNext() ? it.next() : root.createFolder(name);
  });
}

function findFile_(folder, name) {
  const it = folder.getFilesByName(name);
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

function writeText_(folder, name, text) {
  const f = findFile_(folder, name);
  if (f) f.setContent(text);
  else folder.createFile(name, text, MimeType.PLAIN_TEXT);
}

function isPublic_(f) {
  try {
    const a = f.getSharingAccess();
    return a === DriveApp.Access.ANYONE || a === DriveApp.Access.ANYONE_WITH_LINK;
  } catch (e) {
    return false;
  }
}

function share_(f, on) {
  if (on) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  else f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
}

function kindOf_(f) {
  const decks = folder_('발표').getId(), inbox = folder_(INBOX).getId();
  const ps = f.getParents();
  while (ps.hasNext()) {
    const id = ps.next().getId();
    if (id === decks) return 'decks';
    if (id === inbox) return 'inbox';
  }
  return 'files';
}

// 자료실·발표 폴더 안의 파일만 다뤄요. 다른 드라이브 파일은 건드리지 않아요.
function mine_(id) {
  const f = DriveApp.getFileById(String(id || ''));
  const ok = [folder_('자료실').getId(), folder_('발표').getId(), folder_(INBOX).getId()];
  if (f.isTrashed()) throw new Error('지운 파일이에요');
  const ps = f.getParents();
  while (ps.hasNext()) if (ok.indexOf(ps.next().getId()) !== -1) return f;
  throw new Error('MY BASE 폴더의 파일이 아니에요');
}

function item_(f, kind) {
  let from = '', note = '';
  if (kind === 'inbox') {
    try { const d = JSON.parse(f.getDescription() || '{}'); from = d.from || ''; note = d.note || ''; } catch (e) {}
  }
  return {
    from: from,
    note: note,
    id: f.getId(),
    name: f.getName(),
    mime: f.getMimeType(),
    size: f.getSize(),
    updated: f.getLastUpdated().getTime(),
    public: isPublic_(f),
    url: f.getUrl(),
    kind: kind
  };
}

function list_(onlyPublic) {
  const out = [];
  [['files', '자료실'], ['decks', '발표'], ['inbox', INBOX]].forEach(function (pair) {
    const it = folder_(pair[1]).getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (f.isTrashed()) continue;
      if (onlyPublic && !isPublic_(f)) continue;
      out.push(item_(f, pair[0]));
    }
  });
  out.sort(function (a, b) { return b.updated - a.updated; });
  return out;
}

function upload_(p) {
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (!bytes.length) return { ok: false, error: '빈 파일이에요' };
  if (bytes.length > MAX_BYTES) return { ok: false, error: '파일이 너무 커요' };
  const kind = p.kind === 'decks' ? 'decks' : 'files';
  const blob = Utilities.newBlob(bytes, String(p.mime || 'application/octet-stream'), String(p.name || '이름 없는 파일'));
  const f = folder_(kind === 'decks' ? '발표' : '자료실').createFile(blob);
  if (p.public) share_(f, true);
  return { ok: true, item: item_(f, kind) };
}

// '파일 보내기' 링크의 받기 표. 처음 부를 때 만들어 두고, inboxReset 으로 바꿀 수 있어요.
// 받은 파일을 공개 자료실에 보여 줄지 (처음에는 켜져 있어요)
function inboxPublic_() {
  const v = PropertiesService.getScriptProperties().getProperty('inboxPublic');
  return v === null ? true : v === 'true';
}

function inboxTokenOk_(t) {
  return !!t && t === PropertiesService.getScriptProperties().getProperty('inboxToken');
}

// 드라이브 저장 공간 (바이트). limit 이 0 이하이면 제한 없음
function quota_() {
  try { return { used: DriveApp.getStorageUsed(), limit: DriveApp.getStorageLimit() }; } catch (e) { return null; }
}

function inboxToken_() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty('inboxToken');
  if (!t) { t = Utilities.getUuid().replace(/-/g, ''); props.setProperty('inboxToken', t); }
  return t;
}

function clean_(text, max) {
  return String(text || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// 다른 사람이 보낸 파일 받기
function inbox_(p) {
  if (!inboxTokenOk_(p.token)) {
    return { ok: false, error: '받기 링크가 맞지 않아요. 받은 링크를 다시 확인해 주세요.' };
  }
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get('inboxCount') || 0);
  if (count >= INBOX_PER_HOUR) return { ok: false, error: '지금은 파일이 너무 많이 와서 받을 수 없어요. 잠시 뒤에 다시 보내 주세요.' };
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (!bytes.length) return { ok: false, error: '빈 파일이에요' };
  if (bytes.length > INBOX_MAX_BYTES) return { ok: false, error: '파일이 너무 커요 (20MB까지)' };
  const from = clean_(p.from, 30) || '이름 없음';
  const note = String(p.note || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, 300);
  const name = clean_(p.name, 120) || '이름 없는 파일';
  const blob = Utilities.newBlob(bytes, String(p.mime || 'application/octet-stream').slice(0, 100), name);
  const f = folder_(INBOX).createFile(blob);
  f.setDescription(JSON.stringify({ from: from, note: note, at: Date.now() }));
  if (inboxPublic_()) share_(f, true);
  cache.put('inboxCount', String(count + 1), 3600);
  return { ok: true, public: inboxPublic_() };
}

// 아침 작업이 'MY BASE 읽기 기록' 폴더에 올린 reading-날짜.json 을 최근 것부터 돌려줘요.
// have 에 { 날짜: 마지막 수정 시각 } 을 보내면 바뀌지 않은 날은 내용 없이 돌려줘요.
function readings_(p) {
  const it = folder_(MARKS).getFiles();
  const byName = {};
  while (it.hasNext()) {
    const f = it.next();
    const n = f.getName();
    if (!/^reading-\d{4}-\d{2}-\d{2}\.json$/.test(n) || f.isTrashed()) continue;
    if (!byName[n] || byName[n].getLastUpdated() < f.getLastUpdated()) byName[n] = f;
  }
  const have = p.have && typeof p.have === 'object' ? p.have : {};
  const limit = Math.min(Math.max(Number(p.limit) || 21, 1), 40);
  const names = Object.keys(byName).sort().reverse().slice(0, limit);
  const out = { ok: true, days: [] };
  names.forEach(function (n, i) {
    const f = byName[n];
    const date = n.slice(8, 18);
    const u = f.getLastUpdated().getTime();
    if (have[date] === u) {
      out.days.push({ date: date, u: u, same: true });
      return;
    }
    let d;
    try {
      d = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
    } catch (e) {
      return;
    }
    if (!d || typeof d !== 'object') return;
    if (i === 0) {
      if (Array.isArray(d.wordbook)) out.wordbook = d.wordbook;
      if (Array.isArray(d.tests)) out.tests = d.tests;
      if (typeof d.streak === 'number') out.streak = d.streak;
    }
    delete d.wordbook;
    delete d.tests;
    delete d.streak;
    d.date = date;
    d.u = u;
    out.days.push(d);
  });
  return out;
}

// ===== MY BASE 코드 끝 (이 줄 아래에는 아무것도 없어야 해요) =====
