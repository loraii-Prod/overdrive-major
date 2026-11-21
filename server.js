// OverDrive Major 2026: broadcast graphics engine + live sync server (no dependencies, Node 18+).
//
// Run locally:   node server.js            → http://localhost:10000/#control
// Optional env:  PORT, SYNC_KEY (required for writes from other machines), DATA_DIR
//
//   GET  /api/state            public state (never contains VDO.Ninja links or OBS passwords)
//   GET  /api/events           Server-Sent Events: the public state, pushed on every change
//   GET  /api/private          private config (casters' VDO links, OBS) — needs the key (or localhost with no key set)
//   POST /api/action           {type, ...} every change goes through here (needs the key, or localhost with no key set)
//   GET  /healthz
//
// Source ownership (highest wins):  producer override  >  live Major sheet  >  cached sheet  >  bundled snapshot.
// Simulation mode layers fake results on top for testing and never touches the real data.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.env.PORT || 10000;
const KEY = process.env.SYNC_KEY || "";
const DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const PUB = path.join(__dirname, "public");
fs.mkdirSync(DATA, { recursive: true });

const DEFAULT_SETTINGS = {
  majorCsv: "https://docs.google.com/spreadsheets/d/14QAdrl-WX3c4JmtLOHIpTJiKBVNLLaQUfWZgyqVBS_w/gviz/tq?tqx=out:csv&gid=0&headers=1",
  wildcardCsv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQD2Um71alwYDoejxYV15ud9NZLq8E0re8efnSUDkw5M-HN_ApEd9KOmVhuiwEm0bzPdmdQbeHw0NgC/pub?gid=0&single=true&output=csv",
  autoSync: true, pollSec: 30, lpContact: ""
};

/* ------------------------------------------------------------------ persistence */
const file = n => path.join(DATA, n);
function readJSON(n, fb) { try { return JSON.parse(fs.readFileSync(file(n), "utf8")); } catch (e) { return fb; } }
// Writes are batched on a fixed 150 ms delay that is never postponed (a burst of actions can't starve the disk),
// and anything pending is flushed synchronously when the server is stopped.
const pending = {};
function flushOne(n) {
  const v = pending[n]; if (!v) return; delete pending[n];
  const tmp = file(n + ".tmp");
  try { fs.writeFileSync(tmp, JSON.stringify(v.data)); fs.renameSync(tmp, file(n)); } catch (e) { console.log("save", n, e.message); }
}
function writeJSON(n, data) {
  if (pending[n]) { pending[n].data = data; return; }
  pending[n] = { data }; setTimeout(() => flushOne(n), 150);
}
const flushAll = () => Object.keys(pending).forEach(flushOne);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { flushAll(); process.exit(0); });
process.on("exit", flushAll);

const DESK_VIEWS = ["clean", "upcoming", "stats", "others", "pred"];
const BLANK = () => ({
  settings: { ...DEFAULT_SETTINGS },
  overrides: { matches: {} },
  sim: { on: false, matches: {} },
  active: null,
  gp: { preview: null, live: null, pos: { preset: "bl", dx: 0, dy: 0 }, scale: 1 },
  // full-screen sources: each has a preview and a live state ({view, params}); "Take" copies preview → live
  scenes: {
    matchup: { preview: { view: "versus", params: {} }, live: { view: "versus", params: {} }, bg: true },
    player: { preview: { view: "profile", params: {} }, live: { view: "profile", params: {} }, bg: true },
    bracket: { preview: { view: "bracket", params: {} }, live: { view: "bracket", params: {} }, bg: false },
    maps: { preview: { view: "pool", params: {} }, live: { view: "pool", params: {} }, bg: true },
    post: { preview: { view: "result", params: {} }, live: { view: "result", params: {} }, bg: true }
  },
  // caster desk: two persistent cameras, solo or dual
  desk: { layout: "duo", solo: "c1", mode: "integrated", bg: true, cams: true, frames: true, plates: true, decor: true, preload: true },
  // what the desk shows around the cameras: clean | upcoming | stats | others | pred (preview → Take → live)
  deskShow: { preview: "clean", live: "clean", lt: false },
  casters: [{ id: "c1", name: "", role: "", handle: "", crop: { x: 0, y: 0, zoom: 1 } }, { id: "c2", name: "", role: "", handle: "", crop: { x: 0, y: 0, zoom: 1 } }],
  deskProfiles: { solo: ["c1"], duo: ["c1", "c2"] },
  pred: { visible: false, matchId: null, byMatch: {} },
  brk: { title: "Starting soon", bg: false, rotateSec: 12, breakAt: null, nextAt: null,
         panels: { bracket: true, upcoming: true, live: true, results: true, facts: true, next: true } },
  bracketOpts: { bg: false, opacity: 100, title: true, times: true, seeds: true },
  dismissed: {},
  facts: [],
  lp: {},
  playerMeta: {},                                     // {pid: {photo, lpPage}}
  events: []
});
let S = Object.assign(BLANK(), readJSON("state.json", {}));
S.settings = Object.assign({ ...DEFAULT_SETTINGS }, S.settings);
for (const k of Object.keys(BLANK())) if (S[k] === undefined) S[k] = BLANK()[k];
for (const [k, v] of Object.entries(BLANK().scenes)) if (!S.scenes[k]) S.scenes[k] = v;
for (const id of ["c1", "c2"]) if (!S.casters.some(c => c.id === id)) S.casters.push(BLANK().casters.find(c => c.id === id));
delete S.mu;
const syncProfiles = () => { S.deskProfiles = { solo: [S.desk.solo === "c2" ? "c2" : "c1"], duo: ["c1", "c2"] }; if (!["solo", "duo"].includes(S.desk.layout)) S.desk.layout = "duo"; };
syncProfiles();
// verified reference data (shipped with the project, see data/verified.json)
let VERIFIED = {};
try { VERIFIED = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "verified.json"), "utf8")); } catch (e) { console.log("verified.json:", e.message); }
// asset folders are scanned so files dropped in (Major logos, portraits, brand loops) are picked up without a restart
let ASSETS = {};
function scanAssets() {
  const next = {};
  for (const dir of ["logos", "players", "maps", "brand"]) {
    try { next[dir] = fs.readdirSync(path.join(PUB, dir)).filter(f => /\.(png|jpe?g|webp|svg|webm)$/i.test(f)); } catch (e) { next[dir] = []; }
  }
  if (JSON.stringify(next) !== JSON.stringify(ASSETS)) { ASSETS = next; return true; }
  return false;
}
scanAssets();
let PRIV = Object.assign({ casters: {}, obs: { url: "ws://127.0.0.1:4455", password: "" } }, readJSON("private.json", {}));
let privRev = Date.now();

