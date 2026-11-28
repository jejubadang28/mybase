# 컴시간에서 우리 반 시간표(이번 주, 다음 주)를 받아 JSON 으로 저장해요.
# 바뀐 수업(교체)은 ch: true 와 원래 과목 o 로 표시해요.
# 학교와 반은 tools/school.enc 에 잠가 두고, 사이트 만들기에서 DRIVE_KEY 로 풀어서 COMCI 로 넘겨줘요.
# 기록(로그)은 누구나 볼 수 있으니 학교 이름은 찍지 않아요.
import datetime
import json
import os
import re
import sys

from pycomcigan import TimeTable, get_school_code

KST = datetime.timezone(datetime.timedelta(hours=9))


def main(out_path):
    cfg = json.loads(os.environ['COMCI'])
    grade, cls = int(cfg['grade']), int(cfg['cls'])
    found = get_school_code(cfg['q'])
    cands = [r for r in found if not cfg.get('region') or cfg['region'] in str(r[1])]
    if len(cands) != 1:
        print(f'학교를 하나로 찾지 못했어요: 검색 {len(found)}개, 지역이 맞는 것 {len(cands)}개')
        return 1
    local_code, region, name, code = cands[0]
    print(f'학교를 찾았어요 (지역: {region})')

    out = {'fetchedAt': datetime.datetime.now(KST).strftime('%Y-%m-%d %H:%M'), 'days': {}}
    changed = 0
    for week in (0, 1):
        tt = TimeTable(name, local_code=local_code, school_code=code, week_num=week)
        m = re.findall(r'\d+', str(tt.start_date))
        start = datetime.date(int(m[0]), int(m[1]), int(m[2]))
        if week == 0:
            out['updated'] = str(tt.update_date)
        days = tt.timetable[grade][cls]
        for d in range(1, 6):
            if d >= len(days):
                break
            rows = []
            for x in days[d]:
                o = x.original.subject if x.original else ''
                rows.append({'s': x.subject, 't': x.teacher, 'ch': bool(x.replaced), 'o': o})
            while rows and not rows[-1]['s']:
                rows.pop()
            changed += sum(1 for r in rows if r['ch'])
            out['days'][(start + datetime.timedelta(days=d - 1)).isoformat()] = rows

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"{len(out['days'])}일 치를 받았어요. 바뀐 수업 {changed}개")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
