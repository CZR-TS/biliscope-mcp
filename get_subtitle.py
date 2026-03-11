import urllib.request as r
import json
import sys

sessdata = 'dc83cf69%2C1788569480%2C77314%2A32CjB_T2eUnKUDC2YVGV9s9_Wn8zyFiFkQP7KgYdT_kXMkq7GFjEgrNfA4Tj9JndOQ1DUSVlVYTFQwMzg4TzNDZXlaQnlCempBT3NpYUtwTDhXUDhORVNjLVdXNzlzMWJBNzFBMUxVdlNuUlVMVXNqU2VWUWV4OUhxWjVGeVdEajdkSUhmUWdENUNnIIEC'
bili_jct = '0a08b52acfc019b2e6834d1746761721'
dedeuserid = '1156037281'
cookie = f'SESSDATA={sessdata}; bili_jct={bili_jct}; DedeUserID={dedeuserid}'

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com',
    'Cookie': cookie
}

bvid = 'BV1T6PQzQErF'
cid = '25977232714'

print(f'获取字幕信息: bvid={bvid}, cid={cid}')
req = r.Request(
    f'https://api.bilibili.com/x/player/v2?bvid={bvid}&cid={cid}',
    headers=headers
)
resp = json.loads(r.urlopen(req, timeout=15).read())
subs = resp['data']['subtitle']['subtitles']
print(f'找到 {len(subs)} 个字幕:')
for s in subs:
    print(f"  lan={s['lan']}, subtitle_url={s.get('subtitle_url', 'EMPTY')}")

if not subs:
    print('无字幕')
    sys.exit(1)

# 取第一个（ai-zh）
sub = subs[0]
sub_url = sub.get('subtitle_url', '')
if not sub_url:
    print('subtitle_url 为空，尝试从 id_str 构造...')
    # B站新版字幕URL格式
    id_str = sub.get('id_str', sub.get('id', ''))
    print(f'id_str: {id_str}')
    sys.exit(1)

full_url = sub_url if sub_url.startswith('http') else f'https:{sub_url}'
print(f'下载字幕: {full_url}')

req2 = r.Request(full_url, headers=headers)
subtitle_data = json.loads(r.urlopen(req2, timeout=15).read())
body = subtitle_data.get('body', [])
print(f'字幕条目数: {len(body)}')

# 保存纯文本
text_lines = [item['content'] for item in body]
full_text = '\n'.join(text_lines)
with open('subtitle_BV1T6PQzQErF.txt', 'w', encoding='utf-8') as f:
    f.write(full_text)
print(f'字幕已保存到 subtitle_BV1T6PQzQErF.txt，共 {len(full_text)} 字')
print('--- 前500字预览 ---')
print(full_text[:500])