// seed facts once (verified, sourced; the producer can delete them)
if (!S.facts.length && !S._factsSeeded) {
  S.facts = [
    { id: "f_big_split2", subject: { type: "team", id: "TEAM_0001" }, text: "BIG won OverDrive 2026 Split 2: Division 1, with Weibo x FUT runner-up",
      source: "Liquipedia", url: "https://liquipedia.net/trackmania/OverDrive", addedAt: "2026-11-21T17:50:00Z" },
    { id: "f_major_pool", subject: { type: "event", id: "major" }, text: "8 teams compete for a €13,600 prize pool at the OverDrive Major",
      source: "Liquipedia", url: "https://liquipedia.net/trackmania/OverDrive/2026/Split_3/Major", addedAt: "2026-11-21T17:50:00Z" }
  ];
  S._factsSeeded = true;
}

/* ------------------------------------------------------------------ CSV + time helpers */
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(x => x.trim()));
}
// "11/22/2026 17:00" in Paris time → ISO UTC
function cetToISO(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(raw || "") || /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(raw || "");
  if (!m) return null;
  let y, mo, d; if (m[0].includes("/")) { mo = +m[1] - 1; d = +m[2]; y = +m[3]; } else { y = +m[1]; mo = +m[2] - 1; d = +m[3]; }
  const hh = +m[4], mm = +m[5];
  const lastSun = mon => 31 - new Date(Date.UTC(y, mon, 31)).getUTCDay();
  const dstS = Date.UTC(y, 2, lastSun(2), 1), dstE = Date.UTC(y, 9, lastSun(9), 1);
  const approx = Date.UTC(y, mo, d, hh - 1, mm), off = approx >= dstS && approx < dstE ? 2 : 1;
  return new Date(Date.UTC(y, mo, d, hh - off, mm)).toISOString();
}
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* ------------------------------------------------------------------ Major sheet → normalized tournament */
function normStatus(raw, winner) {
  if (winner) return "completed";
  if (/^completed|^done|^finished/i.test(raw)) return "completed";
  if (/live|ongoing|in.?progress|playing/i.test(raw)) return "live";
  if (/not.?played|cancel/i.test(raw)) return "void";
  return "upcoming";
}
function fromSeedFile(seed) {
  return {
    fetchedAt: seed.fetchedAt,
    teams: Object.fromEntries(seed.teams.map(t => [t.id, t])),
    players: Object.fromEntries(seed.players.map(p => [p.id, p])),
    slots: seed.slots.map(([bid, side, round, slot, cond, origin, seed]) => ({ bid, side, round, slot, cond, origin, seed })),
    matches: Object.fromEntries(seed.matches.map(([id, bid, dt, t1, t2, st, bo, s1, s2, w]) =>
      [id, { id, bid, at: cetToISO(dt), t1: t1 || null, t2: t2 || null, raw: st, status: normStatus(st, w), bo, s1, s2, winner: w || null }]))
  };
}
function parseMajor(text) {
  if (/^\s*</.test(text)) throw new Error("got HTML, not CSV");
  const rows = parseCSV(text); if (rows.length < 2) throw new Error("empty sheet");
  const H = rows[0].map(h => h.toLowerCase());
  const at = (name, fb, from = 0) => { const i = H.indexOf(name, from); return i >= 0 ? i : fb; };
  const tId = at("team_id", 0), mId = at("match_id", 25), pId = at("player_id", 12), hlp = at("bracket_helper", 17);
  const sB = hlp - 1;
  const out = { fetchedAt: new Date().toISOString(), teams: {}, players: {}, slots: [], matches: {} };
  for (const r of rows.slice(1)) {
    const pid = r[pId], pname = r[pId + 1];
    if (/^PLAYER_/i.test(pid) && pname) out.players[pid] = { id: pid, name: pname, nat: r[pId + 2] || "" };
  }
  for (const r of rows.slice(1)) {
    const id = r[tId], name = r[tId + 1];
    if (!id || !name || !/^TEAM_/i.test(id)) continue;
    const ids = [r[tId + 3], r[tId + 4], r[tId + 5], r[tId + 6]], handles = [r[tId + 7], r[tId + 8], r[tId + 9], r[tId + 10]];
    const pick = i => {
      if (ids[i] && out.players[ids[i]]) return ids[i];
      if (!handles[i] || /^(none|-)$/i.test(handles[i])) return null;
      const byName = Object.values(out.players).find(p => norm(p.name) === norm(handles[i]));
      if (byName) return byName.id;
      const pid = ids[i] || "PLAYER_" + norm(handles[i]); out.players[pid] = { id: pid, name: handles[i], nat: "" }; return pid;
    };
    out.teams[id] = { id, name, seed: parseInt(String(r[tId + 2]).replace(/^#/, ""), 10) || null,
      players: [pick(0), pick(1)].filter(Boolean), subs: [pick(2), pick(3)].filter(Boolean) };
  }
  for (const r of rows.slice(1)) {
    const bid = r[sB]; if (!/^R\d+_/.test(bid || "")) continue;
    // bracket_id | bracket_helper | bracket_side | round | slot | condition | origin | round_seed
    let cond = r[sB + 5], origin = r[sB + 6];
    if (/seeding/i.test(cond) || /seeding/i.test(origin)) { cond = "seed"; origin = null; }
    out.slots.push({ bid, side: r[sB + 2], round: +r[sB + 3] || 0, slot: +r[sB + 4] || 0, cond, origin, seed: parseInt(r[sB + 7], 10) || null });
  }
  for (const r of rows.slice(1)) {
    const id = r[mId]; if (!/^(M_|MATCH_)/i.test(id || "")) continue;
    const real = v => /^TEAM_/i.test(v || "") ? v : null;
    const w = real(r[mId + 15]);
    out.matches[id] = { id, bid: r[mId + 1], at: cetToISO(r[mId + 4]), t1: real(r[mId + 5]), t2: real(r[mId + 7]), raw: r[mId + 9],
      bo: parseInt(r[mId + 11], 10) || 5, s1: r[mId + 13], s2: r[mId + 14], winner: w };
    out.matches[id].status = normStatus(r[mId + 9], w);
  }
  if (!Object.keys(out.teams).length || !Object.keys(out.matches).length) throw new Error("no teams or matches found");
  return out;
}

/* ------------------------------------------------------------------ Wildcard sheet → previous results */
const WC_STRUCT = (() => {
  const W = id => ({ w: id }), L = id => ({ l: id });
  return {
    R1_UB1: ["All Gamers", "BYE"], R1_UB2: ["BOMBO", "Ragnarok"], R1_UB3: ["rnboi", "Team Abyssal"], R1_UB4: ["Team Nyxbar", "Dyslexai"],
    R1_UB5: ["NAVI x Joel", "TMTAS"], R1_UB6: ["Brothers", "Nyxar Competitive"], R1_UB7: ["PIWO", "Loading"], R1_UB8: ["ONIC x Josh", "WINGS"],
    R2_UB1: [W("R1_UB1"), W("R1_UB2")], R2_UB2: [W("R1_UB3"), W("R1_UB4")], R2_UB3: [W("R1_UB5"), W("R1_UB6")], R2_UB4: [W("R1_UB7"), W("R1_UB8")],
    R3_UB1: [W("R2_UB1"), W("R2_UB2")], R3_UB2: [W("R2_UB3"), W("R2_UB4")],
    R2_LB1: [L("R1_UB1"), L("R1_UB2")], R2_LB2: [L("R1_UB3"), L("R1_UB4")], R2_LB3: [L("R1_UB5"), L("R1_UB6")], R2_LB4: [L("R1_UB7"), L("R1_UB8")],
    R3_LB1: [L("R2_UB4"), W("R2_LB1")], R3_LB2: [L("R2_UB3"), W("R2_LB2")], R3_LB3: [L("R2_UB2"), W("R2_LB3")], R3_LB4: [L("R2_UB1"), W("R2_LB4")],
    R4_LB1: [W("R3_LB1"), W("R3_LB2")], R4_LB2: [W("R3_LB3"), W("R3_LB4")],
    R5_LB1: [L("R3_UB1"), W("R4_LB1")], R5_LB2: [L("R3_UB2"), W("R4_LB2")]
  };
})();
const WC_NAMES = { R1_UB: "Round 1", R2_UB: "Quarter-final", R3_UB: "Upper qualifier", R2_LB: "Lower round 2", R3_LB: "Lower round 3", R4_LB: "Lower round 4", R5_LB: "Lower qualifier" };
function parseWildcard(text) {
  if (/^\s*</.test(text)) throw new Error("got HTML, not CSV");
  const sc = {};
  for (const r of parseCSV(text).slice(1)) {
    const mid = r[30] || "", bid = r[31] || "";
    if (!mid.startsWith("M_") || !WC_STRUCT[bid]) continue;
    sc[bid] = { s1: (r[43] || "").toUpperCase(), s2: (r[44] || "").toUpperCase(), at: cetToISO(r[34]) };
  }
  if (!Object.keys(sc).length) throw new Error("no wildcard matches found");
  const res = {};
  const get = id => {
    if (res[id]) return res[id];
    const [a, b] = WC_STRUCT[id].map(s => typeof s === "string" ? s : (s.w ? get(s.w).winner : get(s.l).loser));
    const st = sc[id] || {}, n1 = parseInt(st.s1, 10), n2 = parseInt(st.s2, 10);
    let winner = null, loser = null;
    if (a === "BYE" && b) { winner = b; loser = "BYE"; } else if (b === "BYE" && a) { winner = a; loser = "BYE"; }
    else if (a && b) {
      const lost = v => v === "FF" || v === "L";
      if (st.s1 === "W" || (lost(st.s2) && !lost(st.s1)) || (n1 >= 3 && !(n2 >= n1))) { winner = a; loser = b; }
      else if (st.s2 === "W" || (lost(st.s1) && !lost(st.s2)) || (n2 >= 3 && !(n1 >= n2))) { winner = b; loser = a; }
    }
    return res[id] = { bid: id, round: WC_NAMES[id.slice(0, 5)], t1: a, t2: b, s1: st.s1 || "", s2: st.s2 || "", at: st.at || null, winner, loser };
  };
  Object.keys(WC_STRUCT).forEach(get);
  const matches = Object.values(res).filter(m => m.winner && m.loser !== "BYE" && m.t1 !== "BYE" && m.t2 !== "BYE");
  const qualified = ["R3_UB1", "R3_UB2", "R5_LB1", "R5_LB2"].map(id => res[id].winner).filter(Boolean);
  return { fetchedAt: new Date().toISOString(), matches, qualified };
}

/* ------------------------------------------------------------------ data sources */
let MAJOR = readJSON("cache-major.json", null), majorOrigin = MAJOR ? "cache" : "seed";
if (!MAJOR) MAJOR = fromSeedFile(readJSON("seed-major.json", null) || JSON.parse(fs.readFileSync(path.join(__dirname, "data", "seed-major.json"), "utf8")));
let WILD = readJSON("cache-wildcard.json", null);
const SRC = {
  major: { ok: majorOrigin !== "seed" ? null : false, origin: majorOrigin, at: MAJOR.fetchedAt, checkedAt: null, error: null },
  wildcard: { ok: null, origin: WILD ? "cache" : "none", at: WILD ? WILD.fetchedAt : null, checkedAt: null, error: null },
  liquipedia: { running: false, done: 0, total: 0, error: null }
};
async function fetchText(url, ms = 15000, headers = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now(), { signal: ctl.signal, headers, redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}
async function pullMajor() {
  SRC.major.checkedAt = new Date().toISOString();
  try {
    const next = parseMajor(await fetchText(S.settings.majorCsv));
    const before = JSON.stringify({ ...MAJOR, fetchedAt: 0 }), after = JSON.stringify({ ...next, fetchedAt: 0 });
    MAJOR = next; Object.assign(SRC.major, { ok: true, origin: "live", at: next.fetchedAt, error: null });
    writeJSON("cache-major.json", MAJOR);
    commit(before !== after);
  } catch (e) {
    Object.assign(SRC.major, { ok: false, error: e.name === "AbortError" ? "timed out" : e.message });
    commit(false, true);
  }
}
async function pullWildcard() {
  SRC.wildcard.checkedAt = new Date().toISOString();
  try {
    WILD = parseWildcard(await fetchText(S.settings.wildcardCsv));
    Object.assign(SRC.wildcard, { ok: true, origin: "live", at: WILD.fetchedAt, error: null });
    writeJSON("cache-wildcard.json", WILD); commit(true);
  } catch (e) { Object.assign(SRC.wildcard, { ok: false, error: e.name === "AbortError" ? "timed out" : e.message }); commit(false, true); }
}
let pollTimer = null;
function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => { if (S.settings.autoSync) await pullMajor(); schedulePoll(); }, Math.max(15, +S.settings.pollSec || 30) * 1000);
}

/* ------------------------------------------------------------------ Liquipedia (optional, server-side, polite) */
// Liquipedia API terms: identify yourself with a User-Agent, gzip, and at most one action=parse request every 30 s.
const lpQueue = []; let lpTimer = null;
function lpPage(pid) {
  const meta = S.playerMeta[pid] || {}, p = (effective().players || {})[pid];
  return meta.lpPage || (p ? p.name.charAt(0).toUpperCase() + p.name.slice(1) : null);
}
function parseLpResults(html) {
  const rows = [];
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = tr.split(/<\/td>/i).slice(0, -1).map(c => {
      const title = (/<a [^>]*title="([^"]+)"/i.exec(c) || [])[1] || "";
      const text = c.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
      return { text, title };
    });
    if (cells.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0].text)) continue;
    const place = cells[1].text, tier = cells[2].text;
    const rest = cells.slice(3);
    const tourn = rest.find(c => c.text.length > 3 && !/^[-$€]|^\$?[\d,.]+$/.test(c.text));
    if (!tourn) continue;
    const ti = rest.indexOf(tourn), team = rest[ti + 1] ? (rest[ti + 1].text || rest[ti + 1].title) : "";
    rows.push({ date: cells[0].text, place, tier, event: tourn.text, team });
  }
  return rows.slice(0, 80);
}
async function lpFetchOne(pid) {
  const page = lpPage(pid); if (!page) return;
  const url = "https://liquipedia.net/trackmania/api.php?action=parse&format=json&formatversion=2&prop=text&page=" + encodeURIComponent(page + "/Results");
  const ua = "OverDriveMajorBroadcast/1.0 (" + (S.settings.lpContact || "broadcast graphics; contact via OverDrive") + ")";
  const cur = S.lp[pid] = Object.assign(S.lp[pid] || {}, { page, status: "fetching" });
  try {
    const j = JSON.parse(await fetchText(url, 20000, { "User-Agent": ua, "Accept-Encoding": "gzip" }));
    if (j.error) throw new Error(j.error.info || j.error.code);
    const rows = parseLpResults((j.parse && j.parse.text) || "");
    Object.assign(cur, { status: rows.length ? "ready" : "empty", rows, fetchedAt: new Date().toISOString(), approved: false, error: null,
      url: "https://liquipedia.net/trackmania/" + encodeURIComponent(page.replace(/ /g, "_")) + "/Results" });
  } catch (e) { Object.assign(cur, { status: "error", error: e.message }); SRC.liquipedia.error = e.message; }
  SRC.liquipedia.done++; commit(true);
}
function lpRun() {
  if (lpTimer || !lpQueue.length) { SRC.liquipedia.running = !!lpTimer; return; }
  SRC.liquipedia.running = true;
  const step = async () => {
    const pid = lpQueue.shift();
    if (pid) await lpFetchOne(pid);
    if (lpQueue.length) lpTimer = setTimeout(step, 31000); else { lpTimer = null; SRC.liquipedia.running = false; commit(true); }
  };
  lpTimer = setTimeout(step, 0);
}

