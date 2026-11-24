/* OverDrive event template: shared client core — sync, derived tournament model, small components.
   Everything on screen is computed from the server's state; nothing here invents data. */
"use strict";
(() => {
const OD = window.OD = {};
const HASH = (location.hash + location.search).replace(/^[#?]/, "");
OD.param = name => { const m = new RegExp("(?:^|[&#?])" + name + "(?:=([^&#]*))?(?=&|#|$)", "i").exec(HASH); return m ? (m[1] === undefined ? true : decodeURIComponent(m[1])) : null; };
OD.KEY = OD.param("key") || (() => { try { return localStorage.getItem("od_major_key") || ""; } catch (e) { return ""; } })();
if (OD.param("key")) try { localStorage.setItem("od_major_key", OD.param("key")); } catch (e) {}

/* ---------------- sync: SSE first, polling fallback, last state cached for reloads ---------------- */
OD.S = null; OD.online = false;
const listeners = [];
OD.onState = fn => { listeners.push(fn); if (OD.S) fn(OD.S); };
function apply(s, shared) {
  OD.S = s; OD.M = derive(s); OD.online = true; OD.lastMsg = Date.now();
  OD.clockSkew = s.serverNow ? s.serverNow - Date.now() : 0;
  if (!shared) try { sessionStorage.setItem("od_major_last", JSON.stringify(s)); } catch (e) {}
  for (const f of listeners) try { f(s); } catch (e) { console.error(e); }
}
OD.connect = () => {
  // Monitors embedded in the producer share its single live connection: browsers allow only ~6 connections per
  // host, so nine monitors each holding their own stream would block the producer's button presses.
  let host = null; try { if (window.parent !== window && window.parent.PRODUCER && window.parent.OD) host = window.parent.OD; } catch (e) {}
  if (host) { host.onState(s => { try { apply(JSON.parse(JSON.stringify(s)), true); } catch (e) {} }); setInterval(() => { OD.online = host.online; }, 2000); return; }
  try { const c = JSON.parse(sessionStorage.getItem("od_major_last")); if (c && !OD.S) apply(c); OD.online = false; } catch (e) {}
  let es, fails = 0, pollT = null;
  const poll = async () => {
    try { const r = await fetch("/api/state", { cache: "no-store" }); if (r.ok) { const s = await r.json(); if (!OD.S || s.rev !== OD.S.rev) apply(s); else OD.lastMsg = Date.now(); } } catch (e) { OD.online = false; }
    pollT = setTimeout(poll, 2000);
  };
  const open = () => {
    if (!window.EventSource) return poll();
    es = new EventSource("/api/events");
    es.onmessage = e => { fails = 0; if (pollT) { clearTimeout(pollT); pollT = null; } try { apply(JSON.parse(e.data)); } catch (x) {} };
    es.onerror = () => { OD.online = false; if (++fails === 3 && !pollT) poll(); };
  };
  open();
  setInterval(() => { if (Date.now() - (OD.lastMsg || 0) > 40000) OD.online = false; }, 5000);
};
OD.act = async (type, payload) => {
  try {
    const r = await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json", "X-Sync-Key": OD.KEY }, body: JSON.stringify(Object.assign({ type }, payload || {})) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { OD.toast(j.error || "Change refused (" + r.status + ")", true); return null; }
    return j;
  } catch (e) { OD.toast("Server unreachable: the change was not saved", true); return null; }
};
OD.getPrivate = async () => {
  try { const r = await fetch("/api/private", { headers: { "X-Sync-Key": OD.KEY }, cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; }
};
OD.now = () => Date.now() + (OD.clockSkew || 0);
OD.toast = (msg, bad) => {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), bad ? 4000 : 1800);
};

/* ---------------- static metadata (owned by this project) ---------------- */
const norm = OD.norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// short tags as used on eCircuitMania. Logos are files in public/logos/ named after the team (big.png, cook.png…):
// drop the Major versions in with the same names and every graphic picks them up. COOK has no logo published yet.
const TEAM_META = {};   // per-event short tags, e.g. { teamname: { short: "TAG" } }; otherwise the first 5 letters are used
// sheet handle → verified-data key / portrait file, where they differ
const PLAYER_ALIASES = {};
// default portrait framing (focal point in % of the photo, zoom), set by eye for the bundled event photos; adjustable per player
const PHOTO_FRAME = {};   // per-player default framing: { handle: [focusX%, focusY%, zoom] }; adjustable in the producer
let EVENT_DAY = new Date().toISOString().slice(0, 10);   // replaced by event.day from data/verified.json
// other spellings seen on the Wildcard sheet, Liquipedia and eCircuitMania → Major sheet name
const ALIASES = {};   // other spellings of team names → sheet name (normalised), e.g. { navi: "navixjoel" }
const NAT = { germany: "GER", france: "FRA", netherlands: "NED", unitedkingdom: "GBR", uk: "GBR", canada: "CAN", belgium: "BEL", poland: "POL",
  czechrepublic: "CZE", czechia: "CZE", spain: "ESP", italy: "ITA", unitedstates: "USA", usa: "USA", switzerland: "SUI", austria: "AUT", denmark: "DEN",
  sweden: "SWE", norway: "NOR", finland: "FIN", portugal: "POR", brazil: "BRA", japan: "JPN", china: "CHN", korea: "KOR", southkorea: "KOR", australia: "AUS",
  latvia: "LAT", lithuania: "LTU", estonia: "EST", slovakia: "SVK", hungary: "HUN", ukraine: "UKR", russia: "RUS", ireland: "IRL" };
OD.natCode = n => { const k = norm(n); return NAT[k] || (/^[a-z]{3}$/.test(k) ? k.toUpperCase() : ""); };

const ROUND = { R1_UB: "Upper Round 1", R2_UB: "Upper Round 2", R3_UBF: "Upper Final", R2_LB: "Lower Round 1", R3_LB: "Lower Round 2",
  R4_LBF: "Lower Final", R5_CF: "Consolidation Final", R6_GF: "Grand Final" };
const ROUND_SHORT = { R1_UB: "UB R1", R2_UB: "UB R2", R3_UBF: "UB Final", R2_LB: "LB R1", R3_LB: "LB R2", R4_LBF: "LB Final", R5_CF: "Cons. Final", R6_GF: "Grand Final" };
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
OD.ord = ord;
OD.tz = () => " " + ((OD.M && OD.M.event && OD.M.event.tz) || "CET");   // timezone label shown after match times
const rkey = bid => (/^(R\d+_[A-Z]+?)(\d*)$/.exec(bid) || [])[1] || bid;
OD.roundName = (bid, short) => { const k = rkey(bid), n = (/(\d+)$/.exec(bid) || [])[1], base = (short ? ROUND_SHORT : ROUND)[k] || bid;
  return n && !/F$/.test(k) ? base + (short ? " #" + n : " · Match " + n) : base; };

/* ---------------- derived tournament model ---------------- */
function derive(s) {
  const T = s.t || { teams: {}, players: {}, matches: {}, slots: [] };
  const teams = T.teams, players = T.players;
  const teamByNorm = {};
  const files = dir => ((s.assets || {})[dir] || []);
  const fileFor = (dir, key) => files(dir).find(f => norm(f.replace(/\.[a-z0-9]+$/i, "")) === key) || null;
  for (const t of Object.values(teams)) { const k = norm(t.name); teamByNorm[k] = t; const m = TEAM_META[k]; t.short = (m && m.short) || t.name.slice(0, 5).toUpperCase(); t.logo = fileFor("logos", k); }
  const teamByName = n => teamByNorm[ALIASES[norm(n)] || norm(n)] || null;
  const slots = {}; for (const sl of T.slots || []) (slots[sl.bid] = slots[sl.bid] || {})[sl.slot] = sl;
  const byBid = {}; for (const m of Object.values(T.matches)) byBid[m.bid] = m;
  const R = {};
  const res = bid => {
    if (R[bid]) return R[bid];
    const m = byBid[bid]; if (!m) return null;
    const out = R[bid] = { id: m.id, bid, raw: m, at: m.at, bo: m.bo || 5, s1: m.s1 || "", s2: m.s2 || "", t: [null, null], hint: ["", ""], seed: [null, null] };
    for (const k of [1, 2]) {
      const sl = (slots[bid] || {})[k], given = teams[m["t" + k]] ? m["t" + k] : null;
      let id = given;
      if (sl) out.seed[k - 1] = sl.seed;
      if (sl && (sl.cond === "W" || sl.cond === "L") && sl.origin) {
        const src = res(sl.origin);
        if (!id && src && src.winner) id = sl.cond === "W" ? src.winner : src.loser;
        out.hint[k - 1] = (sl.cond === "W" ? "Winner " : "Loser ") + OD.roundName(sl.origin, true);
      } else if (sl && sl.cond === "seed") out.hint[k - 1] = "Seed " + sl.seed;
      out.t[k - 1] = id;
    }
    const need = Math.ceil(out.bo / 2), n1 = parseInt(out.s1, 10), n2 = parseInt(out.s2, 10), up = v => String(v).toUpperCase();
    let w = m.winner === "SIM1" ? out.t[0] : m.winner === "SIM2" ? out.t[1] : (teams[m.winner] ? m.winner : null);
    if (!w && out.t[0] && out.t[1]) {
      if (up(out.s1) === "W" || up(out.s2) === "FF" || (n1 >= need && !(n2 >= n1))) w = out.t[0];
      else if (up(out.s2) === "W" || up(out.s1) === "FF" || (n2 >= need && !(n1 >= n2))) w = out.t[1];
    }
    out.winner = w; out.loser = w ? (w === out.t[0] ? out.t[1] : out.t[0]) : null;
    out.status = w ? "completed" : (m.status === "live" ? "live" : (m.status === "void" ? "void" : "upcoming"));
    out.ready = !!(out.t[0] && out.t[1]);
    out.forfeit = !!w && !(/^\d+$/.test(out.s1) && /^\d+$/.test(out.s2));
    out.round = OD.roundName(bid); out.roundShort = OD.roundName(bid, true);
    out.rk = rkey(bid); out.roundNo = parseInt(bid.slice(1), 10) || 0;
    out.overridden = !!(s.overrides && s.overrides.matches && s.overrides.matches[m.id]);
    return out;
  };
  Object.keys(byBid).forEach(res);
  // where winners and losers go
  for (const r of Object.values(R)) {
    const to = cond => { for (const [bid, ss] of Object.entries(slots)) for (const sl of Object.values(ss)) if (sl.cond === cond && sl.origin === r.bid) return { bid, slot: sl.slot, seed: sl.seed }; return null; };
    r.winTo = to("W"); r.loseTo = to("L");
  }
  // Elimination placements are derived from the bracket itself: a match whose loser has nowhere to go eliminates
  // that team. Counting the teams still alive round by round gives each elimination its placement range.
  {
    const total = Object.values(slots).reduce((n, ss) => n + Object.values(ss).filter(sl => sl.cond === "seed").length, 0) || Object.keys(teams).length;
    const groups = {};
    for (const r of Object.values(R)) if (!r.loseTo) (groups[r.rk] = groups[r.rk] || []).push(r);
    let alive = total;
    for (const rk of Object.keys(groups).sort((a, b) => groups[a][0].roundNo - groups[b][0].roundNo)) {
      const k = groups[rk].length, lo = alive - k + 1, hi = alive;
      for (const r of groups[rk]) { r.elimRank = [lo, hi]; r.elimPlace = lo === hi ? ord(hi) : ord(lo) + "–" + ord(hi); }
      alive -= k;
    }
    for (const r of Object.values(R)) if (r.loseTo) { r.elimPlace = null; r.elimRank = null; }
  }
  const list = Object.values(R).sort((a, b) => (a.at || "9").localeCompare(b.at || "9") || a.roundNo - b.roundNo || a.bid.localeCompare(b.bid));
  const byId = Object.fromEntries(list.map(r => [r.id, r]));
  // wildcard matches mapped onto Major teams
  const wc = ((s.wildcard && s.wildcard.matches) || []).map(m => ({ ...m, a: teamByName(m.t1), b: teamByName(m.t2), w: teamByName(m.winner) }));
  const wcQual = ((s.wildcard && s.wildcard.qualified) || []).map(n => teamByName(n)).filter(Boolean).map(t => t.id);
  const M = { s, T, teams, players, slots, byBid: R, list, byId, wc, wcQual, teamByName };
  M.team = id => teams[id] || null;
  M.player = id => players[id] || null;
  M.teamOfPlayer = pid => Object.values(teams).find(t => t.players.includes(pid) || t.subs.includes(pid)) || null;
  M.teamMatches = id => list.filter(r => r.t.includes(id));
  M.record = id => {
    const out = { sw: 0, sl: 0, mw: 0, ml: 0, played: [] };
    for (const r of M.teamMatches(id)) if (r.winner) {
      const i = r.t.indexOf(id), mine = parseInt(i ? r.s2 : r.s1, 10), theirs = parseInt(i ? r.s1 : r.s2, 10);
      if (r.winner === id) out.sw++; else out.sl++;
      if (!isNaN(mine) && !isNaN(theirs)) { out.mw += mine; out.ml += theirs; }
      out.played.push({ r, opp: r.t[1 - i], won: r.winner === id, sf: i ? r.s2 : r.s1, sa: i ? r.s1 : r.s2 });
    }
    return out;
  };
  M.status = id => {
    const gf = R.R6_GF;
    if (gf && gf.winner === id) return { kind: "champion", label: "Champion" };
    for (const r of M.teamMatches(id)) if (r.loser === id && r.elimPlace) return { kind: "out", label: "Eliminated · " + r.elimPlace, place: r.elimPlace };
    if (M.teamMatches(id).some(r => r.loser === id)) return { kind: "lower", label: "Lower bracket" };
    return { kind: "upper", label: "Upper bracket" };
  };
  M.nextMatch = id => list.find(r => r.t.includes(id) && !r.winner && r.status !== "void") || null;
  M.seeds = id => {
    const t = teams[id]; if (!t) return null;
    const ms = M.teamMatches(id); let cur = null;
    const last = ms.slice().sort((a, b) => b.roundNo - a.roundNo)[0];
    if (last) cur = last.seed[last.t.indexOf(id)];
    return { original: t.seed, current: M.status(id).kind === "out" ? null : cur };
  };
  M.h2h = (a, b) => {
    const major = list.filter(r => r.winner && r.t.includes(a) && r.t.includes(b)).map(r => ({ id: r.id, src: "Major", round: r.round, winner: r.winner, sa: r.t[0] === a ? r.s1 : r.s2, sb: r.t[0] === a ? r.s2 : r.s1, at: r.at }));
    const wild = wc.filter(m => m.a && m.b && [m.a.id, m.b.id].includes(a) && [m.a.id, m.b.id].includes(b))
      .map(m => ({ src: "Wildcards", round: m.round, winner: m.w && m.w.id, sa: m.a.id === a ? m.s1 : m.s2, sb: m.a.id === a ? m.s2 : m.s1, at: m.at }));
    return wild.concat(major);
  };
  M.wildcardPath = id => wc.filter(m => (m.a && m.a.id === id) || (m.b && m.b.id === id)).map(m => {
    const mine = m.a && m.a.id === id; return { round: m.round, opp: mine ? m.t2 : m.t1, won: m.w && m.w.id === id, sf: mine ? m.s1 : m.s2, sa: mine ? m.s2 : m.s1 };
  });
  // Liquipedia rows count only once the producer has approved them
  M.lpRows = pid => { const e = (s.lp || {})[pid]; return e && e.approved && e.rows ? e.rows : []; };
  const placeNo = p => parseInt(String(p).replace(/[^\d].*$/, ""), 10) || 99;
  const tierNo = t => parseInt(String(t).replace(/\D/g, ""), 10) || 9;
  M.results = pid => { const v = M.vplayer(pid), seen = new Set(), out = [];
    for (const r of ((v && v.results) || []).map(r => ({ ...r, src: "Liquipedia" })).concat(M.lpRows(pid).map(r => ({ ...r, src: "Liquipedia (import)" })))) {
      const k = r.date + norm(r.event); if (seen.has(k)) continue; seen.add(k); out.push(r); }
    return out.sort((a, b) => b.date.localeCompare(a.date)); };
  const isTier = r => /^tier [1-3]$/i.test(r.tier || "");
  M.achievements = pid => M.results(pid).filter(r => isTier(r) && (placeNo(r.place) <= 3 && tierNo(r.tier) <= 2 || placeNo(r.place) === 1 && tierNo(r.tier) <= 3))
    .sort((a, b) => tierNo(a.tier) - tierNo(b.tier) || placeNo(a.place) - placeNo(b.place) || b.date.localeCompare(a.date));
  M.career = pid => M.results(pid).filter(r => isTier(r)).slice(0, 6);
  M.wins = pid => M.results(pid).filter(r => isTier(r) && placeNo(r.place) === 1);
  // verified reference data (data/verified.json) and portraits
  const V = s.verified || {};
  const vkey = pid => { const p = players[pid]; if (!p) return null; const k = norm(p.name); return PLAYER_ALIASES[k] || k; };
  M.vplayer = pid => { const k = vkey(pid); return k && V.players ? V.players[k] || null : null; };
  M.age = pid => { const v = M.vplayer(pid); if (!v || !v.born || v.born.length < 10) return null; const b = new Date(v.born), e = new Date(EVENT_DAY);
    return e.getFullYear() - b.getFullYear() - ((e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) ? 1 : 0); };
  M.photo = pid => { const p = players[pid]; if (!p) return null; const meta = (s.playerMeta || {})[pid] || {};
    const file = meta.photo || (fileFor("players", norm(p.name)) ? "/players/" + fileFor("players", norm(p.name)) : null); if (!file) return null;
    const d = PHOTO_FRAME[norm(p.name)] || [50, 30, 1], f = meta.frame || { x: d[0], y: d[1], zoom: d[2] };
    return { src: file, x: f.x, y: f.y, zoom: f.zoom, custom: !!meta.frame }; };
  M.teamLines = tid => { const t = teams[tid]; return t && V.teams ? (V.teams[norm(t.name)] || []) : []; };
  M.maps = () => ((V.maps && V.maps.list) || []).map(m => ({ ...m, photo: fileFor("maps", m.id) ? "/maps/" + fileFor("maps", m.id) : null }));
  M.mapsSource = (V.maps && V.maps.source) || "";
  M.event = V.event || null; if (M.event && M.event.day) EVENT_DAY = M.event.day;
  // prize for a placement label ("5th–6th"), from the verified event data only
  M.prize = place => { const e = M.event; if (!e || !e.prizes || !place) return null; const n = x => String(x).replace(/[\s–-]/g, "").toLowerCase();
    const hit = e.prizes.find(([p]) => n(p) === n(place)); return hit ? hit[1] : null; };
  // the worst a team can finish from a given match: keep losing until eliminated
  M.floor = r => { let m = r, guard = 0; while (m && m.loseTo && guard++ < 20) m = R[m.loseTo.bid]; return m ? m.elimPlace : null; };
  // remaining route to the final from a bracket position (list of matches, ending with the Grand Final)
  M.route = bid => { const out = []; let m = R[bid], guard = 0; while (m && guard++ < 20) { out.push(m); m = m.winTo ? R[m.winTo.bid] : null; } return out; };
  // who a team would meet in a bracket slot: a confirmed team, or the teams of the match that decides it
  M.opponentFor = to => { if (!to) return null; const m = R[to.bid]; if (!m) return null; const other = to.slot === 1 ? 1 : 0, id = m.t[other];
    if (id) return { kind: "team", id, m };
    const sl = (slots[to.bid] || {})[other + 1], src = sl && sl.origin ? R[sl.origin] : null;
    if (src) return { kind: sl.cond === "W" ? "winner" : "loser", src, m };
    return { kind: "tbd", hint: m.hint[other], m }; };
  M.playerByHandle = h => Object.values(players).find(p => { const k = norm(p.name); return k === norm(h) || PLAYER_ALIASES[k] === norm(h); }) || null;
  M.facts = (type, id) => (s.facts || []).filter(f => f.subject && f.subject.type === type && (id === undefined || f.subject.id === id));
  M.active = s.active && byId[s.active] ? byId[s.active] : null;
  // Match Ready: everything the selected match needs, prepared or flagged before going live
  M.readiness = () => {
    const r = M.active, out = []; const add = (level, text, where) => out.push({ level, text, where });
    if (!r) { add("block", "No broadcast match selected", "match"); return out; }
    if (!r.ready) add("block", "Teams not decided yet: " + r.hint.filter((h, i) => !r.t[i]).join(" / "), "match");
    const src = s.sources && s.sources.major;
    if (src && src.ok === false) add("warn", "Major sheet offline: showing " + src.origin + " data from " + OD.ago(src.at), "settings");
    for (const id of r.t.filter(Boolean)) {
      const t = teams[id]; if (!t.logo) add("warn", t.name + ": no team logo (graphics show the name only)", "settings");
      for (const pid of t.players) {
        const p = players[pid];
        if (!M.photo(pid)) add("warn", p.name + ": no player photo", "settings");
        if (!M.vplayer(pid) && !M.lpRows(pid).length) add("info", p.name + ": no verified career data (profile shows name, team and nationality)", "settings");
      }
    }
    const cams = (s.casters || []).filter(c => c.name), need = s.desk.layout === "solo" ? 1 : 2;
    if (cams.length < need) add("warn", "Caster names missing (Caster desk tab)", "desk");
    const picks = ((s.pred.byMatch[r.id] || {}).picks) || {};
    const onDesk = (s.deskProfiles[s.desk.layout] || []).filter(id => (s.casters.find(c => c.id === id) || {}).name);
    const noPick = onDesk.filter(id => !(picks[id] && picks[id].team));
    if (r.ready && noPick.length) add("info", "Predictions not entered for " + noPick.map(id => s.casters.find(c => c.id === id).name).join(", "), "predictions");
    if (!files("brand").some(f => /^major-logo\./i.test(f))) add("info", "Major logo not supplied yet (OverDrive logo used): add public/brand/major-logo.png", "settings");
    return out;
  };
  M.others = () => list.filter(r => !M.active || r.id !== M.active.id);
  return M;
}
OD.derive = derive;

/* ---------------- formatting & components ---------------- */
const esc = OD.esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
OD.time = iso => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
OD.day = iso => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)) : "";
OD.ago = iso => { if (!iso) return "never"; const s = Math.round((OD.now() - new Date(iso)) / 1000); return s < 60 ? s + " s ago" : s < 3600 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago"; };
OD.logo = (id, cls) => { const t = OD.M && OD.M.team(id); return t && t.logo ? `<img class="${cls || "lg"}" src="/logos/${esc(t.logo)}" alt="">` : ""; };
OD.logoSrc = id => { const t = OD.M && OD.M.team(id); return t && t.logo ? "/logos/" + t.logo : null; };
OD.brand = name => { const f = ((OD.S && OD.S.assets && OD.S.assets.brand) || []); const hit = f.find(x => x.replace(/\.[a-z0-9]+$/i, "") === name); return hit ? "/brand/" + hit : null; };
OD.eventLogo = () => OD.brand("major-logo") || OD.brand("logo");
OD.tname = id => { const t = OD.M && OD.M.team(id); return t ? t.name : ""; };
OD.nat = pid => { const p = OD.M && OD.M.player(pid), c = p && OD.natCode(p.nat); return c ? `<span class="nat">${esc(c)}</span>` : ""; };
// a framed portrait: the focal point stays put while zooming, so faces sit the same way in every box shape
// boost: small boxes (thumbnails) zoom further into the face than the big portrait cards
OD.photo = (pid, cls, boost) => { const p = OD.M && OD.M.photo(pid); if (!p) return "";
  return `<span class="${cls || "ph"} phx"><img src="${esc(p.src)}" alt="" style="object-position:${p.x}% ${p.y}%;transform-origin:${p.x}% ${p.y}%;transform:scale(${(p.zoom * (boost || 1)).toFixed(2)})" onerror="this.parentNode.remove()"></span>`; };
OD.score = (r, i) => esc(i ? r.s2 : r.s1);
OD.countdown = ms => {
  if (ms == null) return "";
  if (ms <= 0) return "";
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(s).padStart(2, "0");
};
OD.cdSlots = txt => /^[\d:]+$/.test(txt) ? txt.split("").map(c => `<i class="${c === ":" ? "cd-col" : "cd-num"}">${c}</i>`).join("") : esc(txt);

/* stage: 1920×1080 layout, scaled to the source size (3840×2160 = native 4K) */
OD.fit = stage => {
  const f = () => { const sc = Math.min(innerWidth / 1920, innerHeight / 1080); stage.style.transform = `scale(${sc})`; };
  f(); addEventListener("resize", f);
};
})();
