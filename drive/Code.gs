/**
 * MY BASE 드라이브 연결 (Google Apps Script)
 *
 * 구글 드라이브에 "MY BASE" 폴더를 만들고 그 안에 저장해요.
 *   MY BASE/자료실  사이트에서 올린 파일
 *   MY BASE/발표    사이트에서 올린 HTML 발표
 *   MY BASE/기록    메모·할 일·일정·사이트(data.json), 아침 읽기에서 푼 기록(readmarks-날짜.json)
 *
 * KEY 는 GitHub 의 DRIVE_KEY 와 똑같아야 해요. 이 파일을 GitHub 에 올릴 때는 KEY 를 비워 두세요.
 * 코드를 고치면 "배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포" 를 해야 사이트에 반영돼요.
 */
const KEY = '';
const ROOT_NAME = 'MY BASE';
const MAX_BYTES = 35 * 1024 * 1024;

/** 처음 한 번 ▶ 실행: 폴더를 만들고 드라이브 권한을 받아요. */
function setup() {
  if (KEY.length < 16) throw new Error('맨 위 KEY 를 먼저 채워 주세요 (16자 이상).');
  ['자료실', '발표', '기록'].forEach(folder_);
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
    if (!isPublic_(f)) return { ok: false, error: '공개 자료가 아니에요' };
    return { ok: true, name: f.getName(), text: f.getBlob().getDataAsString('UTF-8') };
  }

  if (KEY.length < 16 || p.key !== KEY) return { ok: false, error: '열쇠가 맞지 않아요' };

  switch (action) {
    case 'ping':
      return { ok: true };
    case 'list':
      return { ok: true, items: list_(false) };
    case 'get': {
      const f = mine_(p.id);
      return { ok: true, name: f.getName(), text: f.getBlob().getDataAsString('UTF-8') };
    }
    case 'upload':
      return withLock_(function () { return upload_(p); });
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
        writeText_(folder_('기록'), 'readmarks-' + p.date + '.json', JSON.stringify(p.mark || {}, null, 1));
        return { ok: true };
      });
    }
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
  const decks = folder_('발표').getId();
  const ps = f.getParents();
  while (ps.hasNext()) if (ps.next().getId() === decks) return 'decks';
  return 'files';
}

/** 자료실·발표 폴더 안의 파일만 다뤄요. 다른 드라이브 파일은 건드리지 않아요. */
function mine_(id) {
  const f = DriveApp.getFileById(String(id || ''));
  const ok = [folder_('자료실').getId(), folder_('발표').getId()];
  if (f.isTrashed()) throw new Error('지운 파일이에요');
  const ps = f.getParents();
  while (ps.hasNext()) if (ok.indexOf(ps.next().getId()) !== -1) return f;
  throw new Error('MY BASE 폴더의 파일이 아니에요');
}

function item_(f, kind) {
  return {
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
  [['files', '자료실'], ['decks', '발표']].forEach(function (pair) {
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
