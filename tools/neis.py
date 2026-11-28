# 나이스 교육정보 개방 포털에서 우리 반 시간표(지난 2주, 이번 주, 다음 주)를 받아 JSON 으로 저장해요.
# - days: 날짜별 그날 수업 (학교가 나이스에 바꿔 넣은 교체 수업이 들어 있어요)
# - usual: 요일별로 가장 자주 나온 과목(평소 시간표). 사이트는 이것과 다르면 '바뀜'으로 보여 줘요.
# 학교와 반은 tools/school.enc 에 잠가 두고(DRIVE_KEY 로 풀어요), 나이스 인증키는 NEIS_KEY 비밀값에 둬요.
# 기록(로그)은 누구나 볼 수 있으니 학교 이름이나 코드는 찍지 않아요.
import collections
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

KST = datetime.timezone(datetime.timedelta(hours=9))
BASE = 'https://open.neis.go.kr/hub/'


def call(path, **params):
    params.update({'KEY': os.environ['NEIS_KEY'], 'Type': 'json', 'pIndex': 1, 'pSize': 500})
    url = BASE + path + '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.loads(r.read().decode('utf-8'))
    if path not in data:
        res = data.get('RESULT', {})
        if res.get('CODE') == 'INFO-200':  # 자료 없음
            return []
        raise RuntimeError(f"나이스 응답: {res.get('CODE')} {res.get('MESSAGE')}")
    return data[path][1]['row']


def main(out_path):
    if not os.environ.get('NEIS_KEY'):
        print('나이스 인증키(NEIS_KEY)가 없어서 시간표 받기를 건너뛰어요.')
        return 0
    cfg = json.loads(os.environ['COMCI'])
    schools = call('schoolInfo', SCHUL_NM=cfg['q'] + '학교')
    region = cfg.get('region', '')
    schools = [s for s in schools if not region or region in s.get('LCTN_SC_NM', '') or s.get('ATPT_OFCDC_SC_CODE') == 'N10']
    if len(schools) != 1:
        print(f'학교를 하나로 찾지 못했어요 ({len(schools)}개)')
        return 1
    s = schools[0]

    today = datetime.datetime.now(KST).date()
    monday = today - datetime.timedelta(days=today.weekday())
    if today.weekday() >= 5:  # 토·일이면 다가오는 주를 '이번 주'로 봐요
        monday += datetime.timedelta(days=7)
    start, end = monday - datetime.timedelta(days=14), monday + datetime.timedelta(days=11)
    rows = call('misTimetable', ATPT_OFCDC_SC_CODE=s['ATPT_OFCDC_SC_CODE'], SD_SCHUL_CODE=s['SD_SCHUL_CODE'],
                GRADE=cfg['grade'], CLASS_NM=cfg['cls'],
                TI_FROM_YMD=start.strftime('%Y%m%d'), TI_TO_YMD=end.strftime('%Y%m%d'))

    days = collections.defaultdict(dict)
    for r in rows:
        ymd, p, subj = r.get('ALL_TI_YMD', ''), int(r.get('PERIO') or 0), (r.get('ITRT_CNTNT') or '').strip()
        if len(ymd) == 8 and p > 0:
            key = f'{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}'
            if datetime.date.fromisoformat(key).isoweekday() >= 6:  # 토·일(토요휴업일 등)은 빼요
                continue
            days[key][p] = subj
    out_days = {}
    for d, per in sorted(days.items()):
        n = max(per)
        out_days[d] = [per.get(i, '') for i in range(1, n + 1)]

    # 요일·교시마다 가장 자주 나온 과목 = 평소 시간표
    count = collections.defaultdict(collections.Counter)
    for d, lst in out_days.items():
        wd = datetime.date.fromisoformat(d).isoweekday()
        for i, subj in enumerate(lst):
            count[(wd, i)][subj] += 1
    usual = {}
    for (wd, i), c in count.items():
        usual.setdefault(str(wd), {})[str(i)] = c.most_common(1)[0][0]
    usual = {wd: [v.get(str(i), '') for i in range(max(int(k) for k in v) + 1)] for wd, v in usual.items()}

    out = {'fetchedAt': datetime.datetime.now(KST).strftime('%Y-%m-%d %H:%M'), 'source': 'neis',
           'from': start.isoformat(), 'to': end.isoformat(), 'days': out_days, 'usual': usual}
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f'{len(out_days)}일 치 시간표를 받았어요 ({start.isoformat()} ~ {end.isoformat()}).')
    names = '월화수목금토일'
    for wd in sorted(usual, key=int):
        print(f"  평소 {names[int(wd) - 1]}: {' · '.join(usual[wd])}")
    diffs = []
    for d, lst in out_days.items():
        u = usual.get(str(datetime.date.fromisoformat(d).isoweekday()), [])
        n = sum(1 for i in range(max(len(lst), len(u))) if (lst[i] if i < len(lst) else '') != (u[i] if i < len(u) else ''))
        if n:
            diffs.append(f'{d[5:]} {n}개')
    print('  평소와 다른 날: ' + (', '.join(diffs) if diffs else '없음'))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
