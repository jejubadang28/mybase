// MY BASE 사이트 만들기
// 1) app.html 에 스타일·자료·동작을 모두 합쳐 한 파일로 만들고
// 2) 그 파일을 비밀번호로 잠가 dist/index.html 로 만들어요 (StatiCrypt, 디자인은 login-template.html)
// 3) 공개 자료실(share.html)에는 공개로 표시한 파일과 발표만 따로 넣어요 (dist/public.js)
// 실행: STATICRYPT_PASSWORD=비밀번호 node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
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
if (password.length < 12) stop('비밀번호가 ' + password.length + '자라서 너무 짧아요. 12자 이상(16자 이상 권장)으로 바꿔 주세요.');

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
};
console.log(`아침 읽기 ${readings.length}일치, 단어장 ${READING.wordbook.length}개를 넣었어요.`);

// ---------- 앱 한 파일로 합치기 ----------
let app = read('app.html');
app = swap(app, '<link rel="stylesheet" href="style.css">', `<style>\n${read('style.css')}\n</style>`, 'app.html 스타일');
app = swap(app, '<script src="data.js"></script>', `<script>\n${safe(read('data.js'))}\nwindow.READING = ${safe(JSON.stringify(READING))};\n</script>`, 'app.html 자료');
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
writeFileSync('dist/share.html', swap(read('share.html'), '<script src="data.js"></script>', '<script src="public.js"></script>', 'share.html 자료'));
console.log(`공개 자료실: 파일 ${pub.files.length}개, 발표 ${pub.decks.length}개`);

// ---------- 나머지 파일 ----------
for (const f of ['style.css', 'script.js', 'manifest.json', 'sw.js']) cpSync(f, `dist/${f}`);
cpSync('icons', 'dist/icons', { recursive: true });
if (existsSync('slides')) cpSync('slides', 'dist/slides', { recursive: true });
rmSync('.build', { recursive: true, force: true });

console.log('\n다 만들었어요. dist 폴더가 실제로 올라가는 사이트예요.\n');
