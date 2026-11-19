# 아침 읽기 → MY BASE 형식 안내

매일 아침 만들어지는 영어 읽기를 MY BASE 사이트에서 바로 보려면, 이 폴더에 아래 형식의 JSON 파일로 저장하면 돼요.
사이트는 이 파일들을 읽어서 읽기 목록, 읽기 화면(단어 뜻, 핵심 질문, 뜻 고르기, 떠올리기, 단어 조각), 학습 현황을 그려요.

## 1. 폴더 구성

```
reading/
  index.json          목록과 연속으로 읽은 날
  2026-11-10.json     하루치 읽기 (날짜마다 파일 하나, 한국 시간 기준 날짜)
  wordbook.json       단어장 전체
  tests.json          일요일 주간 점검 결과
```

- 사이트는 `index.json`의 `days`에 적힌 날짜 파일만 불러와요.
- 새 날을 넣을 때는 ① 날짜 파일을 만들고 ② `days` 맨 앞에 그 날짜를 넣어요.
- 모두 **JSON**이에요. 큰따옴표만 쓰고, 마지막 항목 뒤에 쉼표를 붙이지 마세요.

## 2. index.json

```json
{
  "streak": 12,
  "days": ["2026-11-10", "2026-11-09", "2026-11-06"]
}
```

| 이름 | 뜻 |
|---|---|
| `streak` | 연속으로 읽은 날 수 |
| `days` | 사이트에 보여 줄 날짜들. 순서는 상관없어요(사이트가 최신순으로 정렬해요) |

## 3. 하루치 파일 (YYYY-MM-DD.json)

| 이름 | 뜻 |
|---|---|
| `date` | 날짜 `"2026-11-19"` |
| `wordCount`, `minutes` | 전체 단어 수, 읽는 데 걸리는 시간(분) |
| `articles` | 글 목록 (아래 표) |
| `gloss` | 본문에 나온 모든 기본형 단어의 뜻. `{ "기본형": { "ko", "parts", "isNew", "note" } }` |
| `quiz` | 뜻 고르기 문제 |
| `recall` | 떠올리기 문제 (`cloze`, `ko2en`, `pattern` 세 종류) |
| `roots` | 오늘의 단어 조각. `en`(영어 어근), `ko`(한자어) |
| `result` | 처음에는 `null`. 사이트에서 다 풀면 결과가 들어가요 |

**글 하나 (`articles` 안)**

| 이름 | 뜻 |
|---|---|
| `id` | `"a1"`, `"a2"` … |
| `tag` | `AI`, `수학`, `물리`, `화학`, `생명`, `우주`, `역사`, `인물`, `자연`, `심리`, `게임`, `말`, `스포츠`, `지리`, `예술`, `생활` 중 하나 |
| `title`, `source` | 제목, 출처(주소나 글) |
| `paragraphs` | 문단 목록. 목표 단어는 `{{보이는 형태|기본형}}` 으로 표시 (예: `{{adapted|adapt}}`) |
| `keyQ` | 핵심 질문 `{ "question", "choices"(4개), "answer", "explain" }` |

**떠올리기 (`recall` 안)**

- `cloze`: `{ "id", "type": "cloze", "word", "prompt", "hint", "answer", "accept": [허용 철자], "explain" }`
- `ko2en`: `{ "id", "type": "ko2en", "word", "prompt"(한국어 뜻), "hint", "answer", "accept", "explain" }`
- `pattern`(예문 따라 쓰기): `{ "id", "type": "pattern", "word", "example", "exampleKo", "prompt"(한국어 문장), "hint", "model"(모범 답안) }`

**꼭 지킬 것**

1. 본문의 `{{…|기본형}}` 기본형은 모두 `gloss`에 있어야 해요. 없으면 단어를 눌렀을 때 뜻이 안 나와요.
2. `answer`는 `choices` 안의 글자와 **똑같아야** 해요.
3. `roots`의 `examples`는 `{ "word", "split", "ko" }`. `tip`은 있어도 되고 없어도 돼요.

## 4. wordbook.json

```json
[
  { "word": "adapt", "ko": "적응하다", "parts": "ad + apt", "status": "learning", "due": "2026-11-20" }
]
```

`status`: `known`(외운 단어), `shaky`(거의 다 온), `learning`(배우는 중), `expose`(익히는 중)

## 5. tests.json

```json
[
  { "date": "2026-11-15", "pct": 75 }
]
```

## 6. 지금 아침 읽기 자료에서 옮길 때

| 지금 있는 곳 | MY BASE |
|---|---|
| `readings/<날짜>` 문서의 `articles`, `gloss`, `quiz`, `recall` | 하루치 파일에 그대로 |
| `roots/<날짜>` (영어 어근) | `roots.en` (`form`, `part`, `meaning`, `examples`, `tip`) |
| `hroots/<날짜>` (한자어) | `roots.ko` (같은 이름들) |
| `wordbook/main`의 `words` | `wordbook.json`. `stage`가 `expose`면 `status`를 `"expose"`로, 아니면 `status` 그대로 |
| `wordbook/main`의 `testHistory` | `tests.json` (`date`, `pct`만) |

## 7. 예시: 하루치 파일

