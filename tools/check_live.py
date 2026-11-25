"""出場者の配信状況を調べて live.json を標準出力に書く（GitHub Actions で5分ごとに動かす）。

- Twitch：チャンネルページの HTML に "isLiveBroadcast":true があれば配信中
- YouTube：/channel/<ID>/live（動画は watch?v=<ID>）の HTML に "isLive":true があり、
  "isUpcoming":true がなければ配信中。そのときの動画IDも書く（チャットを出すため）
APIキーは使わない。ページの形が変わると判定できなくなる。
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def load_streamers():
    text = open(os.path.join(HERE, "..", "streamers.js"), encoding="utf-8").read()
    return json.loads(text[text.index("["): text.rindex("]") + 1])


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja", "Cookie": "CONSENT=YES+1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def check(key):
    kind, ref = key.split(":", 1)
    try:
        if kind == "tw":
            html = fetch(f"https://www.twitch.tv/{ref}")
            return key, ('"isLiveBroadcast":true' in html), None
        url = f"https://www.youtube.com/channel/{ref}/live" if kind == "ytc" else f"https://www.youtube.com/watch?v={ref}"
        html = fetch(url)
        live = '"isLive":true' in html and '"isUpcoming":true' not in html
        m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})"', html)
        return key, live, (m.group(1) if (live and m) else None)
    except Exception as e:  # 1件の失敗で全体を止めない
        return key, None, str(e)[:120]


def main():
    keys = []
    for s in load_streamers():
        if s.get("twitch"):
            keys.append(f"tw:{s['twitch']}")
        if s.get("youtubeId"):
            keys.append(f"ytc:{s['youtubeId']}")
        if s.get("youtubeVideo"):
            keys.append(f"yt:{s['youtubeVideo']}")
    keys = list(dict.fromkeys(keys))
    live, videos, failed = [], {}, {}
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for key, is_live, extra in ex.map(check, keys):
            if is_live is None:
                failed[key] = extra
            elif is_live:
                live.append(key)
                if extra:
                    videos[key] = extra
    out = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "checked": len(keys),
        "live": sorted(live),
        "videos": videos,
        "failed": failed,
    }
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
