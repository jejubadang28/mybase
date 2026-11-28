# 컴시간 첫 화면 구조를 확인하는 임시 도구 (학교 정보는 쓰지 않아요)
import re, requests
H = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'}
for url in ['http://comci.net:4082/st', 'http://www.comci.net:4082/st', 'http://comci.net:4082/']:
    try:
        r = requests.get(url, headers=H, timeout=20, allow_redirects=False)
        print('URL', url, 'status', r.status_code, 'len', len(r.content), 'loc', r.headers.get('Location'))
        r.encoding = 'euc-kr'
        t = r.text
        for pat in [r'\./[0-9]+\?[0-9]+l', r"sc_data\('[0-9]+_", r'성명=자료\.자료[0-9]+', r'자료\.자료[0-9]+\[sb\]', r'=H시간표\.자료[0-9]+', r'일일자료=Q자료\(자료\.자료[0-9]+', r'원자료=Q자료\(자료\.자료[0-9]+']:
            print('  pat', pat, '->', re.findall(pat, t)[:2])
        for m in re.finditer(r"(url\s*:|\.\/[0-9]+|sc_data|school_ra|frame|src=|location)", t):
            s = max(0, m.start() - 60); print('  ctx:', t[s:m.end() + 80].replace('\n', ' ')[:200])
            if m.start() > 20000: break
    except Exception as e:
        print('URL', url, 'error', repr(e))
