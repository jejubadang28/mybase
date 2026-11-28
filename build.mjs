// MY BASE 사이트 만들기
// 1) app.html 에 스타일·자료·동작을 모두 합쳐 한 파일로 만들고
// 2) 그 파일을 비밀번호로 잠가 dist/index.html 로 만들어요 (StatiCrypt, 디자인은 login-template.html)
// 3) 공개 자료실(share.html)에는 공개로 표시한 파일과 발표만 따로 넣어요 (dist/public.js)
// 4) slides 폴더의 발표 중 공개가 아닌 것은 같은 비밀번호로 잠가요
// 5) DRIVE_URL·DRIVE_KEY 가 있으면 구글 드라이브에 저장해요 (drive/Code.gs)
// 실행: STATICRYPT_PASSWORD=비밀번호 node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

// 멈출 때는 실행 결과 첫 화면(Annotations)에도 이유가 보이게 해요.
function stop(msg) {
  console.error('\n[멈춤] ' + msg + '\n');
  if (process.env.GITHUB_ACTIONS) console.log('::error title=사이트 만들기 멈춤::' + msg);
  process.exit(1);
}
process.on('uncaughtException', (e) => stop(String((e && e.message) || e)));

const password = process.env.STATICRYPT_PASSWORD || '';
if (!password) stop('비밀번호가 없어요. Settings → Secrets and variables → Actions 에서 이름이 정확히 STATICRYPT_PASSWORD 인 Repository secret 을 만들어 주세요.');

// ---------- 구글 드라이브 연결 (없으면 이 기기에만 저장) ----------
const DRIVE_URL = (process.env.DRIVE_URL || '').trim();
const DRIVE_KEY = (process.env.DRIVE_KEY || '').trim();
if (DRIVE_URL && !/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/.test(DRIVE_URL)) stop('DRIVE_URL 이 웹 앱 주소 모양이 아니에요. https://script.google.com/macros/s/ 로 시작하고 /exec 로 끝나는 주소를 넣어 주세요.');
if (DRIVE_URL && DRIVE_KEY.length < 16) stop('DRIVE_KEY 가 없거나 16자보다 짧아요. 드라이브 코드 맨 위 KEY 와 같은 값을 넣어 주세요.');
if (!DRIVE_URL && DRIVE_KEY) stop('DRIVE_KEY 만 있고 DRIVE_URL 이 없어요. 웹 앱 주소를 DRIVE_URL 로 넣어 주세요.');
console.log(DRIVE_URL ? '구글 드라이브 연결: 켜짐' : '구글 드라이브 연결: 없음 (이 기기에만 저장)');
const driveApp = DRIVE_URL ? `window.DRIVE = ${JSON.stringify({ url: DRIVE_URL, key: DRIVE_KEY })};\n` : '';
const drivePublic = DRIVE_URL ? `<script>window.DRIVE = ${JSON.stringify({ url: DRIVE_URL })};</script>\n` : '';

const read = (p) => readFileSync(p, 'utf8');
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(read(p)) : fallback);
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
function swap(html, from, to, label) {
  if (!html.includes(from)) throw new Error(`[멈춤] ${label}: "${from}" 을(를) 찾지 못했어요.`);
  return html.replace(from, () => to);
}

