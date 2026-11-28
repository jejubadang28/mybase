# 나이스 시간표 자료가 있는지 확인하는 임시 도구 (학교 이름·코드는 찍지 않아요)
import json, os, requests
cfg = json.loads(os.environ['COMCI'])
B = 'https://open.neis.go.kr/hub/'
r = requests.get(B + 'schoolInfo', params={'Type': 'json', 'SCHUL_NM': cfg['q'] + '학교'}, timeout=20).json()
rows = (r.get('schoolInfo') or [{}, {}])[1].get('row', []) if 'schoolInfo' in r else []
print('schoolInfo result:', r.get('RESULT') or (r.get('schoolInfo') or [{}])[0].get('head', [{}, {}])[1], 'rows', len(rows))
rows = [x for x in rows if x.get('LCTN_SC_NM', '').startswith('충청남도') or x.get('ATPT_OFCDC_SC_CODE') == 'N10']
print('충남 rows', len(rows))
if rows:
    s = rows[0]
    for ymd in ['20261127', '20261124', '20261202']:
        t = requests.get(B + 'misTimetable', params={'Type': 'json', 'ATPT_OFCDC_SC_CODE': s['ATPT_OFCDC_SC_CODE'], 'SD_SCHUL_CODE': s['SD_SCHUL_CODE'], 'GRADE': cfg['grade'], 'CLASS_NM': cfg['cls'], 'ALL_TI_YMD': ymd}, timeout=20).json()
        if 'misTimetable' in t:
            head = t['misTimetable'][0]['head']
            data = t['misTimetable'][1]['row']
            print(ymd, 'total', head[0], head[1].get('RESULT'), [(x.get('PERIO'), x.get('ITRT_CNTNT')) for x in data])
        else:
            print(ymd, 'no data', t.get('RESULT'))