/* ------------------------------------------------------------------ effective tournament (sheet + overrides + simulation) */
const MFIELDS = ["s1", "s2", "status", "winner", "t1", "t2", "at"];
function effective() {
  const T = JSON.parse(JSON.stringify(MAJOR));
  for (const [id, o] of Object.entries(S.overrides.matches || {})) if (T.matches[id]) for (const k of MFIELDS) if (o[k] !== undefined) T.matches[id][k] = o[k];
  if (S.sim.on) for (const [id, o] of Object.entries(S.sim.matches || {})) if (T.matches[id]) for (const k of MFIELDS) if (o[k] !== undefined) T.matches[id][k] = o[k];
  return T;
}
let lastSnap = null;
function trackEvents() {
  const T = effective(), snap = {};
  for (const m of Object.values(T.matches)) snap[m.id] = { s1: m.s1, s2: m.s2, status: m.status, winner: m.winner };
  if (lastSnap) for (const [id, n] of Object.entries(snap)) {
    const o = lastSnap[id]; if (!o) continue;
    if (o.s1 !== n.s1 || o.s2 !== n.s2 || o.status !== n.status || o.winner !== n.winner) {
      const kind = n.winner && !o.winner ? "result" : (n.status === "live" && o.status !== "live" ? "start" : "score");
      S.events.unshift({ id: `${id}:${n.s1}-${n.s2}:${n.status}:${n.winner || ""}`, mid: id, kind, s1: n.s1, s2: n.s2, status: n.status,
        winner: n.winner, at: new Date().toISOString(), sim: !!S.sim.on });
    }
  }
  S.events = S.events.slice(0, 60);
  lastSnap = snap;
}