rmSync('dist', { recursive: true, force: true });
rmSync('.build', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
mkdirSync('.build', { recursive: true });

// ---------- 아침 읽기 자료 모으기 ----------
const idx = readJson('reading/index.json', { streak: 0, days: [] });
const readings = (idx.days || [])
  .filter((d) => existsSync(`reading/${d}.json`))
  .map((d) => readJson(`reading/${d}.json`));
const READING = {
  streak: idx.streak || 0,
  readings,
  wordbook: readJson('reading/wordbook.json', []),
  tests: readJson('reading/tests.json', []),
  roots: readJson('reading/roots.json', { en: [], ko: [] }),
};
console.log(`아침 읽기 ${readings.length}일치, 단어장 ${READING.wordbook.length}개를 넣었어요.`);
// 나이스에서 받은 우리 반 시간표(바뀐 수업 포함). 없으면 data.js 의 기본 시간표만 써요.
let ttLive = null;
try {
  if (process.env.TIMETABLE_LIVE && existsSync(process.env.TIMETABLE_LIVE)) ttLive = JSON.parse(readFileSync(process.env.TIMETABLE_LIVE, 'utf8'));
} catch (e) { ttLive = null; }
console.log(ttLive ? `나이스 시간표: ${Object.keys(ttLive.days || {}).length}일 치 (받은 때 ${ttLive.fetchedAt})` : '나이스 시간표: 없음 (기본 시간표만)');

// ---------- 앱 한 파일로 합치기 ----------
let app = read('app.html');
app = swap(app, '<link rel="stylesheet" href="style.css">', `<style>\n${read('style.css')}\n</style>`, 'app.html 스타일');
app = swap(app, '<script src="data.js"></script>', `<script>\n${safe(read('data.js'))}\n${safe(driveApp)}window.READING = ${safe(JSON.stringify(READING))};\nwindow.TT_LIVE = ${safe(JSON.stringify(ttLive))};\n</script>`, 'app.html 자료');
app = swap(app, '<script src="script.js"></script>', `<script>\n${safe(read('script.js'))}\n</script>`, 'app.html 동작');
app = swap(app, 'class="logout" href="index.html"', 'class="logout" href="index.html?staticrypt_logout"', 'app.html 로그아웃');
writeFileSync('.build/index.html', app);

// ---------- 비밀번호로 잠그기 ----------
execFileSync('npx', [
  'staticrypt', '.build/index.html',
  '-d', 'dist',
  '--template', 'login-template.html',
  '--template-error', '비밀번호가 맞지 않아요. 다시 입력해 주세요.',
  '--remember', '30',
  '--short',
], { stdio: 'inherit', env: process.env });
if (!existsSync('dist/index.html')) throw new Error('[멈춤] 잠근 파일(dist/index.html)이 만들어지지 않았어요.');

// ---------- 공개 자료실 ----------
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(read('data.js'), ctx);
const S = ctx.window.SITE || {};
const pub = {
  name: S.name || 'MY BASE',
  files: (S.files || []).filter((f) => f.public),
  decks: (S.decks || []).filter((d) => d.public),
  events: [], periods: [], timetable: {}, links: [],
};
writeFileSync('dist/public.js', `/* 공개로 표시한 자료만 들어 있어요. build.mjs 가 만들어요. */\nwindow.SITE = ${JSON.stringify(pub, null, 2)};\n`);
writeFileSync('dist/share.html', swap(read('share.html'), '<script src="data.js"></script>', `${drivePublic}<script src="public.js"></script>`, 'share.html 자료'));
writeFileSync('dist/send.html', swap(read('send.html'), '<!-- DRIVE -->', drivePublic, 'send.html 드라이브 주소'));
console.log(`공개 자료실: 파일 ${pub.files.length}개, 발표 ${pub.decks.length}개`);

// ---------- 나머지 파일 ----------
for (const f of ['style.css', 'script.js', 'manifest.json', 'sw.js']) cpSync(f, `dist/${f}`);
cpSync('icons', 'dist/icons', { recursive: true });

// ---------- 발표 (slides 폴더) ----------
if (existsSync('slides')) {
  const open = new Set((S.decks || []).filter((d) => d.public && /^slides\//.test(d.url || '')).map((d) => d.url.slice('slides/'.length)));
  const all = readdirSync('slides');
  const locked = all.filter((f) => /\.html?$/i.test(f) && !open.has(f));
  mkdirSync('dist/slides', { recursive: true });
  for (const f of all) if (!locked.includes(f)) cpSync(`slides/${f}`, `dist/slides/${f}`, { recursive: true });
  if (locked.length) {
    // 잠금 화면이 한 칸 아래 폴더에서도 스타일·아이콘을 찾도록 주소 앞에 ../ 를 붙여요
    const tpl = read('login-template.html').replace(/\b(href|src)="(?!https?:|#|data:|\/)([^"]+)"/g, '$1="../$2"');
    writeFileSync('.build/login-template-sub.html', tpl);
    execFileSync('npx', [
      'staticrypt', ...locked.map((f) => `slides/${f}`),
      '-d', 'dist/slides',
      '--template', '.build/login-template-sub.html',
      '--template-error', '비밀번호가 맞지 않아요. 다시 입력해 주세요.',
      '--remember', '30',
      '--short',
    ], { stdio: 'inherit', env: process.env });
  }
  console.log(`발표: 잠금 ${locked.length}개, 공개 ${all.length - locked.length}개`);
}
rmSync('.build', { recursive: true, force: true });

console.log('\n다 만들었어요. dist 폴더가 실제로 올라가는 사이트예요.\n');
