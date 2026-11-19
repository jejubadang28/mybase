# MY BASE 사이트

사이트 주소: https://jejubadang28.github.io/mybase/

내 자료와 하루 공부를 모아 두는 개인 사이트예요.
GitHub Pages에 올리고, 사이트 전체를 비밀번호로 잠가요. 공개 자료실(share.html)만 로그인 없이 열려요.

## 처음 올리기 (폰으로도 돼요)

**준비물**: GitHub 계정(만 13세 이상), 사이트 비밀번호(12자 이상, 16자 이상 권장)

1. **저장소 만들기**
   github.com → 오른쪽 위 `+` → `New repository`
   - Repository name: `내아이디.github.io` (내아이디 자리에 GitHub 아이디)
   - Public 선택 → `Create repository`

2. **파일 올리기** (둘 중 하나)
   - **Claude에게 맡기기**: 저장소 이름을 알려 주면 Claude가 파일을 올려 줘요.
   - **직접 올리기**: 컴퓨터에서 zip을 풀고, 저장소 화면 `Add file` → `Upload files`에 폴더 안의 파일과 폴더를 모두 끌어다 놓고 `Commit changes`.
     `.github` 폴더는 숨김 폴더라 빠질 수 있어요. 빠졌다면 `Add file` → `Create new file`에서 이름을 `.github/workflows/deploy.yml`로 하고 내용을 붙여 넣으세요.

3. **비밀번호 넣기**
   저장소 `Settings` → `Secrets and variables` → `Actions` → `New repository secret`
   - Name: `STATICRYPT_PASSWORD`
   - Secret: 사이트 비밀번호 → `Add secret`

4. **Pages 켜기**
   `Settings` → `Pages` → Build and deployment의 Source를 `GitHub Actions`로 바꾸기

5. **사이트 만들기**
   `Actions` 탭 → `사이트 올리기` → `Run workflow`
   초록 체크가 뜨면 `https://내아이디.github.io` 에서 열려요. (1~2분 걸려요)

6. **폰 홈 화면에 추가**
   - 아이폰(사파리): 공유 버튼 → 홈 화면에 추가
   - 안드로이드(크롬): 오른쪽 위 메뉴 → 홈 화면에 추가 또는 앱 설치

## 자주 하는 일

| 하고 싶은 것 | 고칠 곳 |
|---|---|
| 파일 목록, 공개 여부, 일정, 시간표, 자주 가는 사이트 | `data.js` |
| 아침 읽기 글과 단어장 | `reading` 폴더 (형식: `reading/README.md`) |
| 발표 넣기 | `slides` 폴더에 HTML 파일을 넣고, `data.js`의 `decks`에 `url: 'slides/파일이름.html'` 추가 |
| 비밀번호 바꾸기 | `Settings` → `Secrets and variables` → `Actions`에서 바꾸고, `Actions` 탭에서 다시 실행 |
| 로그인 화면 디자인 | `login-template.html` |

파일을 고쳐서 올리면 1~2분 뒤 사이트가 저절로 바뀌어요.

## 꼭 알아 둘 점

- **공개 저장소의 원본은 누구나 볼 수 있어요.** 사이트는 비밀번호로 잠겨도, GitHub 저장소에 있는 `data.js`와 `reading` 폴더 같은 원본 파일은 잠기지 않아요. 남에게 보이면 안 되는 내용은 넣지 말거나 비공개 저장소를 쓰세요. 무료 계정에서 비공개 저장소로 Pages를 쓰려면 GitHub Pro가 필요해요(학생은 GitHub Education 혜택으로 받을 수 있어요).
- **`slides` 폴더는 잠기지 않아요.** 공개해도 되는 발표만 넣으세요.
- **아직 저장되지 않는 것**: 사이트에서 쓴 메모와 할 일, 사이트에서 올린 파일, 새로 만든 일정, 읽기 풀이 결과는 새로고침하면 사라져요. 저장 공간을 연결하면 남게 할 수 있어요.
- **알림**: 사이트(또는 홈 화면 앱)가 열려 있을 때 알려 줘요. 아이폰은 홈 화면에 추가한 아이콘으로 열어야 알림을 켤 수 있어요.

## 폴더 구성

```
app.html              사이트 본체 (홈, 아침 읽기, 캘린더, 자료실, 발표)
index.html            미리보기용 로그인 화면 (실제 사이트에서는 잠긴 app.html이 이 자리에 들어가요)
share.html            공개 자료실 (로그인 없이 열림)
login-template.html   실제 사이트의 로그인 화면 디자인
style.css, script.js  디자인과 동작
data.js               내 자료 목록
reading/              아침 읽기 자료
icons/, manifest.json, sw.js   앱 설치와 알림
build.mjs, package.json, .staticrypt.json   사이트 만들기 도구
.github/workflows/deploy.yml   GitHub에 올리면 자동으로 사이트를 만드는 설정
```
