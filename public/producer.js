/* OverDrive Major: producer (#control). Broadcast control surface for one operator.
   Same actions and state as before; layout follows the approved design (status bar, F1–F8 pages, PVW/PGM monitors,
   persistent editorial panel). Nothing airs without an explicit Show / Take. */
"use strict";
(() => {
const esc = OD.esc;
const P = window.PRODUCER = { page: "overview", priv: null, privRev: null, pid: null, cmp: [], fs: "matchup", dur: 10, curMap: null, predMatch: null, obs: null };
const J = o => esc(JSON.stringify(o));
const btn = (label, act, p, cls, dis, title) => `<button class="b ${cls || ""}" data-act="${act}" data-p="${J(p || {})}"${dis ? " disabled" : ""}${title ? ` title="${esc(title)}"` : ""}>${label}</button>`;
const sw = (label, on, data, dis) => `<button class="sw ${on ? "on" : ""}" ${data}${dis ? " disabled" : ""}><i></i>${label}</button>`;
const GNAME = { player: "Spotlight", achievements: "Achievements", career: "Recent results", compare: "Comparison", team: "Team stats", path: "Road so far",
  recent: "Latest results", others: "Other matches", upcoming: "Coming up", result: "Match update", stakes: "What's at stake", seeds: "Seed takeover",
  h2h: "Head to head", map: "Map", fact: "Fact", custom: "Message" };
const gname = g => { if (!g) return ""; const M = OD.M, p = g.params || {};
  return (GNAME[g.type] || g.type) + (p.pid && M.player(p.pid) ? " · " + M.player(p.pid).name : p.tid ? " · " + OD.tname(p.tid) : p.id && g.type === "map" ? " · " + ((M.maps().find(m => m.id === p.id) || {}).name || "") : ""); };
P.gname = gname;
const PAGES = [["overview", "Overview", "F1"], ["gameplay", "Gameplay", "F2"], ["matchup", "Matchup", "F3"], ["desk", "Caster Desk", "F4"],
  ["predictions", "Predictions", "F5"], ["breaks", "Breaks", "F6"], ["bracket", "Bracket", "F7"], ["settings", "Settings", "F8"]];
const tm = id => { const M = OD.M, t = M && M.team(id); if (!t) return ""; const src = OD.logoSrc(id);
  return `<span class="tm">${src ? `<img src="${esc(src)}" alt="">` : `<span class="mono">${esc(t.short)}</span>`}<span>${esc(t.name)}</span></span>`; };
const logoImg = id => OD.logoSrc(id) ? `<img src="${esc(OD.logoSrc(id))}" alt="">` : "";
const mon = (hash, label, cls, rid) => `<div class="mon chk ${cls || ""}"><span class="lb">${label}</span><span class="lr" id="${rid || ""}"></span><iframe src="/#${hash}" tabindex="-1" title="${esc(label)}"></iframe></div>`;
const pane = (title, body, right, extra) => `<div class="pane" ${extra || ""}><div class="ph"><span>${title}</span>${right ? `<span class="r">${right}</span>` : ""}</div>${body}</div>`;
const srcURL = (h, key) => location.origin + "/" + (h ? "#" + h : "") + (key && OD.KEY ? (h ? "&" : "#") + "key=" + OD.KEY : "");
const sameState = (a, b) => a && b && a.view === b.view && JSON.stringify(a.params || {}) === JSON.stringify(b.params || {});
const matchPlayers = M => { const r = M.active; return r && r.ready ? r.t.flatMap(t => M.team(t).players) : []; };

/* ================================================================== shell */
P.init = () => {
  document.body.className = "ui";
  document.body.innerHTML = `<div class="app" id="app"><header class="sb" id="sb"></header><nav class="nav" id="nav"></nav><div id="mainwrap" class="mw"></div><aside class="ed" id="ed"></aside></div><div id="toast" class="toast" role="status"></div>`;
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("keydown", onKey);
  try { const p = localStorage.getItem("od_major_page"); if (PAGES.some(x => x[0] === p)) P.page = p; } catch (e) {}
  if (location.hash.includes("page=")) { const p = (/page=(\w+)/.exec(location.hash) || [])[1]; if (PAGES.some(x => x[0] === p)) P.page = p; }
  OD.onState(s => {
    if (s.privRev !== P.privRev) { P.privRev = s.privRev; OD.getPrivate().then(p => { P.priv = p; if (P.page === "desk" || P.page === "settings") mount(); }); }
    if (!document.getElementById("main")) mount(); else update();
  });
  setInterval(() => { if (OD.S) update(); }, 1000);
};
function go(page) { if (!PAGES.some(x => x[0] === page)) return; P.page = page; try { localStorage.setItem("od_major_page", page); } catch (e) {} mount(); }
function mount() {
  if (!OD.S || !OD.M) return;
  document.getElementById("app").className = "app" + (P.page === "settings" ? " noside" : "");
  document.getElementById("mainwrap").innerHTML = (VIEWS[P.page] || VIEWS.overview).mount(OD.S, OD.M);
  document.querySelectorAll("#mainwrap [data-h]").forEach(e => e._h = null);
  update(true);
}
function setHTML(el, h) { if (el && el._h !== h) { el.innerHTML = h; el._h = h; } }
function update(force) {
  const s = OD.S, M = OD.M; if (!s || !M) return;
  setHTML(document.getElementById("sb"), statusBar(s, M));
  setHTML(document.getElementById("nav"), navHTML(s));
  const ed = document.getElementById("ed"); ed.style.display = P.page === "settings" ? "none" : "";
  if (P.page !== "settings") setHTML(ed, editorial(s, M));
  const v = VIEWS[P.page]; if (!v || !v.live) return;
  for (const [id, fn] of Object.entries(v.live)) {
    const el = document.getElementById(id); if (!el) continue;
    if (!force && el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) continue;
    setHTML(el, fn(s, M));
  }
  if (v.tick) v.tick(s, M);
}

/* ---------------- status bar ---------------- */
function statusBar(s, M) {
  const r = M.active, src = s.sources.major, d = s.desk;
  const dataBad = !OD.online, dataWarn = src.ok === false;
  const dataTxt = dataBad ? "Server offline" : dataWarn ? `Cached · ${OD.ago(src.at)}` : `Live · ${OD.ago(src.at)}`;
  const named = (s.casters || []).filter(c => c.name).length, links = ["c1", "c2"].filter(id => P.priv && ((P.priv.casters || {})[id] || {}).vdo).length;
  const need = d.layout === "solo" ? 1 : 2;
  const camOk = d.mode === "local" ? "off" : (named >= need && (!P.priv || links >= need)) ? "" : "amb";
  const rd = M.readiness(), blocks = rd.filter(x => x.level === "block").length, warns = rd.filter(x => x.level === "warn").length;
  const air = [];
  if (s.gp.live) { const left = s.gp.live.until ? Math.max(0, Math.ceil((s.gp.live.until - OD.now()) / 1000)) + "s" : "hold"; air.push(`<span class="tag pgm">GFX · ${esc(gname(s.gp.live))} · ${left}</span>`); }
  if (s.pred.visible) air.push(`<span class="tag pgm">Predictions</span>`);
  if (s.deskShow.live !== "clean") air.push(`<span class="tag pgm">Desk · ${esc(SC.DESK_VIEWS[s.deskShow.live])}</span>`);
  if (s.deskShow.lt) air.push(`<span class="tag pgm">Lower thirds</span>`);
  if (s.sim.on) air.push(`<span class="tag amb">Simulation</span>`);
  if (P.obs && P.obs.ok && P.obs.scene) air.push(`<span class="tag">OBS · ${esc(P.obs.scene)}</span>`);
  return `<div class="brand"><img src="${esc(OD.eventLogo() || "")}" alt="OverDrive"></div>
    <button class="am" data-go="overview" title="Change the broadcast match on Overview">${r && r.ready ? `${logoImg(r.t[0])}<b>${esc(OD.tname(r.t[0]))}</b><i>VS</i><b>${esc(OD.tname(r.t[1]))}</b>${logoImg(r.t[1])}<span class="id">${esc(r.id)}</span>`
      : `<span class="kv2"><small>Broadcast match</small><span>${r ? esc(r.round) + " · teams TBD" : "None selected"}</span></span>`}</button>
    <div class="kv2"><small>Stage</small><span>${r ? esc(r.round) + " · Bo" + esc(r.bo) : "—"}</span></div>
    <div class="kv2 opt"><small>${r && (r.status === "live" || r.winner) ? "Score" : "Start"}</small><span>${r ? (r.status === "live" || r.winner ? esc(r.s1 || 0) + "–" + esc(r.s2 || 0) : esc(OD.time(r.at)) + " CET") : "—"}</span></div>
    <div class="kv2"><small>Major data</small><span><i class="dot ${dataBad ? "bad" : dataWarn ? "amb" : ""}"></i>${esc(dataTxt)}</span></div>
    <div class="kv2"><small>Cameras</small><span><i class="dot ${camOk}"></i>${d.mode === "local" ? "Local OBS" : "Integrated"} · ${d.layout === "solo" ? "Solo" : "Dual"}</span></div>
    <button class="kv2 rdy" data-go="overview"><small>Match</small><span><i class="dot ${blocks ? "bad" : warns ? "amb" : ""}"></i>${blocks ? "Not ready" : warns ? warns + " to check" : "Ready"}</span></button>
    <div class="grow air">${air.join("") || `<span class="tag">Nothing on air</span>`}</div>
    <div class="clear"><button class="btn-clear" data-act="editorial.clear" data-p="{}" title="Hide every editorial graphic, the predictions, the desk information and lower thirds">Clear graphics <kbd>Esc</kbd></button></div>`;
}
function navHTML(s) {
  return PAGES.map(([k, l, f]) => `<a class="${P.page === k ? "on" : ""}" data-go="${k}" href="#control" role="button"><span>${l}</span>${k === "gameplay" && s.gp.live ? `<span class="n">ON</span>` : k === "predictions" && s.pred.visible ? `<span class="n">ON</span>` : k === "desk" && (s.deskShow.live !== "clean" || s.deskShow.lt) ? `<span class="n">ON</span>` : `<kbd>${f}</kbd>`}</a>`).join("")
    + `<div class="sp"></div><div class="foot">${esc(location.host)}<br>${OD.online ? "connected" : "reconnecting…"}</div>`;
}

/* ---------------- editorial panel (persistent) ---------------- */
function editorial(s, M) {
  const r = M.active;
  if (!r || !r.ready) return pane("Editorial", `<div class="pb empty">Select a broadcast match on Overview.</div>`, "", `style="flex:1"`);
  const ps = matchPlayers(M); if (!P.pid || !ps.includes(P.pid)) P.pid = ps[0];
  const ptile = (pid, n) => { const p = M.player(pid), t = M.teamOfPlayer(pid);
    return `<button class="pt ${P.pid === pid ? "sel" : ""}" data-pick="${esc(pid)}" title="Select ${esc(p.name)} and preview the spotlight (key ${n + 1})">${OD.photo(pid, "", 1.5) || `<span class="phx noph"></span>`}<div><b>${esc(p.name)}</b><small>${logoImg(t.id)}${esc(OD.natCode(p.nat))}</small></div><span class="k">${n + 1}</span></button>`; };
  const sug = P.suggestions(s, M);
  const others = M.others().filter(x => x.ready && (x.status === "live" || !x.winner)).slice(0, 3).concat(M.others().filter(x => x.winner).slice(-3).reverse()).slice(0, 5);
  return pane("Players", `<div class="pb pgrid">${ps.map(ptile).join("")}</div>`, "1–4")
    + pane("Suggested", `<div class="pb tight ls">${sug.length ? sug.slice(0, 9).map(x => `<div class="li sg"><div style="min-width:0"><div class="ty">${esc(x.kind)}</div><div class="t" title="${esc(x.title)}">${esc(x.title)}</div><div class="m">${esc(x.src)} · ${esc(OD.ago(x.at))}</div></div>${btn("PVW", "gp.preview", { g: { ...x.g, dur: P.dur } }, "xs")}${btn("×", "suggest.dismiss", { id: x.id }, "xs sq", false, "Dismiss")}</div>`).join("")
      : `<div class="empty">Nothing new.${Object.keys(s.dismissed).length ? " " + btn("Restore " + Object.keys(s.dismissed).length, "suggest.restore", {}, "xs") : ""}</div>`}</div>`, `${sug.length} ready`, `style="flex:1;min-height:0"`)
    + pane("Other matches", `<div class="pb tight ls">${others.map(x => {
      const side = i => x.t[i] ? tm(x.t[i]) : `<span class="h">${esc(x.hint[i])}</span>`;
      const mid = x.winner || x.status === "live" ? `<span class="sc ${x.status === "live" ? "live" : ""}">${esc(x.s1 || 0)}–${esc(x.s2 || 0)}</span>` : `<span class="sc tmx">${esc(OD.time(x.at))}</span>`;
      const ok = SC.gfxAvailable("result", { mid: x.id });
      return `<button class="li mt ${ok ? "" : "na"}" ${ok ? `data-act="gp.preview" data-p="${J({ g: { type: "result", params: { mid: x.id }, dur: P.dur } })}" title="Preview this match update"` : "disabled"}><span class="rd">${esc(x.roundShort)}</span><span class="a ${x.winner && x.winner !== x.t[0] ? "l" : ""}">${side(0)}</span>${mid}<span class="${x.winner && x.winner !== x.t[1] ? "l" : ""}">${side(1)}</span></button>`; }).join("") || `<div class="empty">No other matches.</div>`}</div>`, "excl. " + esc(r.roundShort));
}

/* ---------------- suggestion engine (verified data only, never auto-published) ---------------- */
P.suggestions = (s, M) => {
  const out = [], seenAt = s.sources.major.at, act = M.active, actTeams = act ? act.t.filter(Boolean) : [];
  const seed = id => (M.team(id) || {}).seed;
  for (const e of s.events.slice(0, 20)) {
    const r = M.byId[e.mid]; if (!r || !r.ready || (act && r.id === act.id)) continue;
    out.push({ id: "ev:" + e.id, pri: 0, kind: e.kind === "result" ? "Result" : "Live score", title: `${OD.tname(r.t[0])} ${e.s1 || 0}–${e.s2 || 0} ${OD.tname(r.t[1])}`,
      src: e.sim ? "Simulation" : "Major sheet", at: e.at, g: { type: "result", params: { mid: r.id } } });
  }
  for (const tid of actTeams) for (const pid of M.team(tid).players) {
    const a = M.achievements(pid)[0];
    if (a) out.push({ id: "ach:" + pid + ":" + a.event, pri: 1, kind: "Player record", title: `${M.player(pid).name}: ${a.place}, ${a.event}`,
      src: a.src === "Liquipedia" ? "Liquipedia" : "Liquipedia import", at: a.src === "Liquipedia" ? "2026-11-10T12:00:00Z" : (s.lp[pid] || {}).fetchedAt, g: { type: "achievements", params: { pid } }, rel: [tid] });
  }
  for (const r of M.list) {
    if (r.winner && seed(r.winner) && seed(r.loser) && seed(r.winner) > seed(r.loser))
      out.push({ id: "upset:" + r.id, pri: 2, kind: "Upset", title: `Seed ${seed(r.winner)} ${OD.tname(r.winner)} beat seed ${seed(r.loser)} ${OD.tname(r.loser)}`, src: "Major sheet", at: seenAt, g: { type: "result", params: { mid: r.id } }, rel: r.t });
    if (r.winner && r.elimPlace)
      out.push({ id: "elim:" + r.id, pri: 2, kind: "Elimination", title: `${OD.tname(r.loser)} eliminated (${r.elimPlace})`, src: "Major sheet", at: seenAt, g: { type: "result", params: { mid: r.id } }, rel: r.t });
    if (r.ready && !r.winner && seed(r.t[0]) && seed(r.t[1]) && Math.abs(seed(r.t[0]) - seed(r.t[1])) >= 3)
      out.push({ id: "pot:" + r.id, pri: 3, kind: "Potential upset", title: `${OD.tname(r.t[0])} (${seed(r.t[0])}) vs ${OD.tname(r.t[1])} (${seed(r.t[1])})`, src: "Major sheet", at: seenAt, g: { type: "seeds", params: { mid: r.id } }, rel: r.t });
    if (r.ready && !r.winner) { const h = M.h2h(r.t[0], r.t[1]);
      if (h.length) out.push({ id: "rematch:" + r.id + ":" + h.length, pri: 2, kind: "Rematch", title: `${OD.tname(r.t[0])} and ${OD.tname(r.t[1])} meet again`, src: "Major + Wildcard sheets", at: seenAt, g: { type: "h2h", params: { mid: r.id } }, rel: r.t }); }
  }
  for (const t of Object.values(M.teams)) {
    const rec = M.record(t.id), sd = M.seeds(t.id);
    if (rec.sw >= 2 && rec.ml === 0) out.push({ id: "clean:" + t.id + ":" + rec.mw, pri: 3, kind: "Form", title: `${t.name} have not dropped a map (${rec.mw}–0)`, src: "Major sheet", at: seenAt, g: { type: "path", params: { tid: t.id } }, rel: [t.id] });
    if (sd && sd.current && sd.original && sd.original - sd.current >= 2) out.push({ id: "seed:" + t.id + ":" + sd.current, pri: 3, kind: "Seed takeover", title: `${t.name}: seed ${sd.original} → ${sd.current}`, src: "Major sheet", at: seenAt, g: { type: "team", params: { tid: t.id } }, rel: [t.id] });
  }
  for (const f of s.facts || []) if (f.subject.type !== "team" || actTeams.includes(f.subject.id))
    out.push({ id: "fact:" + f.id, pri: f.subject.type === "team" ? 1 : 4, kind: "Fact", title: f.text, src: f.source, at: f.addedAt, g: { type: "fact", params: { fid: f.id } }, rel: f.subject.type === "team" ? [f.subject.id] : [] });
  const relevant = x => x.rel && x.rel.some(t => actTeams.includes(t)) ? -1 : 0;
  return out.filter(x => !s.dismissed[x.id] && SC.gfxAvailable(x.g.type, x.g.params))
    .sort((a, b) => a.pri - b.pri || relevant(a) - relevant(b) || String(b.at || "").localeCompare(String(a.at || "")));
};

/* ================================================================== pages */
const VIEWS = {};
const OUTPUTS = [["waiting", "Breaks", "waiting"], ["desk&preview&pgm", "Desk", "desk"], ["matchup", "Matchup", "matchup"], ["player", "Player", "player"], ["bracket", "Bracket", "bracket"],
  ["predictions", "Predictions", "predictions"], ["maps", "Maps", "maps"], ["gameplay", "Gameplay", "gameplay"], ["postmatch", "Post-match", "post"]];
const outState = (k, s) => ({ waiting: s.brk.title || "No title", desk: (s.desk.layout === "solo" ? "Solo" : "Dual") + " · " + SC.DESK_VIEWS[s.deskShow.live],
  matchup: s.scenes.matchup.live.view, player: s.scenes.player.live.view, bracket: s.scenes.bracket.live.view, predictions: s.pred.visible ? "Visible" : "Hidden",
  maps: s.scenes.maps.live.view, gameplay: s.gp.live ? gname(s.gp.live) : "Transparent", post: s.scenes.post.live.view }[k]);

/* ---------------- Overview ---------------- */
VIEWS.overview = {
  mount: () => `<main class="main" id="main" style="grid-template-columns:minmax(0,1fr) 300px;grid-template-rows:auto minmax(0,1fr)">
    <div class="pane" style="grid-column:1/-1" id="ovHead"></div>
    ${pane("Outputs", `<div class="pb"><div class="mv">${OUTPUTS.map(([h, n, k]) => `<div class="mvt"><div class="mon chk" id="mvm-${k}"><iframe src="/#${h}" tabindex="-1" title="${esc(n)}"></iframe></div><div class="cap" id="mvc-${k}"></div></div>`).join("")}</div></div>`, `<span class="tag pgm">on air</span><span class="tag">standby</span>`)}
    <div class="col">${pane("Match ready", `<div class="pb tight ck" id="ovReady"></div>`, `<span id="ovReadyTag"></span>`)}${pane("Match queue", `<div class="pb tight ls" id="ovQueue"></div>`, "", `style="flex:1;min-height:0"`)}</div></main>`,
  live: {
    ovHead: (s, M) => { const r = M.active;
      if (!r) return `<div class="mh"><div class="side L"><div><div class="nm">No broadcast match</div><div class="sub">Select one in the match queue.</div></div></div></div>`;
      if (!r.ready) return `<div class="mh"><div class="side L"><div><div class="nm">${esc(r.round)}</div><div class="sub">${esc(r.hint[0])} vs ${esc(r.hint[1])}</div></div></div></div>`;
      const side = (i, R) => { const id = r.t[i], t = M.team(id), sd = M.seeds(id), rec = M.record(id);
        const sub = `Seed ${esc(r.seed[i] || sd.original)}${r.seed[i] && r.seed[i] !== sd.original ? " (orig. " + sd.original + ")" : ""} · Major ${rec.sw}–${rec.sl} · maps ${rec.mw}–${rec.ml}`;
        return `<div class="side ${R ? "R" : "L"}">${R ? "" : logoImg(id)}<div><div class="nm">${esc(t.name)}</div><div class="sub">${sub}</div></div>${R ? logoImg(id) : ""}</div>`; };
      return `<div class="mh">${side(0)}<div class="vs"><b>${esc(r.round)}</b><span>${r.status === "live" || r.winner ? `${esc(r.s1 || 0)}–${esc(r.s2 || 0)} · ${r.winner ? "final" : "live"}` : `Bo${esc(r.bo)} · ${esc(OD.day(r.at))} ${esc(OD.time(r.at))}`}</span></div>${side(1, 1)}
        <div class="rw" style="flex-direction:column;align-items:stretch">${btn("Match data", "", {}, "", false, "Scores, status overrides and simulation").replace('data-act=""', 'data-go="bracket"')}</div></div>`; },
    ovReady: (s, M) => { const rd = M.readiness(), r = M.active;
      const lv = l => rd.filter(x => x.level === l);
      if (!r) return `<div class="x"><i></i><span>No broadcast match selected</span><a></a></div>`;
      const ok = [["Teams & rosters", r.ready], ["Team logos", r.ready && r.t.every(id => M.team(id).logo)], ["Player photos", r.ready && r.t.every(id => M.team(id).players.every(p => M.photo(p)))],
        ["Verified careers", r.ready && r.t.every(id => M.team(id).players.every(p => M.vplayer(p) || M.lpRows(p).length))], ["Caster names", s.casters.filter(c => c.name).length >= (s.desk.layout === "solo" ? 1 : 2)],
        ["Predictions", r.ready && Object.values((s.pred.byMatch[r.id] || {}).picks || {}).filter(p => p.team).length >= (s.desk.layout === "solo" ? 1 : 2)], ["Live data", s.sources.major.ok !== false]];
      const fix = { "Teams & rosters": "bracket", "Team logos": "settings", "Player photos": "settings", "Verified careers": "settings", "Caster names": "desk", "Predictions": "predictions", "Live data": "settings" };
      return ok.map(([l, y]) => `<div class="${y ? "" : l === "Verified careers" || l === "Predictions" ? "n" : "w"}"><i></i><span>${l}</span>${y ? "<a></a>" : `<a data-go="${fix[l]}">Fix</a>`}</div>`).join("")
        + lv("warn").concat(lv("info")).filter(x => !/logo|photo|career|Caster|Predictions|Major sheet/i.test(x.text)).map(x => `<div class="n"><i></i><span>${esc(x.text)}</span><a data-go="${esc(x.where === "match" ? "bracket" : x.where)}">Open</a></div>`).join(""); },
    ovQueue: (s, M) => { const q = M.list.filter(x => !x.winner).concat(M.list.filter(x => x.winner).slice(-3).reverse());
      return q.map(x => { const on = M.active && x.id === M.active.id;
        return `<div class="li q ${on ? "on" : ""}"><div style="min-width:0"><div class="m" style="margin:0 0 3px">${esc(x.roundShort)} · ${x.winner ? "Final" : x.status === "live" ? "Live" : esc(OD.time(x.at))}</div>
          <div class="qt">${[0, 1].map(i => x.t[i] ? `<div>${tm(x.t[i])}${x.winner || x.status === "live" ? `<b>${esc(i ? x.s2 : x.s1)}</b>` : ""}</div>` : `<div class="h">${esc(x.hint[i])}</div>`).join("")}</div></div>
          ${on ? `<span class="tag pgm">On air</span>` : btn("Select", "active.set", { id: x.id }, "xs")}</div>`; }).join(""); }
  },
  tick: (s, M) => {
    // multiview thumbnails keep their background still: nine looping videos would cost CPU on the producer PC
    document.querySelectorAll(".mv iframe").forEach(f => { try { f.contentDocument.querySelectorAll("video").forEach(v => { if (!v.paused) v.pause(); }); } catch (e) {} });
    const r = M.readiness(), n = r.filter(x => x.level === "block" || x.level === "warn").length;
    setHTML(document.getElementById("ovReadyTag"), n ? `<span class="tag amb">${n} to check</span>` : `<span class="tag pvw">Ready</span>`);
    for (const [, n2, k] of OUTPUTS) {
      const live = (k === "gameplay" && s.gp.live) || (k === "predictions" && s.pred.visible) || (k === "desk" && (s.deskShow.live !== "clean" || s.deskShow.lt));
      const m = document.getElementById("mvm-" + k); if (m) m.classList.toggle("pgm", !!live);
      setHTML(document.getElementById("mvc-" + k), `<i class="dot ${live ? "bad" : "off"}"></i><span>${esc(n2)}</span><em>${esc(outState(k, s))}</em>`);
    }
  }
};

/* ---------------- Gameplay ---------------- */
VIEWS.gameplay = {
  mount: () => `<main class="main" id="main" style="grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)">
    ${pane("Preview", `<div class="pb">${mon("gameplay&preview", "PVW", "pvw", "gpPvR")}</div>`, `<span id="gpPvT"></span>`)}
    <div class="col">${pane("Program", `<div class="pb">${mon("gameplay", "PGM", "pgm", "gpPgR")}</div>`, `<span id="gpPgT"></span>`)}
      <div class="pane"><div class="pb grp" id="gpTr"></div></div></div>
    <div class="pane" style="grid-column:1/-1;min-height:0"><div class="ph"><span>Graphics</span><span class="r">click = preview · Space = show · Esc = clear · 1–4 = player</span></div>
      <div class="pb"><div class="bank" id="gpBank"></div><div class="hr" style="margin:12px 0 10px"></div>
      <div class="cm"><span class="gl">Custom message</span><input class="in" id="cuKick" placeholder="Kicker" maxlength="30"><input class="in" id="cuTitle" placeholder="Title" maxlength="30"><input class="in" id="cuText" style="flex:1" placeholder="Message" maxlength="200"><button class="b" data-custom>Preview</button></div></div></div>
  </main>`,
  live: {
    gpTr: s => { const pv = s.gp.preview, lv = s.gp.live, p = s.gp.pos;
      const cell = k => k ? `<i class="${p.preset === k ? "on" : ""}" data-pos="${k}" title="${k}"></i>` : `<i class="x"></i>`;
      return `<div class="transport"><div class="cur"><span class="gl">Next</span><span class="t">${pv ? esc(gname(pv)) : "—"}</span></div>
          <button class="b take" data-take ${pv && SC.gfxHTML(pv) ? "" : "disabled"}>Show <kbd>Space</kbd></button>${btn("Hide", "gp.hide", {}, "hide", !lv)}</div>
        <div class="hr"></div>
        <div class="rw" style="justify-content:space-between;align-items:flex-start"><div class="grp"><span class="gl">Duration</span><div class="dur">${[5, 8, 10, 15, 20].map(n => `<button class="b ${P.dur === n ? "on" : ""}" data-dur="${n}">${n}s</button>`).join("")}<button class="b ${P.dur === 0 ? "on" : ""}" data-dur="0">Hold</button></div></div>
          <div class="grp"><span class="gl">Position</span><div class="rw" style="gap:8px;align-items:flex-start"><div class="pos">${["tl", null, "tr", "ml", null, null, "bl", "bc", "br"].map(cell).join("")}</div>
            <div class="grp" style="gap:3px"><div class="rw">${btn("←", "gp.pos", { pos: { ...p, dx: p.dx - 20 } }, "xs sq")}${btn("→", "gp.pos", { pos: { ...p, dx: p.dx + 20 } }, "xs sq")}${btn("↑", "gp.pos", { pos: { ...p, dy: p.dy - 20 } }, "xs sq")}${btn("↓", "gp.pos", { pos: { ...p, dy: p.dy + 20 } }, "xs sq")}</div>
            <div class="rw">${btn("−", "gp.pos", { pos: p, scale: Math.round((s.gp.scale - .1) * 10) / 10 }, "xs sq")}<span class="mono-s">${Math.round(s.gp.scale * 100)}%</span>${btn("+", "gp.pos", { pos: p, scale: Math.round((s.gp.scale + .1) * 10) / 10 }, "xs sq")}${btn("Reset", "gp.pos", { pos: { preset: p.preset, dx: 0, dy: 0 }, scale: 1 }, "xs")}</div></div></div></div></div>`; },
    gpBank: (s, M) => { const r = M.active; if (!r || !r.ready) return `<div class="empty">Select a broadcast match with both teams known.</div>`;
      const pv = s.gp.preview, pid = P.pid, ps = matchPlayers(M);
      const gb = (label, t, p, k) => { const ok = SC.gfxAvailable(t, p), sel = pv && pv.type === t && JSON.stringify(pv.params || {}) === JSON.stringify(p);
        return `<button class="b ${sel ? "sel" : ""}" ${ok ? `data-act="gp.preview" data-p="${J({ g: { type: t, params: p, dur: P.dur } })}"` : "disabled title=\"No verified data for this\""}>${label}${k ? `<kbd class="kb">${k}</kbd>` : ""}</button>`; };
      const opp = pid ? ps.find(x => M.teamOfPlayer(x).id !== M.teamOfPlayer(pid).id && M.team(M.teamOfPlayer(x).id).players.indexOf(x) === M.teamOfPlayer(pid).players.indexOf(pid)) : null;
      return `<div class="grp"><div class="gl">Player · ${pid ? esc(M.player(pid).name) : "select 1–4"}</div>${gb("Spotlight", "player", { pid }, "Q")}${gb("Achievements", "achievements", { pid }, "W")}${gb("Recent results", "career", { pid }, "E")}${opp ? gb("Compare with " + esc(M.player(opp).name), "compare", { a: pid, b: opp }, "R") : ""}</div>
        <div class="grp"><div class="gl">Teams</div>${r.t.map(id => `<div class="rw nw">${gb(`${logoImg(id)}Stats`, "team", { tid: id })}${gb("Road so far", "path", { tid: id })}</div>`).join("")}${gb("Seed takeover", "seeds", { mid: r.id })}${gb("What's at stake", "stakes", { mid: r.id })}</div>
        <div class="grp"><div class="gl">Tournament</div>${gb("Other matches", "others", {}, "A")}${gb("Latest results", "recent", {}, "S")}${gb("Coming up", "upcoming", {}, "D")}${gb("Head to head", "h2h", { mid: r.id }, "F")}</div>
        <div class="grp"><div class="gl">Map</div><div class="maps2">${M.maps().map(m => { const sel = pv && pv.type === "map" && pv.params.id === m.id;
          return `<button class="mapb ${sel ? "sel" : ""}" style="${m.photo ? `background-image:url('${esc(m.photo)}')` : ""}" data-act="gp.preview" data-p="${J({ g: { type: "map", params: { id: m.id }, dur: P.dur } })}"><span>${esc(m.name)}</span></button>`; }).join("")}</div></div>`; }
  },
  tick: s => {
    const pv = s.gp.preview, lv = s.gp.live;
    setHTML(document.getElementById("gpPvT"), pv ? esc(gname(pv)) : "empty");
    setHTML(document.getElementById("gpPgT"), lv ? `<span class="tag pgm">On air</span>` : `<span class="tag">Transparent</span>`);
    const r = document.getElementById("gpPgR"); if (r) r.textContent = lv ? (lv.until ? Math.max(0, Math.ceil((lv.until - OD.now()) / 1000)) + " s left" : "hold") : "";
    const q = document.getElementById("gpPvR"); if (q) q.textContent = "HUD safe zones shown";
  }
};

/* ---------------- Matchup (full-screen sources) ---------------- */
const FS = {
  matchup: { name: "Matchup", hash: "matchup", views: r => { if (!r || !r.ready) return []; const av = SC.matchupViews(r);
    return [["versus", "Versus"], ["intro0", OD.tname(r.t[0]) + " intro"], ["intro1", OD.tname(r.t[1]) + " intro"], ["h2h", "Head to head"], ["path", "Road so far"], ["stakes", "What's at stake"]].map(([v, l]) => ({ view: v, label: l, ok: av.includes(v) })); } },
  player: { name: "Player", hash: "player", views: (r, M) => { if (!r || !r.ready) return []; const ps = matchPlayers(M);
    const out = ps.map(pid => ({ view: "profile", params: { pid }, label: M.player(pid).name, ok: true, pid }));
    if (ps.length === 4) out.push({ view: "compare", params: { a: ps[0], b: ps[2] }, label: `${M.player(ps[0]).name} vs ${M.player(ps[2]).name}`, ok: true }, { view: "compare", params: { a: ps[1], b: ps[3] }, label: `${M.player(ps[1]).name} vs ${M.player(ps[3]).name}`, ok: true });
    return out; } },
  maps: { name: "Maps", hash: "maps", views: (r, M) => [{ view: "pool", params: { current: P.curMap || null }, label: "Map pool", ok: M.maps().length > 0 }].concat(M.maps().map(m => ({ view: "map", params: { id: m.id }, label: m.name, ok: true, img: m.photo }))) },
  post: { name: "Post-match", hash: "postmatch", views: (r, M) => { if (!r || !r.ready) return [];
    return [{ view: "result", label: "Final result", ok: !!r.winner }].concat(matchPlayers(M).map(pid => ({ view: "mvp", params: { pid }, label: "MVP · " + M.player(pid).name, ok: true, pid }))); } }
};
VIEWS.matchup = {
  mount: () => { const f = FS[P.fs];
    return `<main class="main" id="main" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr)">
      <div class="pane" style="grid-column:1/-1"><div class="pb rw" style="justify-content:space-between"><div class="seg">${Object.entries(FS).map(([k, x]) => `<button class="b ${P.fs === k ? "on" : ""}" data-fs="${k}">${x.name}</button>`).join("")}</div><div class="rw" id="fsOnAir"></div></div></div>
      ${pane("Preview · " + f.name, `<div class="pb">${mon(f.hash + "&preview", "PVW", "pvw")}</div>`, `<span id="fsPvT"></span>`)}
      ${pane("Program · " + f.name, `<div class="pb">${mon(f.hash, "PGM", "pgm")}</div>`, `<span id="fsPgT"></span>`)}
      <div class="pane" style="grid-column:1/-1;min-height:0"><div class="pb" id="fsCtl"></div></div></main>`; },
  live: {
    fsCtl: (s, M) => { const k = P.fs, f = FS[k], sc = s.scenes[k], vs = f.views(M.active, M), pv = vs.find(v => sameState(v, sc.preview));
      const sb = v => `<button class="b big2 ${sameState(v, sc.preview) ? "sel" : ""} ${sameState(v, sc.live) ? "live" : ""}" ${v.ok ? `data-act="scene.set" data-p="${J({ scene: k, slot: "preview", view: v.view, params: v.params || {} })}"` : "disabled title=\"No verified data for this yet\""}>${v.pid ? (OD.photo(v.pid, "", 1.5) || "") : v.img ? `<span class="thumb" style="background-image:url('${esc(v.img)}')"></span>` : ""}<span>${esc(v.label)}</span></button>`;
      return `<div class="fsrow"><div class="states">${vs.length ? vs.map(sb).join("") : `<div class="empty">Select a broadcast match with both teams known.</div>`}</div>
        <div class="fsact"><button class="b take" data-act="scene.take" data-p="${J({ scene: k })}" ${!pv || !pv.ok || sameState(sc.preview, sc.live) ? "disabled" : ""}>Take</button>
          ${sw("Background", sc.bg, `data-scenebg="${k}"`)}
          ${k === "maps" ? `<div class="field"><label>Now playing</label><select class="in" data-curmap>${["", ...M.maps().map(m => m.id)].map(id => `<option value="${id}"${(P.curMap || "") === id ? " selected" : ""}>${id ? esc((M.maps().find(m => m.id === id) || {}).name) : "None"}</option>`).join("")}</select></div>` : ""}</div></div>`; },
    fsOnAir: (s, M) => Object.entries(FS).map(([k, f]) => { const v = f.views(M.active, M).find(x => sameState(x, s.scenes[k].live)); return `<span class="tag">${esc(f.name)}: ${esc(v ? v.label : s.scenes[k].live.view)}</span>`; }).join("")
  },
  tick: (s, M) => { const k = P.fs, f = FS[k], vs = f.views(M.active, M), sc = s.scenes[k];
    const lbl = st => { const v = vs.find(x => sameState(x, st)); return v ? v.label : st.view; };
    setHTML(document.getElementById("fsPvT"), esc(lbl(sc.preview))); setHTML(document.getElementById("fsPgT"), `<span class="tag pgm">${esc(lbl(sc.live))}</span>`); }
};

/* ---------------- Caster Desk ---------------- */
// Two sub-views: "Show" (what's on air: state, Take/Hide, predictions) and "Cameras" (names, links, framing: set-up).
const deskPicks = (s, M, r, compact) => { const picks = (s.pred.byMatch[r.id] || {}).picks || {}, need = Math.ceil((+r.bo || 5) / 2);
  const cs = s.casters.filter(c => c.name);
  if (!cs.length) return `<span class="empty">Add caster names under Cameras.</span>`;
  return cs.map(c => { const p = picks[c.id] || {}, i = p.team ? r.t.indexOf(p.team) : -1;
    const mine = i < 0 || p.s1 == null ? null : i ? p.s2 : p.s1, theirs = i < 0 || p.s1 == null ? null : i ? p.s1 : p.s2;
    const scores = Array.from({ length: need }, (_, k) => [need, k]).map(([w, l]) => btn(`${w}–${l}`, "pred.set", { matchId: r.id, caster: c.id, s1: i ? l : w, s2: i ? w : l }, "xs2" + (mine === w && theirs === l ? " sel" : ""), i < 0));
    return `<div class="pk dk"><b title="${esc(c.name)}">${esc(c.name)}</b>${r.t.map(id => btn(`${logoImg(id)}${esc(compact ? M.team(id).short : OD.tname(id))}`, "pred.set", { matchId: r.id, caster: c.id, team: id }, p.team === id ? "sel" : "")).join("")}
      <span class="sco">${scores.join("")}${btn("No score", "pred.set", { matchId: r.id, caster: c.id, s1: "", s2: "" }, "xs2" + (i >= 0 && p.s1 == null ? " sel" : ""), i < 0)}</span>${p.revealed ? `<span class="tag pgm">revealed</span>` : p.team ? `<span class="tag">sealed</span>` : ""}</div>`; }).join(""); };
VIEWS.desk = {
  mount: s => { const tab = P.deskTab || "show";
    const sub = `<div class="pane" style="grid-column:1/-1"><div class="pb rw" style="justify-content:space-between"><div class="seg"><button class="b ${tab === "show" ? "on" : ""}" data-desktab="show">Show</button><button class="b ${tab === "cams" ? "on" : ""}" data-desktab="cams">Cameras &amp; names</button></div><div class="rw" id="dkAir"></div></div></div>`;
    if (tab === "cams") return `<main class="main" id="main" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);grid-template-rows:auto auto auto;align-content:start">${sub}
      ${pane("Desk output", `<div class="pb">${mon("desk&preview&pgm", "PGM", "pgm", "dkR")}</div>`, `<span id="dkT"></span>`)}
      ${pane("Layout", `<div class="pb grp" style="gap:10px" id="dkLay"></div>`)}
      <div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px">${["c1", "c2"].map((id, n) => camForm(s, id, n)).join("")}</div></main>`;
    return `<main class="main" id="main" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr)">${sub}
      ${pane("Preview · desk", `<div class="pb">${mon("desk&preview", "PVW", "pvw")}</div>`, `<span id="dkPvT"></span>`)}
      ${pane("Program · desk", `<div class="pb">${mon("desk&preview&pgm", "PGM", "pgm", "dkR")}</div>`, `<span id="dkT"></span>`)}
      <div class="pane"><div class="pb" id="dkStates"></div></div>
      <div class="pane" style="min-height:0"><div class="pb grp" id="dkSide" style="gap:8px;overflow:auto"></div></div></main>`; },
  live: {
    dkAir: s => `<span class="tag ${s.deskShow.live !== "clean" ? "pgm" : ""}">On air: ${esc(SC.DESK_VIEWS[s.deskShow.live])}</span>${s.deskShow.lt ? `<span class="tag pgm">Lower thirds</span>` : ""}`,
    dkStates: (s, M) => { const ds = s.deskShow;
      const sb = (v, k) => { const ok = SC.deskViewOk(v, s);
        return `<button class="b big2 ${ds.preview === v ? "sel" : ""} ${ds.live === v ? "live" : ""}" ${ok ? `data-act="desk.preview" data-p="${J({ view: v })}"` : `disabled title="${v === "pred" ? "No picks saved for the broadcast match" : "Select a broadcast match with both teams known"}"`}><span>${esc(SC.DESK_VIEWS[v])}</span><kbd>${k}</kbd></button>`; };
      return `<div class="fsrow"><div class="states">${["clean", "upcoming", "stats", "others", "pred"].map((v, i) => sb(v, "Shift+" + (i + 1))).join("")}</div>
        <div class="fsact"><button class="b take" data-act="desk.take" data-p="{}" ${ds.preview === ds.live || !SC.deskViewOk(ds.preview, s) ? "disabled" : ""}>Take</button>${btn("Hide", "desk.hide", {}, "hide", ds.live === "clean")}
        ${sw("Lower thirds", ds.lt, `data-act="desk.lt" data-p="${J({ on: !ds.lt })}"`)}</div></div>
        <div class="m" style="margin-top:8px;color:var(--faint);font-size:11px;font-weight:600">${ds.preview === "pred" ? "Taking Predictions reveals every saved pick for this match." : "Information follows the broadcast match automatically; nothing changes on air without Take."}</div>`; },
    dkSide: (s, M) => { const d = s.desk, cams = ["c1", "c2"].map(id => s.casters.find(c => c.id === id) || { id }), r = M.active;
      return `<div class="rw" style="gap:12px"><div class="grp"><span class="gl">Shot</span><div class="seg">${btn("Solo · " + esc(cams[0].name || "Cam 1"), "desk.set", { layout: "solo", solo: "c1" }, d.layout === "solo" && d.solo === "c1" ? "on" : "")}${btn("Solo · " + esc(cams[1].name || "Cam 2"), "desk.set", { layout: "solo", solo: "c2" }, d.layout === "solo" && d.solo === "c2" ? "on" : "")}${btn("Dual", "desk.set", { layout: "duo" }, d.layout === "duo" ? "on" : "")}</div></div>
        <div class="grp"><span class="gl">Visible</span><div class="rw">${sw("Background", d.bg, `data-desk="bg"`)}${sw("Cameras", d.cams, `data-desk="cams"`, d.mode === "local")}${sw("Names", d.plates, `data-desk="plates"`)}${sw("Match strip", d.decor, `data-desk="decor"`)}</div></div></div>
        <div class="hr"></div><div class="grp"><span class="gl">Predictions · ${r && r.ready ? esc(r.roundShort) + " · " + esc(OD.tname(r.t[0])) + " vs " + esc(OD.tname(r.t[1])) : "no broadcast match"}</span>${r && r.ready ? deskPicks(s, M, r, true) : ""}</div>`; },
    dkLay: (s, M) => { const d = s.desk, cams = ["c1", "c2"].map(id => s.casters.find(c => c.id === id) || { id }), L = SC.DESK[d.layout] || SC.DESK.duo;
      return `<div class="grp"><span class="gl">Shot</span><div class="seg">${btn("Solo · " + esc(cams[0].name || "Cam 1"), "desk.set", { layout: "solo", solo: "c1" }, d.layout === "solo" && d.solo === "c1" ? "on" : "")}${btn("Solo · " + esc(cams[1].name || "Cam 2"), "desk.set", { layout: "solo", solo: "c2" }, d.layout === "solo" && d.solo === "c2" ? "on" : "")}${btn("Dual", "desk.set", { layout: "duo" }, d.layout === "duo" ? "on" : "")}</div></div>
        <div class="grp"><span class="gl">Camera source</span><div class="seg">${btn("Integrated (VDO.Ninja)", "desk.set", { mode: "integrated" }, d.mode !== "local" ? "on" : "")}${btn("Local OBS", "desk.set", { mode: "local" }, d.mode === "local" ? "on" : "")}</div></div>
        <div class="grp"><span class="gl">Visible</span><div class="rw">${sw("Background", d.bg, `data-desk="bg"`)}${sw("Integrated cameras", d.cams, `data-desk="cams"`, d.mode === "local")}${sw("Names", d.plates, `data-desk="plates"`)}${sw("Frames", d.frames && !d.bg, `data-desk="frames"`, d.bg)}${sw("Match strip", d.decor, `data-desk="decor"`)}</div></div>
        ${d.mode === "local" ? `<div class="hr"></div><div class="grp"><span class="gl">OBS camera placement · same in every desk state</span>${L.slots.map((sl, i) => `<div class="mono-s">Cam ${i + 1} · 1080p x ${sl.x} y ${sl.y} ${sl.w}×${sl.h} · 4K x ${sl.x * 2} y ${sl.y * 2} ${sl.w * 2}×${sl.h * 2}</div>`).join("")}</div>` : `<div class="m" style="color:var(--faint);font-size:11px;font-weight:600">Both cameras stay connected; solo ↔ dual and every desk state only move or overlay them.</div>`}`; }
  },
  tick: s => { const d = s.desk; setHTML(document.getElementById("dkT"), `<span class="tag ${s.deskShow.live !== "clean" ? "pgm" : ""}">${esc(SC.DESK_VIEWS[s.deskShow.live])}</span>`);
    setHTML(document.getElementById("dkPvT"), esc(SC.DESK_VIEWS[s.deskShow.preview]));
    const r = document.getElementById("dkR"); if (r) r.textContent = "cameras not loaded in monitors";
    for (const id of ["c1", "c2"]) { const el = document.getElementById("shot-" + id); if (!el) continue; const inShot = d.layout === "duo" || d.solo === id;
      setHTML(el, inShot ? `<span class="tag pgm">in shot</span>` : `<span class="tag">parked</span>`); } }
};
function camForm(s, id, n) {
  const c = s.casters.find(x => x.id === id) || { id, crop: {} }, priv = (P.priv && P.priv.casters) || {};
  const has = !!((priv[id] || {}).vdo);
  return `<div class="cam" data-cid="${id}"><div class="sl"><span class="gl">Cam</span><b>${n + 1}</b><span id="shot-${id}"></span></div>
    <div class="fs"><div class="field"><label>Caster</label><input class="in" data-f="name" value="${esc(c.name || "")}" placeholder="Name"></div>
      <div class="field"><label>Role</label><input class="in" data-f="role" value="${esc(c.role || "")}" placeholder="Optional"></div>
      <div class="field"><label>Handle</label><input class="in" data-f="handle" value="${esc(c.handle || "")}" placeholder="Optional"></div>
      <div class="field"><label>Framing X · Y · Zoom</label><div class="crop"><input class="in" data-f="x" type="number" value="${esc((c.crop || {}).x || 0)}"><input class="in" data-f="y" type="number" value="${esc((c.crop || {}).y || 0)}"><input class="in" data-f="zoom" type="number" step=".05" min="1" max="4" value="${esc((c.crop || {}).zoom || 1)}"></div></div>
      <div class="field w2"><label>VDO.Ninja view link ${P.priv ? `<span style="color:${has ? "var(--pvw)" : "var(--amb)"};letter-spacing:0">· ${has ? "stored privately" : "not set"}</span>` : `<span style="color:var(--amb);letter-spacing:0">· open this page on the server PC to edit</span>`}</label>
        <input class="in mono" data-f="vdo" value="${esc((priv[id] || {}).vdo || "")}" placeholder="https://vdo.ninja/?view=…&amp;cleanoutput"${P.priv ? "" : " disabled"}></div>
      <div class="rw w2">${`<button class="b" data-savecaster>Save camera ${n + 1}</button>`}${btn("Clear", "caster.clear", { id }, "")}</div></div></div>`;
}

/* ---------------- Predictions ---------------- */
VIEWS.predictions = {
  mount: () => `<main class="main" id="main" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)">
    ${pane("Preview", `<div class="pb">${mon("predictions&preview", "PVW", "pvw")}</div>`, "sealed picks shown dashed")}
    ${pane("Program", `<div class="pb">${mon("predictions", "PGM", "pgm")}</div>`, `<span id="prT"></span>`)}
    ${pane("Picks", `<div class="pb grp" id="prCtl"></div>`)}
    ${pane("History", `<div class="pb tight" id="prHist"></div>`, "", `style="min-height:0"`)}</main>`,
  live: {
    prCtl: (s, M) => { const mid = P.predMatch || s.active, r = M.byId[mid];
      const pick = `<select class="in" data-predmatch>${M.list.filter(x => x.ready).map(x => `<option value="${esc(x.id)}"${x.id === mid ? " selected" : ""}>${esc(x.roundShort)} · ${esc(OD.tname(x.t[0]))} vs ${esc(OD.tname(x.t[1]))}</option>`).join("")}</select>`;
      if (!r || !r.ready) return `<div class="field"><label>Match</label>${pick}</div><div class="empty">Pick a match with both teams known.</div>`;
      const cs = s.casters.filter(c => c.name); const picks = (s.pred.byMatch[mid] || {}).picks || {};
      return `<div class="field"><label>Match ${mid === s.active ? "· broadcast match" : ""}</label>${pick}</div>
        ${cs.length ? cs.map(c => { const p = picks[c.id] || {};
          return `<div class="pk wide"><b>${esc(c.name)}</b>${r.t.map(id => btn(`${logoImg(id)}${esc(OD.tname(id))}`, "pred.set", { matchId: mid, caster: c.id, team: id }, p.team === id ? "sel" : "")).join("")}${btn(p.revealed ? "Revealed" : "Reveal", "pred.reveal", { matchId: mid, caster: c.id }, p.revealed ? "on" : "", !p.team || p.revealed)}</div>`; }).join("") : `<div class="empty">Add caster names on Caster Desk.</div>`}
        ${cs.length ? `<div class="grp"><span class="gl">Predicted score (optional)</span>${deskPicks(s, M, r, false)}</div>` : ""}
        <div class="hr"></div><div class="rw">${btn("Reveal all", "pred.reveal", { matchId: mid, caster: "*" })}<button class="b ${s.pred.visible ? "on" : ""}" data-act="pred.show" data-p="${J({ on: !s.pred.visible, matchId: mid })}">${s.pred.visible ? "Hide graphic" : "Show graphic"}</button>${btn("Reset reveals", "pred.reset", { matchId: mid })}${btn("Delete picks", "pred.reset", { matchId: mid, hard: true })}</div>`; },
    prHist: (s, M) => { const acc = {}, rows = [];
      for (const [mid, m] of Object.entries(s.pred.byMatch)) { const r = M.byId[mid]; if (!r) continue;
        for (const [cid, p] of Object.entries(m.picks)) { if (!p.team) continue; const c = s.casters.find(x => x.id === cid), name = c && c.name ? c.name : cid;
          let res = "pending"; if (r.winner) { res = p.team === r.winner ? "correct" : "wrong"; const a = acc[name] = acc[name] || { n: 0, ok: 0 }; a.n++; if (res === "correct") a.ok++; }
          rows.push(`<tr><td>${esc(r.roundShort)}</td><td>${esc(name)}</td><td>${tm(p.team)}</td><td class="r-${res}">${res}</td></tr>`); } }
      if (!rows.length) return `<div class="empty">No predictions saved yet.</div>`;
      return `<div class="rw" style="padding:8px 10px">${Object.entries(acc).map(([n, a]) => `<span class="tag">${esc(n)} ${a.ok}/${a.n}</span>`).join("")}</div><table class="tbl">${rows.join("")}</table>`; }
  },
  tick: s => setHTML(document.getElementById("prT"), s.pred.visible ? `<span class="tag pgm">Visible</span>` : `<span class="tag">Hidden</span>`)
};

/* ---------------- Breaks ---------------- */
VIEWS.breaks = {
  mount: () => `<main class="main" id="main" style="grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)">
    ${pane("Break screen", `<div class="pb">${mon("waiting", "PGM", "pgm")}</div>`, `<span id="bkT"></span>`)}
    ${pane("Title & countdowns", `<div class="pb grp" style="gap:10px" id="bkCtl"></div>`, "", `style="grid-row:span 2"`)}
    ${pane("Rotation", `<div class="pb grp" id="bkRot"></div>`)}</main>`,
  live: {
    bkCtl: s => { const b = s.brk, now = OD.now();
      return `<div class="grp"><span class="gl">Title</span><div class="seg">${["Starting soon", "Be right back", "Thanks for watching", ""].map(t => btn(t || "None", "brk.set", { title: t }, b.title === t ? "on" : "")).join("")}</div></div>
        <div class="grp"><span class="gl">Break countdown <span class="mono-s" style="color:var(--tx)">${b.breakAt && b.breakAt > now ? esc(OD.countdown(b.breakAt - now)) : "off"}</span></span>
          <div class="rw">${[1, 2, 3, 5, 10, 15, 20, 30].map(m => btn(m + "m", "brk.set", { breakAt: now + m * 60000 }, "xs2")).join("")}</div>
          <div class="rw">${btn("−1m", "brk.set", { breakAt: b.breakAt ? Math.max(now, b.breakAt - 60000) : null }, "xs2", !b.breakAt)}${btn("+1m", "brk.set", { breakAt: b.breakAt ? b.breakAt + 60000 : null }, "xs2", !b.breakAt)}${btn("Stop", "brk.set", { breakAt: null }, "xs2", !b.breakAt)}</div></div>
        <div class="grp"><span class="gl">Next-match countdown <span class="mono-s" style="color:var(--tx)">${b.nextAt ? esc(OD.countdown(b.nextAt - now) || "0:00") + " manual" : "schedule"}</span></span>
          <div class="rw">${[5, 10, 15, 20, 30].map(m => btn(m + "m", "brk.set", { nextAt: now + m * 60000 }, "xs2")).join("")}</div>
          <div class="rw">${btn("−1m", "brk.set", { nextAt: b.nextAt ? b.nextAt - 60000 : null }, "xs2", !b.nextAt)}${btn("+1m", "brk.set", { nextAt: b.nextAt ? b.nextAt + 60000 : null }, "xs2", !b.nextAt)}${btn("Use schedule", "brk.set", { nextAt: null }, b.nextAt ? "xs2" : "xs2 on")}</div></div>
        <div class="grp"><span class="gl">Background</span><div class="rw">${sw("Loop video", b.bg, `data-brkbg`)}</div></div>`; },
    bkRot: s => { const b = s.brk;
      return `<div class="rw">${[["next", "Next matchup"], ["bracket", "Road to final"], ["upcoming", "Upcoming"], ["live", "Live matches"], ["results", "Results"], ["facts", "Facts"]].map(([k, l]) => sw(l, b.panels[k], `data-panel="${k}"`)).join("")}</div>
        <div class="rw"><span class="gl">Each panel</span>${[8, 12, 20].map(n => btn(n + "s", "brk.set", { rotateSec: n }, b.rotateSec === n ? "xs2 on" : "xs2")).join("")}</div>`; }
  },
  tick: s => setHTML(document.getElementById("bkT"), esc(s.brk.title || "No title"))
};

/* ---------------- Bracket (+ match data) ---------------- */
VIEWS.bracket = {
  mount: () => `<main class="main" id="main" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)">
    ${pane("Preview · Bracket", `<div class="pb">${mon("bracket&preview", "PVW", "pvw")}</div>`, `<span id="brPvT"></span>`)}
    ${pane("Program · Bracket", `<div class="pb">${mon("bracket", "PGM", "pgm")}</div>`, `<span id="brPgT"></span>`)}
    <div class="col">${pane("Bracket source", `<div class="pb grp" id="brCtl"></div>`)}</div>
    ${pane("Match data", `<div class="pb tight" id="brData" style="overflow:auto"></div>`, "overrides beat the sheet until cleared", `style="min-height:0"`)}</main>`,
  live: {
    brCtl: s => { const sc = s.scenes.bracket, o = s.bracketOpts;
      const st = (v, l) => `<button class="b big2 ${sameState({ view: v, params: {} }, sc.preview) ? "sel" : ""} ${sameState({ view: v, params: {} }, sc.live) ? "live" : ""}" data-act="scene.set" data-p="${J({ scene: "bracket", slot: "preview", view: v, params: {} })}"><span>${l}</span></button>`;
      return `<div class="fsrow"><div class="states">${st("bracket", "Bracket")}${st("schedule", "Matches")}</div><div class="fsact">${btn("Take", "scene.take", { scene: "bracket" }, "take", sameState(sc.preview, sc.live))}${sw("Background", sc.bg, `data-scenebg="bracket"`)}</div></div>
        <div class="hr"></div><div class="grp"><span class="gl">Overlay</span><div class="rw">${sw("Header", o.title, `data-bo="title"`)}${sw("Times", o.times, `data-bo="times"`)}${sw("Seeds", o.seeds, `data-bo="seeds"`)}</div>
        <div class="rw"><span class="gl" style="width:90px">Box opacity</span><input type="range" min="40" max="100" value="${esc(o.opacity)}" data-bor="opacity" style="flex:1;accent-color:var(--ac)"></div></div>`; },
    brData: (s, M) => `<table class="tbl md"><thead><tr><th>Match</th><th>Teams</th><th>Status</th><th>Score</th><th></th></tr></thead><tbody>${M.list.map(r => { const o = (s.overrides.matches || {})[r.id] || {};
      return `<tr class="${M.active && M.active.id === r.id ? "on" : ""}"><td><b>${esc(r.roundShort)}</b><div class="m">${esc(r.id)} · ${esc(OD.time(r.at))}</div></td>
        <td>${r.t[0] ? tm(r.t[0]) : `<span class="h">${esc(r.hint[0])}</span>`}<br>${r.t[1] ? tm(r.t[1]) : `<span class="h">${esc(r.hint[1])}</span>`}</td>
        <td><select class="in" data-ov="${esc(r.id)}" data-k="status">${["", "upcoming", "live", "completed"].map(v => `<option value="${v}"${(o.status || "") === v ? " selected" : ""}>${v || "auto · " + r.status}</option>`).join("")}</select></td>
        <td class="nw"><input class="in sc2" data-ov="${esc(r.id)}" data-k="s1" value="${esc(o.s1 !== undefined ? o.s1 : r.s1)}" aria-label="Score 1"> <input class="in sc2" data-ov="${esc(r.id)}" data-k="s2" value="${esc(o.s2 !== undefined ? o.s2 : r.s2)}" aria-label="Score 2"></td>
        <td class="nw">${r.overridden ? btn("Clear", "override.clear", { id: r.id }, "xs") : ""}${s.sim.on && r.ready && !r.winner ? btn("+1 " + esc(M.team(r.t[0]).short), "sim.score", { id: r.id, side: 1, t1: r.t[0], t2: r.t[1] }, "xs sim") + btn("+1 " + esc(M.team(r.t[1]).short), "sim.score", { id: r.id, side: 2, t1: r.t[0], t2: r.t[1] }, "xs sim") : ""}</td></tr>`; }).join("")}</tbody></table>`
  },
  tick: s => { const lbl = st => st.view === "schedule" ? "Matches" : "Bracket";
    setHTML(document.getElementById("brPvT"), lbl(s.scenes.bracket.preview)); setHTML(document.getElementById("brPgT"), `<span class="tag pgm">${lbl(s.scenes.bracket.live)}</span>`); }
};

/* ---------------- Settings ---------------- */
const SOURCES = [["waiting", "Starting soon / BRB / Ending"], ["desk", "Caster desk", true], ["matchup", "Matchup / team introduction"], ["player", "Player information"],
  ["bracket", "Bracket / tournament overview"], ["predictions", "Caster predictions"], ["maps", "Map information"], ["gameplay", "Gameplay editorial layer"], ["postmatch", "Post-match / MVP"]];
VIEWS.settings = {
  mount: () => `<main class="main st" id="main" style="grid-template-columns:repeat(3,minmax(0,1fr));overflow:auto;align-content:start">
    <div class="col">${pane("Data sources", `<div class="pb tight" id="stSrc"></div>`)}${pane("Simulation", `<div class="pb grp" id="stSim"></div>`)}${pane("OBS browser sources", `<div class="pb tight" id="stObsSrc"></div>`, "3840×2160 = native 4K")}${pane("OBS WebSocket", `<div class="pb grp" id="stObs"></div>`, "optional")}</div>
    <div class="col">${pane("Assets", `<div class="pb tight" id="stAssets"></div>`, "replace a file, keep its name")}${pane("Facts library", `<div class="pb tight" id="stFacts"></div><div class="pb grp" style="border-top:1px solid var(--bd)">${factForm()}</div>`)}</div>
    <div class="col">${pane("Player portraits & careers", `<div class="pb tight" id="stPlayers"></div>`, "focal point · zoom")}</div></main>`,
  live: {
    stSrc: s => { const m = s.sources.major, w = s.sources.wildcard, l = s.sources.liquipedia;
      const row = (n, d, st, act) => `<div class="li" style="grid-template-columns:1fr auto"><div style="min-width:0"><div class="t">${n}</div><div class="m">${d}</div><div class="m" style="color:${/offline|error/i.test(st) ? "var(--amb)" : "var(--dim)"}">${st}</div></div>${act || ""}</div>`;
      return row("Major sheet", "Teams, rosters, seeds, schedule, scores", m.ok === false ? `Offline (${esc(m.error)}) · ${esc(m.origin)} data from ${esc(OD.ago(m.at))}` : `${esc(m.origin)} · ${esc(OD.ago(m.at))}`, btn("Refresh", "source.refresh", { which: "major" }, "xs"))
        + row("Wildcard sheet", "Previous results, head-to-heads", w.ok === false ? `Offline (${esc(w.error)})` : w.at ? esc(OD.ago(w.at)) : "not loaded", btn("Refresh", "source.refresh", { which: "wildcard" }, "xs"))
        + row("Liquipedia", "Optional imports, approved per player", l.running ? `Importing ${l.done}/${l.total} · one page per 30 s` : "idle", btn("Import all", "lp.import", {}, "xs", l.running))
        + row("eCircuitMania", "No public API; manual reference", `<a href="https://ecircuitmania.com/tournaments/OD26Major" target="_blank" rel="noopener" style="color:var(--dim)">Open in browser</a>`)
        + `<div class="pb grp"><div class="rw">${sw("Auto-sync", s.settings.autoSync, `data-setb="autoSync"`)}<span class="gl">every</span><input class="in" style="width:64px" type="number" min="15" max="600" value="${esc(s.settings.pollSec)}" data-setn="pollSec"><span class="gl">s</span></div>
          <div class="field"><label>Major CSV</label><input class="in mono" data-sett="majorCsv" value="${esc(s.settings.majorCsv)}"></div><div class="field"><label>Wildcard CSV</label><input class="in mono" data-sett="wildcardCsv" value="${esc(s.settings.wildcardCsv)}"></div>
          <div class="field"><label>Contact for Liquipedia's User-Agent</label><input class="in" data-sett="lpContact" value="${esc(s.settings.lpContact)}" placeholder="Discord or email"></div></div>`; },
    stSim: s => `<div class="rw">${btn(s.sim.on ? "Simulation on" : "Simulation off", "sim.toggle", { on: !s.sim.on }, s.sim.on ? "on" : "")}${btn("Reset results", "sim.reset", {}, "", !Object.keys(s.sim.matches).length)}</div><div class="m">Fake results on top of real data for rehearsal; use +1 on Bracket → Match data.</div>`,
    stObsSrc: () => SOURCES.map(([h, n, k]) => `<div class="li" style="grid-template-columns:1fr auto"><div style="min-width:0"><div class="t">${esc(n)}</div><div class="m mono-s">${esc(srcURL(h, k))}</div></div><button class="b xs" data-copy="${esc(srcURL(h, k))}">Copy</button></div>`).join("")
      + `<div class="li" style="grid-template-columns:1fr auto"><div><div class="t">Stinger transition</div><div class="m mono-s">public/brand/stinger.webm · cut at 1000 ms</div></div></div>`,
    stObs: () => { const o = P.obs;
      if (!o || !o.ok) return `<div class="rw nw"><input class="in mono" id="obsUrl" style="flex:1" value="${esc((P.priv && P.priv.obs && P.priv.obs.url) || "ws://127.0.0.1:4455")}"><input class="in" id="obsPw" type="password" placeholder="Password" value="${esc((P.priv && P.priv.obs && P.priv.obs.password) || "")}"><button class="b" data-obs>Connect</button></div>${o && o.err ? `<div class="m" style="color:var(--amb)">${esc(o.err)}</div>` : ""}`;
      return `<div class="m">Connected · program: <b>${esc(o.scene || "?")}</b></div><div class="rw">${(o.scenes || []).map(n => `<button class="b xs ${n === o.scene ? "on" : ""}" data-obsscene="${esc(n)}">${esc(n)}</button>`).join("")}</div><div class="rw"><button class="b xs" data-obsoff>Disconnect</button></div>`; },
    stAssets: (s, M) => { const has = (dir, n) => ((s.assets || {})[dir] || []).some(f => f.replace(/\.[a-z0-9]+$/i, "") === n);
      const row = (ok, path, note) => `<div class="li" style="grid-template-columns:10px 1fr"><i class="dot ${ok ? "" : "amb"}"></i><div style="min-width:0"><div class="t mono-s">${path}</div>${note ? `<div class="m">${note}</div>` : ""}</div></div>`;
      return [["major-logo", "Major logo (status bar, every full-screen scene)", false], ["logo", "OverDrive logo · fallback", true], ["mark", "OverDrive mark · gameplay cards", true], ["bar", "Full-screen background", true], ["screen", "Break background", true], ["desk-solo", "Desk frame · solo", true], ["desk-duo", "Desk frame · dual", true], ["stinger", "Stinger (OBS)", true]]
        .map(([n, l, from]) => row(has("brand", n), `brand/${n}`, esc(l) + (has("brand", n) && from ? " · original OverDrive package" : has("brand", n) ? "" : " · missing"))).join("")
        + Object.values(M.teams).map(t => row(!!t.logo, `logos/${esc(OD.norm(t.name))}.png`, esc(t.name) + (t.logo ? " · 64 px, ≥256 px recommended" : " · missing"))).join(""); },
    stFacts: s => (s.facts || []).map(f => `<div class="li" style="grid-template-columns:1fr auto"><div style="min-width:0"><div class="t" title="${esc(f.text)}">${esc(f.text)}</div><div class="m">${esc(f.subject.type === "team" ? OD.tname(f.subject.id) : f.subject.type === "player" ? ((OD.M.player(f.subject.id) || {}).name || "") : "Event")} · ${esc(f.source)}</div></div>${btn("Remove", "fact.remove", { id: f.id }, "xs")}</div>`).join("") || `<div class="empty">No facts yet.</div>`,
    stPlayers: (s, M) => Object.values(M.teams).map(t => `<div class="pgh">${tm(t.id)}</div>` + t.players.concat(t.subs).map(pid => { const p = M.player(pid), ph = M.photo(pid), e = s.lp[pid] || {}, v = M.vplayer(pid);
      return `<div class="prow2">${ph ? `<div class="mini">${OD.photo(pid, "")}${OD.photo(pid, "", 1.5)}</div>` : `<div class="mini"><span class="phx noph"></span></div>`}<div style="min-width:0"><div class="t">${esc(p.name)} <span class="nat">${esc(OD.natCode(p.nat))}</span>${t.subs.includes(pid) ? ` <span class="tag" style="height:16px">sub</span>` : ""}</div>
        <div class="m">${v ? `Verified career · ${v.results.length} results` : M.lpRows(pid).length ? "Liquipedia import (approved)" : "No career data"}${e.status ? ` · import ${esc(e.status)}` : ""}</div>
        ${ph ? `<div class="crop3"><input class="in" type="number" min="0" max="100" data-frame="${esc(pid)}" data-k="x" value="${esc(ph.x)}" title="Focal X %"><input class="in" type="number" min="0" max="100" data-frame="${esc(pid)}" data-k="y" value="${esc(ph.y)}" title="Focal Y %"><input class="in" type="number" step=".05" min="1" max="4" data-frame="${esc(pid)}" data-k="zoom" value="${esc(ph.zoom)}" title="Zoom">${ph.custom ? btn("Default", "player.meta", { id: pid, frame: null }, "xs") : ""}</div>` : `<input class="in" data-meta="${esc(pid)}" data-k="photo" placeholder="Photo URL or /players/file.jpg" value="${esc((s.playerMeta[pid] || {}).photo || "")}">`}
        <div class="rw">${btn("Import", "lp.import", { ids: [pid] }, "xs", s.sources.liquipedia.running)}${e.rows && e.rows.length ? btn(e.approved ? "Approved" : "Approve import", "lp.approve", { id: pid, on: !e.approved }, e.approved ? "xs on" : "xs") : ""}</div></div></div>`; }).join("")).join("")
  }
};
function factForm() {
  const M = OD.M; if (!M) return "";
  return `<select class="in" id="fxSubj"><option value="event:major">The Major</option>${Object.values(M.teams).map(t => `<option value="team:${esc(t.id)}">Team · ${esc(t.name)}</option>`).join("")}${Object.values(M.players).map(p => `<option value="player:${esc(p.id)}">Player · ${esc(p.name)}</option>`).join("")}</select>
    <input class="in" id="fxText" placeholder="Verified fact (max 220 characters)" maxlength="220"><div class="rw nw"><input class="in" id="fxSrc" placeholder="Source" style="flex:1"><input class="in" id="fxUrl" placeholder="Link (optional)" style="flex:1"><button class="b" data-addfact>Add</button></div>`;
}

/* ================================================================== OBS WebSocket v5 (optional) */
async function sha256b64(t) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return btoa(String.fromCharCode(...new Uint8Array(d))); }
function obsConnect(url, pw) {
  try { if (P.obs && P.obs.ws) P.obs.ws.close(); } catch (e) {}
  const ws = new WebSocket(url), o = P.obs = { ws, ok: false };
  const req = (requestType, requestData) => ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: Math.random().toString(36).slice(2), requestData } }));
  o.req = req;
  ws.onmessage = async ev => {
    const m = JSON.parse(ev.data);
    if (m.op === 0) { const id = { rpcVersion: 1, eventSubscriptions: 4 };
      if (m.d.authentication) { if (!crypto.subtle) { o.err = "Password auth needs https or localhost"; update(true); return; } id.authentication = await sha256b64(await sha256b64(pw + m.d.authentication.salt) + m.d.authentication.challenge); }
      ws.send(JSON.stringify({ op: 1, d: id })); }
    if (m.op === 2) { o.ok = true; o.err = null; req("GetSceneList"); OD.act("obs.save", { url, password: pw }); }
    if (m.op === 7 && m.d.requestType === "GetSceneList" && m.d.responseData) { o.scenes = m.d.responseData.scenes.map(x => x.sceneName).reverse(); o.scene = m.d.responseData.currentProgramSceneName; update(true); }
    if (m.op === 5 && m.d.eventType === "CurrentProgramSceneChanged") { o.scene = m.d.eventData.sceneName; update(true); }
    if (m.op === 5 && /Scene(Created|Removed|NameChanged)/.test(m.d.eventType)) req("GetSceneList");
  };
  ws.onclose = e => { o.ok = false; o.err = e.code === 4009 ? "Wrong OBS WebSocket password" : "Disconnected from OBS (graphics keep working)"; update(true); };
  ws.onerror = () => { o.err = "Couldn't reach OBS WebSocket at " + url; };
}