/* ------------------------------------------------------------------ publishing */
let rev = Date.now(), PUBLIC_CACHE = null;
const clients = new Set();
function publicState() {
  if (PUBLIC_CACHE) return PUBLIC_CACHE;
  const { _factsSeeded, ...rest } = S;
  PUBLIC_CACHE = JSON.stringify({ ...rest, rev, privRev, serverNow: Date.now(), t: effective(), wildcard: WILD, sources: SRC, verified: VERIFIED, assets: ASSETS,
    writable: !KEY ? "localhost" : "key" });
  return PUBLIC_CACHE;
}
let pushTimer = null;
function commit(changed, statusOnly) {
  if (changed) trackEvents();
  rev = Date.now(); PUBLIC_CACHE = null;
  if (!statusOnly || changed) writeJSON("state.json", S);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { const s = publicState(); for (const c of clients) c.write("data: " + s + "\n\n"); }, 15);
}

/* ------------------------------------------------------------------ actions */
const uid = () => Math.random().toString(36).slice(2, 9);
const clampStr = (v, n = 300) => String(v == null ? "" : v).slice(0, n);
function setGfx(slot, g) {
  if (!g || !g.type) { S.gp[slot] = null; return; }
  S.gp[slot] = { uid: uid(), type: clampStr(g.type, 40), params: g.params && typeof g.params === "object" ? g.params : {},
    dur: Math.max(0, Math.min(600, +g.dur || 0)), shownAt: slot === "live" ? Date.now() : null, until: null };
  if (slot === "live" && S.gp.live.dur) S.gp.live.until = Date.now() + S.gp.live.dur * 1000;
}
const ACTIONS = {
  // broadcast match: only ever changed here, by the producer
  "active.set": a => { S.active = a.id && MAJOR.matches[a.id] ? a.id : null; if (S.active) S.pred.matchId = S.active; },
  // manual overrides of important match data
  "override.set": a => {
    if (!MAJOR.matches[a.id]) throw new Error("unknown match");
    const o = S.overrides.matches[a.id] = S.overrides.matches[a.id] || {};
    for (const k of MFIELDS) if (k in (a.fields || {})) { const v = a.fields[k]; if (v === null || v === undefined) delete o[k]; else o[k] = clampStr(v, 40); }
    if (!Object.keys(o).length) delete S.overrides.matches[a.id];
  },
  "override.clear": a => { if (a.id) delete S.overrides.matches[a.id]; else S.overrides.matches = {}; },
  // gameplay editorial layer: nothing goes live without one of these
  "gp.preview": a => setGfx("preview", a.g),
  "gp.take": () => { if (S.gp.preview) setGfx("live", { ...S.gp.preview, dur: S.gp.preview.dur }); },
  "gp.show": a => setGfx("live", a.g),
  "gp.hide": () => { S.gp.live = null; },
  "gp.pos": a => { const p = a.pos || {}; S.gp.pos = { preset: ["bl", "br", "tr", "tl", "ml", "bc"].includes(p.preset) ? p.preset : "bl",
    dx: Math.max(-800, Math.min(800, +p.dx || 0)), dy: Math.max(-600, Math.min(600, +p.dy || 0)) }; if (a.scale) S.gp.scale = Math.max(.6, Math.min(1.5, +a.scale)); },
  "editorial.clear": () => { S.gp.live = null; S.pred.visible = false; S.deskShow.live = "clean"; S.deskShow.lt = false; },
  // full-screen sources: preview, take, background
  "scene.set": a => {
    const sc = S.scenes[a.scene]; if (!sc) throw new Error("unknown scene");
    const st = { view: clampStr(a.view, 24), params: a.params && typeof a.params === "object" ? a.params : {} };
    if (a.slot === "live") sc.live = st; else sc.preview = st;
  },
  "scene.take": a => { const sc = S.scenes[a.scene]; if (!sc) throw new Error("unknown scene"); sc.live = JSON.parse(JSON.stringify(sc.preview)); sc.live.at = Date.now(); },
  "scene.bg": a => { const sc = S.scenes[a.scene]; if (!sc) throw new Error("unknown scene"); sc.bg = !!a.on; },
  // caster desk
  "desk.preview": a => { if (DESK_VIEWS.includes(a.view)) S.deskShow.preview = a.view; },
  "desk.take": () => { const v = S.deskShow.preview; S.deskShow.live = v;
    // taking the predictions reveals every saved pick for the broadcast match
    if (v === "pred" && S.active && S.pred.byMatch[S.active]) for (const p of Object.values(S.pred.byMatch[S.active].picks)) if (p.team) p.revealed = true; },
  "desk.hide": () => { S.deskShow.live = "clean"; },
  "desk.lt": a => { S.deskShow.lt = !!a.on; },
  "desk.set": a => { for (const k of ["layout", "mode", "solo"]) if (a[k]) S.desk[k] = clampStr(a[k], 20); for (const k of ["bg", "cams", "frames", "plates", "decor", "preload"]) if (k in a) S.desk[k] = !!a[k]; syncProfiles(); },
  "caster.save": a => {
    const c = a.caster || {}; const id = c.id; if (!["c1", "c2"].includes(id)) throw new Error("only cameras c1 and c2 exist");
    const pub = { id, name: clampStr(c.name, 40), role: clampStr(c.role, 40), handle: clampStr(c.handle, 40),
      crop: { x: +((c.crop || {}).x) || 0, y: +((c.crop || {}).y) || 0, zoom: Math.max(1, Math.min(4, +((c.crop || {}).zoom) || 1)) } };
    const i = S.casters.findIndex(x => x.id === id); if (i >= 0) S.casters[i] = pub; else S.casters.push(pub);
    if ("vdo" in c) { PRIV.casters[id] = { vdo: clampStr(c.vdo, 600) }; savePriv(); }
  },
  "caster.clear": a => { const c = S.casters.find(x => x.id === a.id); if (c) Object.assign(c, { name: "", role: "", handle: "", crop: { x: 0, y: 0, zoom: 1 } }); delete PRIV.casters[a.id]; savePriv(); },

  "obs.save": a => { PRIV.obs = { url: clampStr(a.url, 200), password: clampStr(a.password, 200) }; savePriv(); },
  // predictions, saved against the match id
  "pred.set": a => {
    const mid = a.matchId || S.active; if (!mid) throw new Error("no match");
    const m = S.pred.byMatch[mid] = S.pred.byMatch[mid] || { picks: {} };
    const p = m.picks[a.caster] = Object.assign(m.picks[a.caster] || { revealed: false }, {});
    if ("team" in a) p.team = a.team || null; if ("s1" in a) p.s1 = a.s1 === "" ? null : +a.s1; if ("s2" in a) p.s2 = a.s2 === "" ? null : +a.s2;
    if ("name" in a) p.name = clampStr(a.name, 40);
    p.savedAt = new Date().toISOString();
  },
  "pred.reveal": a => { const m = S.pred.byMatch[a.matchId || S.active]; if (!m) return; for (const [k, p] of Object.entries(m.picks)) if (a.caster === "*" || a.caster === k) p.revealed = true; S.pred.visible = true; S.pred.matchId = a.matchId || S.active; },
  "pred.show": a => { S.pred.visible = !!a.on; if (a.matchId) S.pred.matchId = a.matchId; },
  "pred.reset": a => { const m = S.pred.byMatch[a.matchId || S.active]; if (m) { if (a.hard) delete S.pred.byMatch[a.matchId || S.active]; else for (const p of Object.values(m.picks)) p.revealed = false; } S.pred.visible = false; },
  // break screens
  "brk.set": a => {
    if (typeof a.title === "string") S.brk.title = clampStr(a.title, 40);
    if ("bg" in a) S.brk.bg = !!a.bg; if (a.rotateSec) S.brk.rotateSec = Math.max(4, Math.min(120, +a.rotateSec));
    if (a.panels) for (const k of Object.keys(S.brk.panels)) if (k in a.panels) S.brk.panels[k] = !!a.panels[k];
    if ("breakAt" in a) S.brk.breakAt = a.breakAt ? +a.breakAt : null;
    if ("nextAt" in a) S.brk.nextAt = a.nextAt ? +a.nextAt : null;
  },
  "bracket.opts": a => Object.assign(S.bracketOpts, a.opts || {}),
  // suggestions & facts
  "suggest.dismiss": a => { S.dismissed[clampStr(a.id, 160)] = Date.now(); },
  "suggest.restore": () => { S.dismissed = {}; },
  "fact.add": a => { if (!a.text) throw new Error("empty fact"); S.facts.push({ id: "f_" + uid(), subject: a.subject || { type: "event", id: "major" },
    text: clampStr(a.text, 220), source: clampStr(a.source || "Producer", 60), url: clampStr(a.url, 300), addedAt: new Date().toISOString() }); },
  "fact.remove": a => { S.facts = S.facts.filter(f => f.id !== a.id); },
  "player.meta": a => {
    const m = S.playerMeta[a.id] = Object.assign(S.playerMeta[a.id] || {}, {});
    if ("photo" in a) m.photo = clampStr(a.photo, 400); if ("lpPage" in a) m.lpPage = clampStr(a.lpPage, 80);
    if (a.frame) m.frame = { x: Math.max(0, Math.min(100, +a.frame.x || 0)), y: Math.max(0, Math.min(100, +a.frame.y || 0)), zoom: Math.max(1, Math.min(4, +a.frame.zoom || 1)) };
    if (a.frame === null) delete m.frame;
  },
  "lp.import": a => { const ids = a.ids && a.ids.length ? a.ids : Object.keys(effective().players);
    for (const id of ids) if (!lpQueue.includes(id)) lpQueue.push(id); SRC.liquipedia.total = lpQueue.length; SRC.liquipedia.done = 0; lpRun(); },
  "lp.approve": a => { if (S.lp[a.id]) S.lp[a.id].approved = !!a.on; },
  // data sources
  "source.refresh": a => { if (a.which === "wildcard") pullWildcard(); else pullMajor(); },
  "settings.set": a => { for (const k of ["majorCsv", "wildcardCsv", "lpContact"]) if (typeof a[k] === "string" && a[k]) S.settings[k] = a[k].trim();
    if ("autoSync" in a) S.settings.autoSync = !!a.autoSync; if (a.pollSec) S.settings.pollSec = Math.max(15, Math.min(600, +a.pollSec)); schedulePoll(); },
  // simulation: fake results layered on top, never written to the real data
  "sim.toggle": a => { S.sim.on = !!a.on; },
  "sim.score": a => {
    if (!S.sim.on) throw new Error("simulation is off");
    const T = effective(), m = T.matches[a.id]; if (!m) throw new Error("unknown match");
    const n = k => parseInt(m[k], 10) || 0, need = Math.ceil((m.bo || 5) / 2);
    const o = S.sim.matches[a.id] = Object.assign(S.sim.matches[a.id] || {}, { s1: String(n("s1")), s2: String(n("s2")) });
    if (a.side === 1 && n("s1") < need && n("s2") < need) o.s1 = String(n("s1") + 1);
    if (a.side === 2 && n("s1") < need && n("s2") < need) o.s2 = String(n("s2") + 1);
    o.status = "live";
    if (+o.s1 >= need || +o.s2 >= need) { o.status = "completed"; o.winner = +o.s1 >= need ? (a.t1 || m.t1 || "SIM1") : (a.t2 || m.t2 || "SIM2"); }
  },
  "sim.reset": () => { S.sim.matches = {}; }
};
function savePriv() { privRev = Date.now(); writeJSON("private.json", PRIV); }


