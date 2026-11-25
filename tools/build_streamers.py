"""出場者の一覧（公式サイト）と、調べたチャンネル（channels.json）から streamers.js を作る。"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
TEAMS = {
  "TEAM k4sen": ["k4sen", "布団ちゃん", "ふらんしすこ", "あゆたろう", "柊ツルギ", "ゆふな", "天月", "よしなま", "RaMu", "Foy", "ゆゆうた"],
  "TEAM SHAKA": ["SHAKA", "rion", "SPYGEA", "赤見かるび", "ボドカ", "鈴木ノリアキ", "恭一郎", "伊織もえ", "らっしゃー", "ごっちゃん@マイキー", "わいわい"],
  "TEAM もこう": ["もこう", "Laz", "しんじ", "バトラ", "えなこ", "Biju", "らいじん", "yunocy", "幕末志士・坂本", "スタンミじゃぱん", "けんき"],
  "TEAM 関優太": ["関優太", "たいじ", "すもも", "Zerost", "みゃこ", "渋谷ハル", "あっさりしょこ", "misaco", "おにや", "こく兄", "Euriece"],
  "HYG REVENGERS": ["ありけん", "キズナアイ", "Killin9Hit", "こーすけ", "ta1yo", "蛇足", "まざー３", "Masuo", "YamatoN", "ラクシャーナ"],
  "MC・実況": ["加藤純一", "OooDa", "岸大河", "平岩康佑", "石田晴香"],
}
LEADERS = {"k4sen", "SHAKA", "もこう", "関優太"}
OFFICIAL = [
  {"id": "official-day1", "name": "本編 DAY1（11/28 14:30〜）", "team": "公式配信", "youtubeVideo": "CCswyXGo4B0"},
  {"id": "official-ura", "name": "裏ハイパーゲーム大会（DAY1のあと）", "team": "公式配信", "youtubeVideo": "3kKJHfaH_Q4"},
  {"id": "official-day2", "name": "本編 DAY2（11/29 13:00〜）", "team": "公式配信", "youtubeVideo": "lqmKwbjkF1M"},
  {"id": "official-channel", "name": "mellow-fan 公式チャンネル（いま配信中のもの）", "team": "公式配信", "youtubeId": "UCtV6XPQFY9LW8qI5kPr80Zg"},
  {"id": "kato", "name": "加藤純一（本編の同時配信）", "team": "公式配信", "twitch": "kato_junichi0817"},
]
known = {}
path = os.path.join(HERE, "channels.json")
if os.path.exists(path):
    for c in json.load(open(path)):
        known[c["name"]] = c
# 確定している分（公式サイト・FollowBoard で確認済み）
for n, tw in {"しんじ": "shinjifromjapanxd", "らいじん": "alfrea", "すもも": "sumomo_x", "加藤純一": "kato_junichi0817"}.items():
    known.setdefault(n, {}).setdefault("twitch", tw)
out = list(OFFICIAL)
i = 0
for team, names in TEAMS.items():
    for n in names:
        i += 1
        c = known.get(n, {})
        s = {"id": f"p{i:02d}", "name": n, "team": team}
        if n in LEADERS: s["role"] = "リーダー"
        if c.get("twitch"): s["twitch"] = c["twitch"]
        if c.get("youtubeId"): s["youtubeId"] = c["youtubeId"]
        if c.get("main") in ("twitch", "youtube"): s["main"] = c["main"]
        out.append(s)
with open(os.path.join(HERE, "..", "streamers.js"), "w") as f:
    f.write("/* 出場者と配信チャンネル。公式サイト（lp.openrec.jp/hyper-game-event-final）の出場者一覧をもとに作成 */\n")
    f.write("window.STREAMERS = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
print(len(out), "件", sum(1 for s in out if s.get("twitch") or s.get("youtubeId") or s.get("youtubeVideo")), "件にチャンネルあり")
