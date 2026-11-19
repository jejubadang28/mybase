/* MY BASE 자료 목록
   이 파일만 고치면 사이트 내용이 바뀌어요.
   - public: true 로 두면 로그인 없이 공개 자료실(share.html)에도 나와요.
   - 지금 들어 있는 내용은 모두 예시예요. */
window.SITE = {
  name: 'MY BASE',

  /* 자료실 파일. group: doc(문서) / media(사진·영상) / pack(압축) */
  files: [
    { id: 'f1', name: '과학 탐구 보고서 최종본', type: 'PDF', group: 'doc', size: '2.4MB', when: '어제 수정', public: true, url: '#' },
    { id: 'f2', name: '실험 촬영 원본', type: 'MP4', group: 'media', size: '1.2GB', when: '2일 전', public: false, url: '#' },
    { id: 'f3', name: '독서 기록장 2학기', type: 'HWP', group: 'doc', size: '860KB', when: '3일 전', public: false, url: '#' },
    { id: 'f4', name: '발표 사진 모음', type: 'ZIP', group: 'pack', size: '340MB', when: '지난주', public: false, url: '#' },
    { id: 'f5', name: '영어 수행평가 초안', type: 'DOCX', group: 'doc', size: '120KB', when: '지난주', public: false, url: '#' },
    { id: 'f6', name: '그래프 캡처', type: 'PNG', group: 'media', size: '3.1MB', when: '지난달', public: false, url: '#' },
    { id: 'f7', name: '수학 오답 노트', type: 'PDF', group: 'doc', size: '5.8MB', when: '지난달', public: false, url: '#' },
    { id: 'f8', name: '현미경 관찰 사진', type: 'JPG', group: 'media', size: '4.4MB', when: '9월', public: true, url: '#' }
  ],

  /* 발표 (HTML 프레젠테이션) */
  decks: [
    { id: 'd1', title: '블랙홀은 어떻게 빛을 삼킬까', date: '11.12', slides: 14, public: true, url: '#' },
    { id: 'd2', title: 'AI는 단어의 뜻을 어떻게 배울까', date: '10.28', slides: 18, public: true, url: '#' },
    { id: 'd3', title: '게임 속 확률은 정말 공평할까', date: '10.05', slides: 11, public: false, url: '#' }
  ],

  /* 캘린더 일정
     - date: 날짜(반복하면 시작 날짜) / allDay: 종일 / start·end: 시간
     - repeat.freq: none(안 함) / daily(매일) / weekly(매주) / monthly(매달) / yearly(매년)
     - repeat.interval: 몇 번마다 / repeat.byDay: 매주일 때 요일(0 = 일 … 6 = 토) / repeat.until: 이 날까지
     - color: blue / teal / amber / red / violet / pink
     - dday: true 면 D-day에도 나와요 / skip: 반복 중 빠진 날
     - alarm: 알림. 시간 있는 일정은 '0'(정시) '5' '10' '30' '60' '1440'(하루 전) 분 전, 종일 일정은 'd8'(당일 오전 8시) 'p20'(전날 오후 8시), 빈칸은 알림 없음 */
  events: [
    { id: 'e1', alarm: '10', title: '동아리 모임', date: '2026-11-04', allDay: false, start: '16:30', end: '17:30', location: '과학실', color: 'teal', dday: false, memo: '', repeat: { freq: 'weekly', interval: 1, byDay: [3], until: '' }, skip: [] },
    { id: 'e2', alarm: '30', title: '수학 학원', date: '2026-11-03', allDay: false, start: '18:00', end: '20:00', location: '학원', color: 'violet', dday: false, memo: '', repeat: { freq: 'weekly', interval: 1, byDay: [2, 4], until: '' }, skip: [] },
    { id: 'e3', alarm: 'd8', title: '한 달 계획 세우기', date: '2026-11-01', allDay: true, start: '', end: '', location: '', color: 'amber', dday: false, memo: '', repeat: { freq: 'monthly', interval: 1, byDay: [], until: '' }, skip: [] },
    { id: 'e4', alarm: '10', title: '독서 토론', date: '2026-11-25', allDay: false, start: '15:00', end: '16:00', location: '도서관', color: 'teal', dday: false, memo: '', repeat: { freq: 'none' }, skip: [] },
    { id: 'e5', alarm: 'p20', title: '영어 수행평가 마감', date: '2026-11-27', allDay: true, start: '', end: '', location: '', color: 'blue', dday: true, memo: '', repeat: { freq: 'none' }, skip: [] },
    { id: 'e6', alarm: 'p20', title: '과학 보고서 제출', date: '2026-12-01', allDay: true, start: '', end: '', location: '', color: 'blue', dday: true, memo: '', repeat: { freq: 'none' }, skip: [] },
    { id: 'e7', alarm: 'p20', title: '기말고사 시작', date: '2026-12-08', allDay: true, start: '', end: '', location: '', color: 'red', dday: true, memo: '', repeat: { freq: 'none' }, skip: [] },
    { id: 'e8', alarm: '', title: '기말고사 끝', date: '2026-12-11', allDay: true, start: '', end: '', location: '', color: 'red', dday: false, memo: '', repeat: { freq: 'none' }, skip: [] },
    { id: 'e9', alarm: '', title: '겨울방학', date: '2026-12-31', allDay: true, start: '', end: '', location: '', color: 'amber', dday: true, memo: '', repeat: { freq: 'none' }, skip: [] }
  ],

  /* 시간표: 교시별 시작·끝 시간, 요일별 과목 (1 = 월요일 … 5 = 금요일) */
  periods: [
    ['09:00', '09:45'], ['09:55', '10:40'], ['10:50', '11:35'], ['11:45', '12:30'],
    ['13:30', '14:15'], ['14:25', '15:10'], ['15:20', '16:05']
  ],
  timetable: {
    1: ['국어', '수학', '영어', '과학', '체육', '사회'],
    2: ['영어', '과학', '도덕', '수학', '미술', '미술', '국어'],
    3: ['수학', '국어', '정보', '영어', '사회', '음악'],
    4: ['과학', '영어', '수학', '체육', '기술·가정', '기술·가정', '창체'],
    5: ['사회', '국어', '영어', '수학', '과학', '진로']
  },

  /* 자주 가는 사이트. url을 비워 두면 '주소 넣기' 칸으로 보여요. */
  links: [
    { name: '학교 홈페이지', url: '' },
    { name: 'e학습터', url: 'https://cls.edunet.net/' },
    { name: 'EBS', url: 'https://www.ebs.co.kr/' },
    { name: '구글 클래스룸', url: 'https://classroom.google.com/' },
    { name: '네이버 영어사전', url: 'https://en.dict.naver.com/' },
    { name: '구글 드라이브', url: 'https://drive.google.com/' }
  ]
};