/* ------------------------------------------------------------------ HTTP */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png",
  ".webm": "video/webm", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".json": "application/json" };
function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ "Content-Type": type || "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key" }, extra || {}));
  res.end(body);
}
function isLocal(req) { const a = req.socket.remoteAddress || ""; return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1"; }
function authorised(req) { return KEY ? req.headers["x-sync-key"] === KEY : isLocal(req); }
function serveStatic(req, res, p) {
  const fp = path.normalize(path.join(PUB, p));
  if (!fp.startsWith(PUB)) return send(res, 403, "Forbidden", "text/plain");
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Not found", "text/plain");
    const type = MIME[path.extname(fp)] || "application/octet-stream";
    const range = req.headers.range, cache = /\.(webm|woff2|png|jpg)$/.test(fp) ? "public, max-age=3600" : "no-cache";
    if (range && type === "video/webm") {                       // OBS/Chromium seek inside the desk loops
      const [s, e] = range.replace(/bytes=/, "").split("-"), start = +s, end = Math.min(st.size - 1, e ? +e : start + 2097151); // 2 MB chunks: no connection is held open by a buffering video
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": cache });
      return fs.createReadStream(fp, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Cache-Control": cache, "Accept-Ranges": "bytes" });
    fs.createReadStream(fp).pipe(res);
  });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (url.pathname === "/api/state") return send(res, 200, publicState());
  if (url.pathname === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
    res.write("retry: 1500\n\ndata: " + publicState() + "\n\n");
    clients.add(res); const ka = setInterval(() => res.write(": ka\n\n"), 15000);
    req.on("close", () => { clients.delete(res); clearInterval(ka); });
    return;
  }
  if (url.pathname === "/api/private") {
    if (!authorised(req)) return send(res, 403, JSON.stringify({ error: "Wrong or missing key" }));
    return send(res, 200, JSON.stringify({ ...PRIV, privRev }));
  }
  if (url.pathname === "/api/action" && req.method === "POST") {
    if (!authorised(req)) return send(res, 403, JSON.stringify({ error: KEY ? "Wrong or missing key" : "Changes are only accepted from this computer (set SYNC_KEY to allow others)" }));
    let body = ""; req.on("data", c => { body += c; if (body.length > 300000) req.destroy(); });
    req.on("end", () => {
      let a; try { a = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ error: "Bad JSON" })); }
      const fn = ACTIONS[a.type]; if (!fn) return send(res, 400, JSON.stringify({ error: "Unknown action " + a.type }));
      try { fn(a); } catch (e) { return send(res, 400, JSON.stringify({ error: e.message })); }
      commit(true); send(res, 200, JSON.stringify({ rev }));
    });
    return;
  }
  if (url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
  if (url.pathname === "/" || url.pathname === "/index.html") return serveStatic(req, res, "index.html");
  return serveStatic(req, res, decodeURIComponent(url.pathname));
});