```json
{
  "date": "2026-11-19",
  "wordCount": 150,
  "minutes": 2,
  "articles": [
    {
      "id": "a1",
      "tag": "자연",
      "title": "Why Cats Purr",
      "source": "예시 글",
      "paragraphs": [
        "Cats purr when they are relaxed, but they also purr when they are hurt. Scientists think purring may help cats {{recover|recover}} because the low sound can {{stimulate|stimulate}} healing."
      ],
      "keyQ": {
        "question": "고양이가 다쳤을 때도 가르랑거리는 까닭으로 알맞은 것은?",
        "choices": ["회복을 돕기 위해서", "배가 고파서", "주인을 부르려고", "잠이 와서"],
        "answer": "회복을 돕기 위해서",
        "explain": "recover(회복하다)를 알면 답이 보여요."
      }
    }
  ],
  "gloss": {
    "recover": { "ko": "회복하다", "parts": "re(다시) + cover(얻다)", "isNew": true, "note": "discover(발견하다)와 헷갈리지 마세요." },
    "stimulate": { "ko": "자극하다, 촉진하다", "parts": "", "isNew": true, "note": "" }
  },
  "quiz": [
    {
      "id": "q1",
      "word": "stimulate",
      "sentence": "The low sound can {{stimulate|stimulate}} healing.",
      "choices": ["자극하다, 촉진하다", "흉내 내다", "멈추게 하다", "숨기다"],
      "answer": "자극하다, 촉진하다",
      "explain": "simulate(흉내 내다)와 철자가 비슷해요."
    }
  ],
  "recall": [
    { "id": "r1", "type": "cloze", "word": "recover", "prompt": "It took a week to r______ from the cold.", "hint": "회복하다", "answer": "recover", "accept": ["recover"], "explain": "" },
    { "id": "r2", "type": "pattern", "word": "recover from", "example": "She recovered from the flu.", "exampleKo": "그녀는 독감에서 회복했다.", "prompt": "나는 감기에서 회복했다.", "hint": "from을 빼먹지 마세요.", "model": "I recovered from my cold." }
  ],
  "roots": {
    "en": { "form": "spect", "part": "어근", "meaning": "보다", "examples": [{ "word": "inspect", "split": "in(안을) + spect", "ko": "점검하다" }], "tip": "" },
    "ko": { "form": "관", "meaning": "볼 관, 보다", "examples": [{ "word": "관찰", "split": "관(볼) + 찰(살필)", "ko": "자세히 살펴봄" }] }
  },
  "result": null
}
```

## 8. 아침 예약 작업에 붙일 문장

아침 예약 작업("아침 신기술 브리핑") 설명 맨 끝에 아래 내용을 붙이면, 사이트에서 푼 기록이 단어장에 반영되고 매일 아침 글이 사이트에도 올라가요.

```
[5. MY BASE 사이트와 연결]
가) 사이트에서 푼 기록 가져오기 — 2번의 4번(단어장 갱신)보다 먼저 하세요.
   Google Drive 의 "MY BASE/기록" 폴더에서 이름이 readmarks-YYYY-MM-DD.json 인 파일을 최근 14일 치 찾으세요.
   파일은 readmarks/<날짜> 문서와 같은 모양이에요(quiz, keyq, recall, unknown, gloss, result. picked·doneAt 은 무시).
   processedMarks 에 없는 날짜만, 같은 날짜의 readmarks 문서가 없으면 그 내용으로 set 하고, 있으면 문항 id 별로 합치세요(같은 문항이 두 곳에 다 있으면 원래 문서 쪽을 남기기).
   폴더나 파일이 없으면 이 단계는 건너뛰세요.
나) 사이트에 오늘 글 올리기 — 글을 만든 날에만, 4번 메시지를 보내기 전에 하세요.
   0) add_repo 도구로 저장소 jejubadang28/mybase 를 access "push" 로 붙이고, 알려 주는 명령으로 clone 하세요. 형식은 그 저장소의 reading/README.md 를 따르세요.
   1) 오늘 만든 readings/<오늘날짜> 문서를 reading/<오늘날짜>.json 으로 저장하세요.
      minutes 는 wordCount ÷ 120 을 반올림한 값, roots.en 에는 roots/<오늘날짜>, roots.ko 에는 hroots/<오늘날짜> 를 넣고, result 는 null 로 두세요.
      reading/index.json 의 days 가 비어 있으면(처음 한 번) 최근 14일의 readings 문서도 같은 방법으로 함께 옮기세요.
   2) reading/index.json 의 days 맨 앞에 오늘 날짜를 넣고 streak 을 연속으로 읽은 날 수로 바꾸세요.
   3) reading/wordbook.json 을 wordbook/main 의 words 로 다시 쓰세요. 항목은 word, ko, parts, status, due 만 남기고, stage 가 expose 면 status 를 "expose" 로 쓰세요.
   4) wordbook/main 의 testHistory 로 reading/tests.json 을 다시 쓰세요. 항목은 date, pct 만 남기세요.
   5) 파일마다 JSON 이 올바른지, 본문의 모든 기본형이 gloss 에 있는지, answer 가 choices 안에 있는지 확인하세요.
   6) "아침 읽기 M/D" 메시지로 커밋하고 main 에 push 하세요. push 하면 1~2분 뒤 사이트가 자동으로 바뀌어요.
   7) push 가 안 되면 메시지 맨 끝에 "MY BASE 저장 실패: 이유" 한 줄을 쓰세요.
```