/* ================================================================== input */
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
function previewPlayer(pid) { P.pid = pid; return OD.act("gp.preview", { g: { type: "player", params: { pid }, dur: P.dur } }); }
function take() { const pv = OD.S && OD.S.gp.preview; if (!pv || !SC.gfxHTML(pv)) return OD.toast("Nothing valid in preview", true);
  return OD.act("gp.preview", { g: { ...pv, dur: P.dur } }).then(r => r && OD.act("gp.take")); }
function onClick(e) {
  const t = e.target.closest("button,[data-go],[data-copy],[data-pos]"); if (!t) return;
  if (t.dataset.go) { e.preventDefault(); return go(t.dataset.go); }
  if (t.dataset.pos) { const p = OD.S.gp.pos; return OD.act("gp.pos", { pos: { ...p, preset: t.dataset.pos } }); }
  if (t.disabled) return;
  if (t.dataset.act) { const p = JSON.parse(t.dataset.p || "{}"); if (p.g && p.g.type) p.g.dur = P.dur; return OD.act(t.dataset.act, p); }
  if ("take" in t.dataset) return take();
  if (t.dataset.dur !== undefined) { P.dur = +t.dataset.dur; return update(true); }
  if (t.dataset.pick) return previewPlayer(t.dataset.pick).then(() => update(true));
  if (t.dataset.fs) { P.fs = t.dataset.fs; return mount(); }
  if (t.dataset.desktab) { P.deskTab = t.dataset.desktab; return mount(); }
  if (t.dataset.scenebg) return OD.act("scene.bg", { scene: t.dataset.scenebg, on: !OD.S.scenes[t.dataset.scenebg].bg });
  if (t.dataset.desk) { const k = t.dataset.desk; return OD.act("desk.set", { [k]: !OD.S.desk[k] }); }
  if (t.dataset.panel) { const k = t.dataset.panel; return OD.act("brk.set", { panels: { [k]: !OD.S.brk.panels[k] } }); }
  if ("brkbg" in t.dataset) return OD.act("brk.set", { bg: !OD.S.brk.bg });
  if (t.dataset.bo) { const k = t.dataset.bo; return OD.act("bracket.opts", { opts: { [k]: !OD.S.bracketOpts[k] } }); }
  if (t.dataset.setb) { const k = t.dataset.setb; return OD.act("settings.set", { [k]: !OD.S.settings[k] }); }
  if (t.dataset.copy) { navigator.clipboard && navigator.clipboard.writeText(t.dataset.copy).then(() => OD.toast("Copied")); return; }
  if ("custom" in t.dataset) { const g = { type: "custom", params: { kicker: val("cuKick"), title: val("cuTitle"), text: val("cuText") }, dur: P.dur };
    if (!g.params.text && !g.params.title) return OD.toast("Write a title or message first", true); return OD.act("gp.preview", { g }); }
  if ("savecaster" in t.dataset) { const f = t.closest(".cam"), v = k => (f.querySelector(`[data-f="${k}"]`) || {}).value;
    if (!v("name")) return OD.toast("A caster needs a name", true);
    const c = { id: f.dataset.cid, name: v("name"), role: v("role"), handle: v("handle"), crop: { x: +v("x") || 0, y: +v("y") || 0, zoom: +v("zoom") || 1 } };
    if (P.priv) c.vdo = v("vdo");
    return OD.act("caster.save", { caster: c }).then(r => { if (r) { OD.toast("Camera saved"); OD.getPrivate().then(p => { P.priv = p; mount(); }); } }); }
  if ("addfact" in t.dataset) { const [type, id] = val("fxSubj").split(":"); if (!val("fxText")) return OD.toast("Write the fact first", true);
    if (!val("fxSrc")) return OD.toast("Add the source so the fact can be checked", true);
    return OD.act("fact.add", { text: val("fxText"), source: val("fxSrc"), url: val("fxUrl"), subject: { type, id } }).then(r => { if (r) ["fxText", "fxUrl"].forEach(k => document.getElementById(k).value = ""); }); }
  if ("obs" in t.dataset) return obsConnect(val("obsUrl"), val("obsPw"));
  if ("obsoff" in t.dataset) { try { P.obs.ws.close(); } catch (x) {} P.obs = null; return update(true); }
  if (t.dataset.obsscene && P.obs && P.obs.ok) return P.obs.req("SetCurrentProgramScene", { sceneName: t.dataset.obsscene });
}
function onChange(e) {
  const t = e.target;
  if ("predmatch" in t.dataset) { P.predMatch = t.value; return update(true); }
  if ("curmap" in t.dataset) { P.curMap = t.value || null; const sc = OD.S.scenes.maps; if (sc.preview.view === "pool") OD.act("scene.set", { scene: "maps", slot: "preview", view: "pool", params: { current: P.curMap } }); return update(true); }
  if (t.dataset.sett) return OD.act("settings.set", { [t.dataset.sett]: t.value });
  if (t.dataset.setn) return OD.act("settings.set", { [t.dataset.setn]: +t.value });
  if (t.dataset.bor) return OD.act("bracket.opts", { opts: { [t.dataset.bor]: +t.value } });
  if (t.dataset.ov) { const k = t.dataset.k, v = t.value.trim(); return OD.act("override.set", { id: t.dataset.ov, fields: { [k]: k === "status" ? (v || null) : v.toUpperCase() } }); }
  if (t.dataset.meta) return OD.act("player.meta", { id: t.dataset.meta, [t.dataset.k]: t.value });
  if (t.dataset.frame) { const id = t.dataset.frame, ph = OD.M.photo(id) || { x: 50, y: 30, zoom: 1 }, f = { x: ph.x, y: ph.y, zoom: ph.zoom }; f[t.dataset.k] = +t.value; return OD.act("player.meta", { id, frame: f }); }
}
const GKEYS = { q: "player", w: "achievements", e: "career" };
function onKey(e) {
  const typing = /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || "");
  if (e.key === "Escape") { e.preventDefault(); if (typing) { document.activeElement.blur(); return; } return OD.act("editorial.clear"); }
  const f = /^F([1-8])$/.exec(e.key); if (f) { e.preventDefault(); return go(PAGES[+f[1] - 1][0]); }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || !OD.M) return;
  const M = OD.M, r = M.active, ps = matchPlayers(M);
  // desk states: Shift+1…5 preview Clean / Upcoming / Stats / Others / Predictions (Take stays a click)
  if (P.page === "desk" && e.shiftKey && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); const v = ["clean", "upcoming", "stats", "others", "pred"][+e.code.slice(5) - 1]; return SC.deskViewOk(v, OD.S) ? OD.act("desk.preview", { view: v }) : OD.toast("Nothing to show for that state yet", true); }
  if (/^[1-4]$/.test(e.key) && ps[+e.key - 1]) { e.preventDefault(); return previewPlayer(ps[+e.key - 1]).then(() => update(true)); }
  if (P.page !== "gameplay") return;
  if (e.key === " ") { e.preventDefault(); return take(); }
  const k = e.key.toLowerCase(), pv = g => SC.gfxAvailable(g.type, g.params) ? OD.act("gp.preview", { g: { ...g, dur: P.dur } }) : OD.toast("No verified data for this", true);
  if (GKEYS[k] && P.pid) return pv({ type: GKEYS[k], params: { pid: P.pid } });
  if (k === "r" && P.pid) { const t = M.teamOfPlayer(P.pid), i = t.players.indexOf(P.pid), o = r && r.t.find(id => id !== t.id), opp = o ? M.team(o).players[i] : null; if (opp) return pv({ type: "compare", params: { a: P.pid, b: opp } }); }
  if (k === "a") return pv({ type: "others", params: {} });
  if (k === "s") return pv({ type: "recent", params: {} });
  if (k === "d") return pv({ type: "upcoming", params: {} });
  if (k === "f" && r) return pv({ type: "h2h", params: { mid: r.id } });
}
})();