if (require.main === module) {
  server.on("error", e => {
    if (e.code === "EADDRINUSE") {
      console.log(`\nPort ${PORT} is already in use: another copy of this server (or another program) is running.`);
      console.log(`Close it, or start on another port:`);
      console.log(`  Windows cmd:   set PORT=${PORT + 1} && npm start`);
      console.log(`  PowerShell:    $env:PORT=${PORT + 1}; npm start`);
      console.log(`  macOS/Linux:   PORT=${PORT + 1} npm start\n`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(PORT, () => {
    console.log(`OverDrive Major graphics on http://localhost:${PORT}/  ·  producer: http://localhost:${PORT}/#control`);
    console.log(KEY ? "Writes need the SYNC_KEY." : "No SYNC_KEY set: changes are accepted from this computer only.");
  });
  trackEvents();
  pullMajor().finally(schedulePoll); pullWildcard();
  setInterval(() => { if (S.settings.autoSync) pullWildcard(); }, 30 * 60000);
  setInterval(() => { if (scanAssets()) commit(false, true); }, 10000);
  // expire timed editorial graphics on the server so every source agrees
  setInterval(() => { if (S.gp.live && S.gp.live.until && Date.now() >= S.gp.live.until) { S.gp.live = null; commit(true); } }, 200);
}
module.exports = { parseMajor, parseWildcard, parseLpResults, cetToISO, fromSeedFile };
