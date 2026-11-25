/* ハイゲFINAL マルチビュー
 * 窓（tile）は「プラットフォーム:ID」のキーで表す。
 *   tw:<Twitchログイン名>  yt:<YouTube動画ID>  ytc:<YouTubeチャンネルID（UC…）>
 * 窓は絶対配置で並べ、並べ替えでは位置と大きさだけを変える（iframe を動かすと再読み込みになるため）。
 */
(() => {
  'use strict';

  const STREAMERS = window.STREAMERS || [];
  const HOST = location.hostname;
  const STORE_KEY = 'hyge-mv-v1';
  const MAX_TILES = 16;
  const GAP = 6;
  const TEAM_COLOR = {
    '公式配信': 'var(--team-official)', 'MC・実況': 'var(--team-mc)', 'TEAM k4sen': 'var(--team-k4sen)',
    'TEAM SHAKA': 'var(--team-shaka)', 'TEAM もこう': 'var(--team-mokou)', 'TEAM 関優太': 'var(--team-seki)',
    'HYG REVENGERS': 'var(--team-revengers)',
  };
  const TEAM_ORDER = ['公式配信', 'MC・実況', 'TEAM k4sen', 'TEAM SHAKA', 'TEAM もこう', 'TEAM 関優太', 'HYG REVENGERS'];

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'style') Object.assign(n.style, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };

  /* ---------- 配信者とキー ---------- */
  function keysOf(s) {
    const keys = [];
    if (s.twitch) keys.push(`tw:${s.twitch}`);
    if (s.youtubeVideo) keys.push(`yt:${s.youtubeVideo}`);
    if (s.youtubeId) keys.push(`ytc:${s.youtubeId}`);
    return keys;
  }
  function defaultKey(s) {
    const keys = keysOf(s);
    if (!keys.length) return null;
    if (s.main === 'youtube') return keys.find((k) => !k.startsWith('tw:')) || keys[0];
    return keys[0];
  }
  const byKey = new Map();
  for (const s of STREAMERS) for (const k of keysOf(s)) byKey.set(k, s);
  function who(key) { return byKey.get(key) || null; }
  function labelOf(key) {
    const s = who(key);
    if (s) return s.name;
    const [p, id] = splitKey(key);
    return p === 'tw' ? id : p === 'yt' ? `YouTube ${id}` : 'YouTube チャンネル';
  }
  function splitKey(key) { const i = key.indexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; }
  const platformName = (key) => (key.startsWith('tw:') ? 'Twitch' : 'YouTube');

  function parseInput(text) {
    const t = text.trim();
    if (!t) return {error: 'URL か Twitch の名前を入れてください'};
    let m;
    if ((m = t.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})/i))) return {key: `tw:${m[1].toLowerCase()}`};
    if ((m = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/))) return {key: `yt:${m[1]}`};
    if ((m = t.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/)) || (m = t.match(/^(UC[A-Za-z0-9_-]{22})$/))) return {key: `ytc:${m[1]}`};
    if (/youtube\.com\/@|^@/.test(t)) return {error: 'YouTube は @名前 のURLでは開けません。配信のURL（watch?v=… か /live/…）を入れてください'};
    if ((m = t.match(/^[A-Za-z0-9_]{3,25}$/))) return {key: `tw:${t.toLowerCase()}`};
    const hit = STREAMERS.find((s) => s.name === t);
    if (hit && defaultKey(hit)) return {key: defaultKey(hit)};
    return {error: '読み取れませんでした。Twitch か YouTube の配信URLを入れてください'};
  }

  /* ---------- 状態 ---------- */
  const state = {tiles: [], layout: 'grid', focus: null, audio: null, chat: false};
  const live = new Map(); // key -> {node, player, kind, ready}

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても動かす */ }
    const q = new URLSearchParams();
    if (state.tiles.length) q.set('s', state.tiles.join(','));
    if (state.layout !== 'grid') q.set('l', state.layout);
    if (state.focus) q.set('f', state.focus);
    history.replaceState(null, '', `${location.pathname}${q.toString() ? `#${q}` : ''}`);
  }
  function load() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.has('s')) {
      state.tiles = hash.get('s').split(',').filter((k) => /^(tw|yt|ytc):[A-Za-z0-9_-]+$/.test(k)).slice(0, MAX_TILES);
      state.layout = hash.get('l') === 'focus' ? 'focus' : 'grid';
      state.focus = hash.get('f');
      return;
    }
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && Array.isArray(s.tiles)) Object.assign(state, s, {audio: null});
    } catch (e) { /* 読めなければ空から */ }
  }

  /* ---------- プレイヤー ---------- */
  let twitchReady = !!window.Twitch;
  let ytReady = !!(window.YT && window.YT.Player);
  const pending = [];
  const prevYT = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { ytReady = true; if (prevYT) prevYT(); flushPending(); };
  const twTimer = setInterval(() => { if (window.Twitch && window.Twitch.Player) { twitchReady = true; clearInterval(twTimer); flushPending(); } }, 200);
  function flushPending() { for (const key of pending.splice(0)) if (state.tiles.includes(key)) mountPlayer(key); }

  function mountPlayer(key) {
    const t = live.get(key);
    if (!t || t.player) return;
    const [p, id] = splitKey(key);
    const holder = t.node.querySelector('.tile-player');
    if (p === 'tw') {
      if (!twitchReady) { pending.push(key); return; }
      const div = el('div', {id: `tw-${id}-${Math.random().toString(36).slice(2, 7)}`, style: {position: 'absolute', inset: '0'}});
      holder.replaceChildren(div);
      t.player = new window.Twitch.Player(div.id, {channel: id, parent: [HOST], width: '100%', height: '100%', muted: true, autoplay: true});
      t.kind = 'tw';
      t.player.addEventListener(window.Twitch.Player.READY, () => { t.ready = true; applyAudio(); });
      // Twitch は窓が小さくなったときや再生し直したときに自分でミュートすることがあるので、再生が始まるたびに音声の選択をかけ直す
      for (const ev of ['PLAY', 'PLAYING', 'ONLINE']) {
        if (window.Twitch.Player[ev]) t.player.addEventListener(window.Twitch.Player[ev], () => { if (key === state.audio) setMuted(t, false); });
      }
    } else {
      if (!ytReady) { pending.push(key); return; }
      const base = p === 'yt' ? `https://www.youtube.com/embed/${id}` : 'https://www.youtube.com/embed/live_stream';
      const q = new URLSearchParams({autoplay: '1', mute: '1', playsinline: '1', enablejsapi: '1', origin: location.origin, rel: '0'});
      if (p === 'ytc') q.set('channel', id);
      const frame = el('iframe', {src: `${base}?${q}`, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', title: labelOf(key)});
      holder.replaceChildren(frame);
      t.kind = 'yt';
      t.player = new window.YT.Player(frame, {events: {
        onReady: (e) => { t.ready = true; try { e.target.playVideo(); } catch (err) { /* 自動再生できない端末もある */ } applyAudio(); },
        onStateChange: (e) => { if (e.data === 1 && key === state.audio) setMuted(t, false); },
      }});
    }
  }
  function setMuted(t, muted) {
    if (!t.player || !t.ready) return;
    try {
      if (t.kind === 'tw') { t.player.setMuted(muted); if (!muted) t.player.setVolume(1); }
      else if (muted) t.player.mute(); else { t.player.unMute(); t.player.setVolume(100); }
    } catch (e) { /* 読み込み途中は無視 */ }
  }
  // 並びが変わった直後は、プレイヤーが大きさの変化に合わせて音を切ることがあるので、少し待ってからもかけ直す
  let reapplyTimers = [];
  function reapplyAudioSoon() {
    reapplyTimers.forEach(clearTimeout);
    reapplyTimers = [400, 1500, 4000].map((ms) => setTimeout(() => {
      const t = live.get(state.audio);
      if (t) setMuted(t, false);
    }, ms));
  }
  function applyAudio() {
    for (const [key, t] of live) {
      setMuted(t, key !== state.audio);
      t.node.classList.toggle('audio', key === state.audio);
      const b = t.node.querySelector('[data-act="audio"]');
      if (b) { b.classList.toggle('on', key === state.audio); b.textContent = key === state.audio ? '音声オン' : '音声'; b.setAttribute('aria-pressed', String(key === state.audio)); }
    }
  }

  /* ---------- 窓 ---------- */
  function makeTile(key) {
    const s = who(key);
    const team = s ? s.team : null;
    const color = TEAM_COLOR[team] || 'var(--muted)';
    const others = s ? keysOf(s).filter((k) => k !== key) : [];
    const node = el('div', {class: 'tile', style: {'--team': color}, 'data-key': key},
      el('div', {class: 'tile-player'}),
      el('div', {class: 'tile-bar'},
        el('span', {class: 'tile-name'}, el('span', {class: 'tile-team'}), el('span', {}, labelOf(key))),
        el('div', {class: 'tile-actions'},
          el('button', {type: 'button', class: 'tile-btn', 'data-act': 'audio', 'aria-pressed': 'false', title: 'この窓の音を出す（ほかはミュート）', onclick: () => { state.audio = state.audio === key ? null : key; applyAudio(); renderChat(); }}, '音声'),
          others.length ? el('button', {type: 'button', class: 'tile-btn', title: `${platformName(others[0])} に切り替える`, onclick: () => swapTile(key, others[0])}, others[0].startsWith('tw:') ? 'Twitch' : 'YouTube') : null,
          el('button', {type: 'button', class: 'tile-btn main-btn', 'data-act': 'main', title: 'この窓をメインにして大きく見る', onclick: () => makeMain(key)}, 'メインにする'),
          el('button', {type: 'button', class: 'tile-btn', title: 'この窓を閉じる', 'aria-label': `${labelOf(key)} を閉じる`, onclick: () => removeTile(key)}, '✕'),
        ),
      ),
      el('span', {class: 'tile-label'}, labelOf(key)),
      el('button', {type: 'button', class: 'tile-promote', title: 'この窓をメインにする', onclick: () => makeMain(key)}, 'メインにする'),
    );
    return node;
  }
  function addTile(key, {quiet} = {}) {
    if (state.tiles.includes(key)) return;
    if (state.tiles.length >= MAX_TILES) { toast(`同時に開けるのは ${MAX_TILES} 窓までです`); return; }
    state.tiles.push(key);
    if (!quiet) afterChange();
  }
  function removeTile(key) {
    state.tiles = state.tiles.filter((k) => k !== key);
    if (state.audio === key) state.audio = null;
    if (state.focus === key) state.focus = null;
    afterChange();
  }
  function swapTile(oldKey, newKey) {
    const i = state.tiles.indexOf(oldKey);
    if (i < 0 || state.tiles.includes(newKey)) return;
    state.tiles[i] = newKey;
    if (state.audio === oldKey) state.audio = newKey;
    if (state.focus === oldKey) state.focus = newKey;
    afterChange();
  }
  function afterChange() {
    sync();
    save();
    renderList();
    if (state.tiles.length > 9) toast('窓が多いと重くなり、Twitch は小さすぎる窓を再生しないことがあります');
  }
  function sync() {
    const grid = $('#grid');
    for (const [key, t] of live) {
      if (!state.tiles.includes(key)) { try { if (t.player && t.player.destroy) t.player.destroy(); } catch (e) { /* 片付けの失敗は無視 */ } t.node.remove(); live.delete(key); }
    }
    for (const key of state.tiles) {
      if (!live.has(key)) {
        const node = makeTile(key);
        grid.append(node);
        live.set(key, {node, player: null, kind: null, ready: false});
        mountPlayer(key);
      }
    }
    $('#empty').hidden = state.tiles.length > 0;
    $('#count').textContent = String(state.tiles.length);
    layout();
    applyAudio();
    renderChat();
  }

  /* ---------- 並べ方 ---------- */
  function bestGrid(n, W, H) {
    let best = {cols: 1, rows: n, w: 0, h: 0};
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (W - GAP * (cols - 1)) / cols, ch = (H - GAP * (rows - 1)) / rows;
      const w = Math.min(cw, (ch * 16) / 9);
      if (w > best.w) best = {cols, rows, w, h: (w * 9) / 16};
    }
    return best;
  }
  function placeGrid(keys, x0, y0, W, H) {
    const out = new Map();
    if (!keys.length) return out;
    const g = bestGrid(keys.length, W, H);
    const totalH = g.rows * g.h + GAP * (g.rows - 1);
    keys.forEach((key, i) => {
      const r = Math.floor(i / g.cols), c = i % g.cols;
      const inRow = r === g.rows - 1 ? keys.length - r * g.cols : g.cols;
      const rowW = inRow * g.w + GAP * (inRow - 1);
      out.set(key, {x: x0 + (W - rowW) / 2 + c * (g.w + GAP), y: y0 + (H - totalH) / 2 + r * (g.h + GAP), w: g.w, h: g.h});
    });
    return out;
  }
  function layout() {
    const box = $('#grid').getBoundingClientRect();
    const W = box.width, H = box.height;
    const keys = state.tiles;
    let pos;
    if (state.layout === 'focus' && keys.length > 1) {
      const main = keys.includes(state.focus) ? state.focus : keys[0];
      const rest = keys.filter((k) => k !== main);
      const wide = W / H > 1.25;
      pos = new Map();
      if (wide) {
        let mw = Math.min(W * 0.74, (H * 16) / 9);
        const sideW = W - mw - GAP;
        pos.set(main, {x: 0, y: (H - (mw * 9) / 16) / 2, w: mw, h: (mw * 9) / 16});
        for (const [k, p] of placeGrid(rest, mw + GAP, 0, sideW, H)) pos.set(k, p);
      } else {
        const mh = Math.min(H * 0.6, (W * 9) / 16);
        const mw = (mh * 16) / 9;
        pos.set(main, {x: (W - mw) / 2, y: 0, w: mw, h: mh});
        for (const [k, p] of placeGrid(rest, 0, mh + GAP, W, H - mh - GAP)) pos.set(k, p);
      }
    } else {
      pos = placeGrid(keys, 0, 0, W, H);
    }
    const mainKey = state.layout === 'focus' && keys.length > 1 ? (keys.includes(state.focus) ? state.focus : keys[0]) : null;
    for (const [key, t] of live) {
      const p = pos.get(key);
      if (!p) continue;
      Object.assign(t.node.style, {left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px`});
      t.node.classList.toggle('is-main', key === mainKey);
      t.node.classList.toggle('is-sub', !!mainKey && key !== mainKey);
      const b = t.node.querySelector('[data-act="main"]');
      if (b) b.hidden = key === mainKey;
    }
    reapplyAudioSoon();
    renderMainMarks(mainKey);
  }
  function makeMain(key) {
    state.layout = 'focus';
    state.focus = key;
    save(); syncLayoutButtons(); layout();
  }
  function syncLayoutButtons() {
    document.querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === state.layout)));
    $('#grid').dataset.layout = state.layout;
  }

  /* ---------- チャット ---------- */
  let chatKey = null;
  function renderChat() {
    const panel = $('#chat');
    panel.hidden = !state.chat;
    $('#toggle-chat').setAttribute('aria-pressed', String(state.chat));
    if (!state.chat) { chatKey = null; $('#chat-body').replaceChildren(); layout(); return; }
    const key = state.audio || state.tiles[0] || null;
    if (key === chatKey) { layout(); return; }
    chatKey = key;
    const body = $('#chat-body');
    if (!key) { body.replaceChildren(el('p', {class: 'chat-empty'}, '窓を開くと、音声オンの窓のチャットがここに出ます。')); $('#chat-title').textContent = 'チャット'; layout(); return; }
    const [p, id] = splitKey(key);
    $('#chat-title').textContent = `${labelOf(key)} のチャット`;
    if (p === 'tw') body.replaceChildren(el('iframe', {src: `https://www.twitch.tv/embed/${id}/chat?parent=${HOST}&darkpopout`, title: `${labelOf(key)} のチャット`}));
    else if (p === 'yt') body.replaceChildren(el('iframe', {src: `https://www.youtube.com/live_chat?v=${id}&embed_domain=${HOST}`, title: `${labelOf(key)} のチャット`}));
    else if (liveVideos[key]) body.replaceChildren(el('iframe', {src: `https://www.youtube.com/live_chat?v=${liveVideos[key]}&embed_domain=${HOST}`, title: `${labelOf(key)} のチャット`}));
    else body.replaceChildren(el('p', {class: 'chat-empty'}, 'この YouTube の窓は、配信中と確認できたときにチャットを出せます。'));
    layout();
  }

  /* ---------- 配信状況（GitHub Actions が5分ごとに書く live.json） ---------- */
  const LIVE_URL = 'https://raw.githubusercontent.com/momonga1192/hyge-multiview/status/live.json';
  let liveSet = new Set();
  let liveVideos = {};
  let liveAt = null;
  const isLive = (s) => keysOf(s).some((k) => liveSet.has(k));
  async function refreshLive() {
    try {
      const r = await fetch(`${LIVE_URL}?t=${Math.floor(Date.now() / 60000)}`, {cache: 'no-store'});
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      liveSet = new Set(j.live || []);
      liveVideos = j.videos || {};
      liveAt = j.updatedAt ? new Date(j.updatedAt) : null;
    } catch (e) {
      liveAt = liveAt || null;
    }
    renderLiveStatus();
    renderList();
  }
  function renderLiveStatus() {
    const p = $('#live-status');
    if (!p) return;
    if (!liveAt) { p.textContent = '配信状況を読み込めていません'; return; }
    const hm = liveAt.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
    const n = STREAMERS.filter(isLive).length;
    const old = Date.now() - liveAt.getTime() > 20 * 60000;
    p.textContent = `配信中 ${n}人（${hm} 時点${old ? '・更新が遅れています' : ''}）`;
  }

  /* ---------- 一覧 ---------- */
  function renderMainMarks(mainKey) {
    document.querySelectorAll('.member-row').forEach((row) => {
      const keys = row.dataset.keys ? row.dataset.keys.split(' ') : [];
      const open = keys.find((k) => state.tiles.includes(k));
      const btn = row.querySelector('.row-main');
      const tag = row.querySelector('.row-main-tag');
      if (btn) btn.hidden = !open || state.tiles.length < 2 || open === mainKey;
      if (tag) tag.hidden = !open || open !== mainKey;
    });
  }
  function renderList() {
    const q = $('#search').value.trim().toLowerCase();
    const onlyLive = $('#only-live').getAttribute('aria-pressed') === 'true';
    const groups = new Map(TEAM_ORDER.map((t) => [t, []]));
    for (const s of STREAMERS) {
      if (q && !s.name.toLowerCase().includes(q) && !(s.kana || '').includes(q)) continue;
      if (onlyLive && !isLive(s)) continue;
      if (!groups.has(s.team)) groups.set(s.team, []);
      groups.get(s.team).push(s);
    }
    const list = $('#list');
    const frag = document.createDocumentFragment();
    for (const [team, members] of groups) {
      if (!members.length) continue;
      const color = TEAM_COLOR[team] || 'var(--muted)';
      const openable = members.map(defaultKey).filter(Boolean);
      const head = el('div', {class: 'team-head'}, el('span', {class: 'team-dot'}), team,
        openable.length > 1 && team !== '公式配信' ? el('button', {type: 'button', class: 'team-add', title: `${team} の配信をまとめて開く`, onclick: () => { for (const k of openable) addTile(k, {quiet: true}); afterChange(); }}, 'まとめて開く') : null);
      const items = members.map((s) => {
        const keys = keysOf(s);
        const on = keys.some((k) => state.tiles.includes(k));
        const badges = [];
        if (s.twitch) badges.push(el('span', {class: 'badge badge-tw'}, 'Tw'));
        if (s.youtubeId || s.youtubeVideo) badges.push(el('span', {class: 'badge badge-yt'}, 'YT'));
        if (!keys.length) badges.push(el('span', {class: 'badge badge-none'}, '未確認'));
        const liveNow = isLive(s);
        const openKey = keys.find((k) => state.tiles.includes(k));
        const member = el('button', {type: 'button', class: 'member', 'aria-pressed': String(on), disabled: !keys.length,
          title: keys.length ? `${s.name} の配信を${on ? '閉じる' : '開く'}` : 'チャンネルを確認できていません',
          onclick: () => {
            const openKeys = keys.filter((k) => state.tiles.includes(k));
            if (openKeys.length) {
              for (const k of openKeys) state.tiles = state.tiles.filter((x) => x !== k);
              if (openKeys.includes(state.audio)) state.audio = null;
              if (openKeys.includes(state.focus)) state.focus = null;
              afterChange();
            } else {
              // 配信中の側があればそちらを開く
              addTile(keys.find((k) => liveSet.has(k)) || defaultKey(s));
            }
          }},
        el('span', {class: 'check', 'aria-hidden': 'true'}),
        el('span', {class: 'member-name'},
          liveNow ? el('span', {class: 'live-dot', title: '配信中', 'aria-label': '配信中'}) : null,
          s.name, s.role ? el('span', {class: 'member-role'}, ` ${s.role}`) : null),
        ...badges);
        return el('div', {class: `member-row${liveNow ? ' is-live' : ''}`, 'data-keys': keys.join(' ')},
          member,
          el('span', {class: 'row-main-tag', hidden: true}, 'メイン'),
          el('button', {type: 'button', class: 'row-main', hidden: true, title: `${s.name} をメインにする`, onclick: () => { const k = keys.find((x) => state.tiles.includes(x)); if (k) makeMain(k); }}, 'メインに'));
      });
      frag.append(el('section', {class: 'team', style: {'--team': color}}, head, ...items));
    }
    if (!frag.childNodes.length) frag.append(el('p', {class: 'list-empty'}, onlyLive ? 'いま配信中の人はいません（5分ごとに確かめています）' : '見つかりませんでした'));
    list.replaceChildren(frag);
    const keys = state.tiles;
    renderMainMarks(state.layout === 'focus' && keys.length > 1 ? (keys.includes(state.focus) ? state.focus : keys[0]) : null);
  }

  /* ---------- その他の操作 ---------- */
  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  $('#toggle-side').addEventListener('click', () => {
    const side = $('#side');
    side.hidden = !side.hidden;
    $('#toggle-side').setAttribute('aria-expanded', String(!side.hidden));
    layout();
  });
  document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => { state.layout = b.dataset.layout; save(); syncLayoutButtons(); layout(); }));
  $('#toggle-chat').addEventListener('click', () => { state.chat = !state.chat; save(); renderChat(); });
  $('#mute-all').addEventListener('click', () => { state.audio = null; applyAudio(); renderChat(); });
  $('#clear-all').addEventListener('click', () => { state.tiles = []; state.audio = null; state.focus = null; afterChange(); });
  $('#copy-link').addEventListener('click', async () => {
    save();
    try { await navigator.clipboard.writeText(location.href); toast('この並びのリンクをコピーしました'); }
    catch (e) { toast('コピーできませんでした。アドレスバーのURLをそのまま使えます'); }
  });
  $('#quick-official').addEventListener('click', () => {
    const day2 = new Date() >= new Date('2026-11-29T00:00:00+09:00');
    const main = STREAMERS.find((s) => s.id === (day2 ? 'official-day2' : 'official-day1'));
    const kato = STREAMERS.find((s) => s.id === 'kato');
    for (const s of [main, kato]) if (s && defaultKey(s)) addTile(defaultKey(s), {quiet: true});
    state.layout = 'focus'; state.focus = main ? defaultKey(main) : null;
    syncLayoutButtons(); afterChange();
  });
  $('#search').addEventListener('input', renderList);
  $('#only-live').addEventListener('click', () => {
    const b = $('#only-live');
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    renderList();
  });
  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = parseInput($('#add-input').value);
    const msg = $('#add-msg');
    msg.classList.toggle('err', !!r.error);
    if (r.error) { msg.textContent = r.error; return; }
    if (state.tiles.includes(r.key)) { msg.textContent = 'すでに開いています'; return; }
    addTile(r.key);
    msg.textContent = `${labelOf(r.key)}（${platformName(r.key)}）を開きました`;
    $('#add-input').value = '';
  });
  new ResizeObserver(() => layout()).observe($('#grid'));
  window.addEventListener('hashchange', () => { load(); syncLayoutButtons(); sync(); renderList(); });

  if (window.matchMedia('(max-width: 760px)').matches) { $('#side').hidden = true; $('#toggle-side').setAttribute('aria-expanded', 'false'); }
  load();
  syncLayoutButtons();
  renderList();
  sync();
  refreshLive();
  setInterval(refreshLive, 60000);
  // チャットの窓（YouTube の動画ID）は配信状況が来てから決まることがある
  setInterval(() => { if (state.chat && chatKey && chatKey.startsWith('ytc:') && liveVideos[chatKey]) { chatKey = null; renderChat(); } }, 60000);
})();
