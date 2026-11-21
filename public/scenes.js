/* OverDrive Major: on-air scenes. Every scene renders from OD.S / OD.M only and hides what it has no data for. */
"use strict";
(() => {
const SC = window.SC = {};
const esc = OD.esc;

/* ======================================================================= shared pieces */
const tlogo = (id, cls) => { const src = OD.logoSrc(id), t = OD.M.team(id);
  return src ? `<span class="tlogo ${cls || ""}"><img src="${esc(src)}" alt=""></span>` : (t ? `<span class="tlogo mono ${cls || ""}">${esc(t.short)}</span>` : ""); };
const teamChip = id => `<span class="tchip">${OD.logo(id, "lg")}<b>${esc(OD.tname(id))}</b></span>`;
const pname = pid => { const p = OD.M.player(pid); return p ? p.name : ""; };
const scoreTxt = (r, flip) => r.forfeit ? "FF" : `${esc(flip ? r.s2 : r.s1)}–${esc(flip ? r.s1 : r.s2)}`;
const winnerFirst = r => r.winner === r.t[0] ? `${esc(r.s1)}–${esc(r.s2)}` : `${esc(r.s2)}–${esc(r.s1)}`;
const yr = d => String(d || "").slice(0, 4);
const pcard = (pid, extra, cls) => { const p = OD.M.player(pid); if (!p) return "";
  return `<div class="pcard ${cls || ""}">${OD.photo(pid, "") || `<span class="noph"></span>`}<div class="cap"><div><b>${esc(p.name)}</b>${extra || ""}</div>${OD.nat(pid)}</div></div>`; };
function matchRow(r, opts) {
  opts = opts || {};
  const side = i => { const id = r.t[i]; return id ? `${OD.logo(id, "lg")}<b>${esc(OD.tname(id))}</b>` : `<i class="tbd">${esc(r.hint[i] || "TBD")}</i>`; };
  const mid = r.winner || r.status === "live" ? `<span class="sc${r.status === "live" ? " live" : ""}">${r.forfeit ? "FF" : esc(r.s1 || "0") + "–" + esc(r.s2 || "0")}</span>` : `<span class="vs">vs</span>`;
  const wcls = i => r.winner ? (r.winner === r.t[i] ? " w" : " l") : "";
  return `<div class="mrow${r.status === "live" ? " is-live" : ""}">${opts.noRound ? "" : `<span class="rd">${esc(r.roundShort)}</span>`}
    <span class="a${wcls(0)}">${side(0)}</span>${mid}<span class="b${wcls(1)}">${side(1)}</span>
    ${opts.time && !r.winner && r.status !== "live" && r.at ? `<span class="tm">${esc(OD.time(r.at))}</span>` : ""}${r.status === "live" ? `<span class="lv">Live</span>` : ""}</div>`;
}
SC.matchRow = matchRow;
function stakesOf(r) {
  const where = to => to ? OD.roundName(to.bid) : null;
  if (r.bid === "R6_GF") return [{ k: "Winner", v: "OverDrive Major champion" }, { k: "Loser", v: "2nd place" }];
  return [{ k: "Winner", v: r.winTo ? "to the " + where(r.winTo) : "advances" },
    { k: "Loser", v: r.loseTo ? "drops to the " + where(r.loseTo) : (r.elimPlace ? "eliminated · " + r.elimPlace : "eliminated") }];
}
SC.stakesOf = stakesOf;
const nextUp = M => M.active || M.list.find(r => r.ready && !r.winner && r.status !== "void");
const eventLine = () => { const e = OD.M.event; return e ? [`OverDrive Major`, e.dates, "8 teams · double elimination"] : ["OverDrive Major"]; };

/* Full-screen frame: looping background mounted once (never restarts), vignette, corner label, event logo, a view
   that cross-fades between internal states, and the bottom bar. */
function mountFS(root, bgFile, cls) {
  root.innerHTML = `<div class="stage fs ${cls || ""}" id="st"><video class="bgv" muted loop autoplay playsinline></video><div class="vign"></div>
    <div class="view" id="v"></div><div class="corner" id="cn"></div><img class="evlogo" id="lg" alt=""><div class="bbar" id="bb"></div></div>`;
  const st = root.querySelector("#st"), vid = st.querySelector("video"), v = st.querySelector("#v"), cn = st.querySelector("#cn"), lg = st.querySelector("#lg"), bb = st.querySelector("#bb");
  OD.fit(st);
  let key = null, html = null, outT = null, setT = null;
  const F = {
    st,
    bg(on) {
      st.classList.toggle("has-bg", !!on);
      const want = on ? OD.brand(bgFile) : null;
      if (want && vid.getAttribute("src") !== want) { vid.setAttribute("src", want); vid.play().catch(() => {}); }
      if (!want && vid.getAttribute("src")) { vid.pause(); vid.removeAttribute("src"); vid.load(); }
      vid.style.display = want ? "" : "none";
    },
    chrome(label) { if (cn.textContent !== label) cn.textContent = label; const src = OD.eventLogo(); if (src && lg.getAttribute("src") !== src) lg.setAttribute("src", src); lg.style.display = src ? "" : "none"; },
    bar(h) { if (bb._h !== h) { bb.innerHTML = h; bb._h = h; } bb.style.display = h ? "" : "none"; },
    // new key → animate out, then in; same key → update in place (no replayed animations)
    show(k, h, settleMs) {
      if (k === key) { if (h !== html) { html = h; v.innerHTML = h; } return; }
      const first = key === null; key = k; html = h;
      clearTimeout(outT); clearTimeout(setT);
      const put = () => { v.className = "view"; v.innerHTML = h; void v.offsetWidth; v.className = "view in"; setT = setTimeout(() => v.classList.add("settled"), settleMs || 1400); };
      if (first || !v.innerHTML) put(); else { v.className = "view out"; outT = setTimeout(put, 280); }
    }
  };
  return F;
}
const barHTML = (items, right) => `${items.map((x, i) => (i ? `<span class="sep">◆</span>` : "") + `<span>${esc(x)}</span>`).join("")}${right ? `<span class="r">${right}</span>` : ""}`;

/* ======================================================================= editorial graphics (gameplay layer)
   Original OverDrive "spotlight" language: white tab, dark card, accent edge, OverDrive mark. Each builder returns
   null when its data is missing, so a graphic is never shown half-empty. */
const card = (tab, body, opts) => {
  opts = opts || {};
  const left = opts.photo || (OD.brand("mark") ? `<img class="mk" src="${esc(OD.brand("mark"))}" alt="">` : "");
  return `<div class="gp"><div class="tab">${esc(tab)}</div><div class="card">${left}<div class="body">${opts.ctx ? `<div class="ctx">${opts.ctx}</div>` : ""}${body}${opts.foot ? `<div class="foot">${opts.foot}</div>` : ""}</div></div></div>`;
};
const meta = pid => { const M = OD.M, v = M.vplayer(pid), age = M.age(pid), t = M.teamOfPlayer(pid);
  return [v && v.realName, v && v.country || (M.player(pid) || {}).nat, age ? age + " years old" : null].filter(Boolean).join(" · "); };
const achLi = a => `<li><em>${esc(a.place)}</em>${esc(a.event)}<span>${esc(yr(a.date))}</span></li>`;
const GFX = {
  player(p) {
    const M = OD.M, pl = M.player(p.pid); if (!pl) return null;
    const t = M.teamOfPlayer(p.pid), ach = M.achievements(p.pid).slice(0, 2);
    return card("Player spotlight", `<div class="big">${esc(pl.name)} ${OD.nat(p.pid)}</div><div class="meta">${esc(meta(p.pid))}</div>${ach.length ? `<ul class="list" style="margin-top:8px">${ach.map(achLi).join("")}</ul>` : ""}`,
      { ctx: t ? teamChip(t.id) : "", photo: OD.photo(p.pid, "", 1.5), foot: ach.length ? "Source: Liquipedia" : "" });
  },
  achievements(p) {
    const M = OD.M, pl = M.player(p.pid); if (!pl) return null;
    const a = M.achievements(p.pid).slice(0, 4), f = M.facts("player", p.pid).slice(0, Math.max(0, 4 - a.length));
    if (!a.length && !f.length) return null;
    return card("Achievements", `<div class="big">${esc(pl.name)}</div><ul class="list" style="margin-top:6px">${a.map(achLi).join("")}${f.map(x => `<li>${esc(x.text)}</li>`).join("")}</ul>`,
      { ctx: M.teamOfPlayer(p.pid) ? teamChip(M.teamOfPlayer(p.pid).id) : "", photo: OD.photo(p.pid, "", 1.5), foot: a.length ? "Source: Liquipedia" : "" });
  },
  career(p) {
    const M = OD.M, pl = M.player(p.pid), v = M.vplayer(p.pid); if (!pl) return null;
    const rows = M.career(p.pid).slice(0, 4); if (!rows.length) return null;
    return card("Recent results", `<div class="big">${esc(pl.name)}</div><ul class="list" style="margin-top:6px">${rows.map(x => `<li><em>${esc(x.place)}</em>${esc(x.event)}<span>${esc(x.date.slice(0, 7))}</span></li>`).join("")}</ul>`,
      { photo: OD.photo(p.pid, "", 1.5), foot: "Source: Liquipedia" });
  },
  compare(p) {
    const M = OD.M, a = M.player(p.a), b = M.player(p.b); if (!a || !b) return null;
    const col = pid => { const t = M.teamOfPlayer(pid), ach = M.achievements(pid), v = M.vplayer(pid);
      return `<div class="cmp"><div class="big">${esc(M.player(pid).name)} ${OD.nat(pid)}</div>${t ? teamChip(t.id) : ""}
        ${v && v.earnings ? `<div class="kv"><span>Prize money</span><b>${esc(v.earnings)}</b></div>` : ""}${ach[0] ? `<div class="kv"><span>Best</span><b>${esc(ach[0].place)} · ${esc(ach[0].event)}</b></div>` : ""}</div>`; };
    return card("Player comparison", `<div class="cmp2">${col(p.a)}<i class="vsx">vs</i>${col(p.b)}</div>`, { foot: "Source: Liquipedia" });
  },
  team(p) {
    const M = OD.M, t = M.team(p.tid); if (!t) return null;
    const rec = M.record(t.id), sd = M.seeds(t.id), st = M.status(t.id), lines = M.teamLines(t.id);
    const kv = [];
    if (sd && sd.original) kv.push(["Seed", sd.current && sd.current !== sd.original ? `${sd.original} → now ${sd.current}` : String(sd.original)]);
    if (rec.sw + rec.sl) kv.push(["Major series", `${rec.sw}–${rec.sl}`], ["Maps", `${rec.mw}–${rec.ml}`]);
    kv.push(["Status", st.label]);
    return card("Team", `<div class="big">${OD.logo(t.id, "lg")} ${esc(t.name)}</div><div class="kvs" style="margin-top:8px">${kv.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>`,
      { foot: lines[0] ? esc(lines[0].text) : "" });
  },
  path(p) {
    const M = OD.M, t = M.team(p.tid); if (!t) return null;
    const rec = M.record(t.id); if (!rec.played.length) return null;
    return card("Road so far", `<div class="big">${OD.logo(t.id, "lg")} ${esc(t.name)}</div><ul class="list" style="margin-top:6px">${rec.played.map(x => `<li class="${x.won ? "won" : "lost"}"><em>${x.won ? "W" : "L"} ${esc(x.sf)}–${esc(x.sa)}</em>vs ${esc(OD.tname(x.opp))}<span>${esc(x.r.roundShort)}</span></li>`).join("")}</ul>`,
      { foot: `Major record ${rec.sw}–${rec.sl} · maps ${rec.mw}–${rec.ml}` });
  },
  recent() { const rs = OD.M.others().filter(r => r.winner).slice(-3).reverse(); if (!rs.length) return null; return card("Latest results", rs.map(r => matchRow(r)).join("")); },
  others() {
    const o = OD.M.others(), live = o.filter(r => r.status === "live"), next = o.filter(r => r.ready && r.status === "upcoming").slice(0, 2), last = o.filter(r => r.winner).slice(-1);
    const rows = live.concat(last, next).slice(0, 3); if (!rows.length) return null;
    return card(live.length ? "Elsewhere · live" : "Around the bracket", rows.map(r => matchRow(r, { time: true })).join(""));
  },
  upcoming() { const rs = OD.M.others().filter(r => !r.winner && r.status !== "live" && r.status !== "void").slice(0, 3); if (!rs.length) return null; return card("Coming up", rs.map(r => matchRow(r, { time: true })).join("")); },
  result(p) {
    const r = OD.M.byId[p.mid]; if (!r || !r.ready || (!r.winner && r.status !== "live")) return null;
    const foot = r.winner ? `${esc(OD.tname(r.winner))} ${r.winTo ? "advance to the " + esc(OD.roundName(r.winTo.bid)) : (r.bid === "R6_GF" ? "are the OverDrive Major champions" : "advance")} · ${esc(OD.tname(r.loser))} ${r.loseTo ? "drop to the " + esc(OD.roundName(r.loseTo.bid)) : "are eliminated" + (r.elimPlace ? " (" + r.elimPlace + ")" : "")}` : "";
    return card(r.winner ? "Result · " + r.round : "Live · " + r.round, matchRow(r, { noRound: true }), { foot });
  },
  stakes(p) { const r = OD.M.byId[p.mid] || OD.M.active; if (!r || !r.ready) return null;
    return card("What's at stake", `<div class="kvs">${stakesOf(r).map(x => `<div class="kv"><span>${esc(x.k)}</span><b>${esc(x.v)}</b></div>`).join("")}</div>`, { ctx: esc(r.round) }); },
  seeds(p) {
    const r = OD.M.byId[p.mid] || OD.M.active; if (!r || !r.ready) return null;
    const row = (id, i) => { const sd = OD.M.seeds(id), cur = r.seed[i];
      return `<div class="kv">${teamChip(id)}<b>Seed ${esc(cur || sd.original)}${cur && cur !== sd.original ? `<small> · started as ${esc(sd.original)}</small>` : ""}</b></div>`; };
    return card("Seed takeover", `<div class="kvs">${row(r.t[0], 0)}${row(r.t[1], 1)}</div>`, { ctx: esc(r.round), foot: "Winners take the better seed, losers the worse one · seeds set the track pick order" });
  },
  h2h(p) {
    const r = OD.M.byId[p.mid] || OD.M.active; if (!r || !r.ready) return null;
    const h = OD.M.h2h(r.t[0], r.t[1]); if (!h.length) return null;
    return card("Head to head", `<ul class="list">${h.map(x => `<li><em>${esc(OD.tname(x.winner))}</em>${esc(x.sa)}–${esc(x.sb)}<span>${esc(x.src)} · ${esc(x.round)}</span></li>`).join("")}</ul>`,
      { ctx: `${teamChip(r.t[0])}<i class="vsx">vs</i>${teamChip(r.t[1])}` });
  },
  map(p) {
    const M = OD.M, m = M.maps().find(x => x.id === p.id); if (!m) return null;
    const r = M.active, inMatch = r ? r.t.filter(Boolean).flatMap(t => M.team(t).players).map(pid => norm(pname(pid))) : [];
    const pbs = m.pbs.filter(([h]) => inMatch.includes(norm(h)) || inMatch.includes(norm(h) + "tm")).slice(0, 3);
    return card("Map", `<div class="big">${esc(m.name)}</div><div class="meta">Author time ${esc(m.author)}</div>${pbs.length ? `<ul class="list" style="margin-top:6px">${pbs.map(([h, t]) => `<li><em>${esc(t)}</em>${esc(h)}<span>Campaign PB</span></li>`).join("")}</ul>` : ""}`,
      { photo: m.photo ? `<span class="phx" style="background:url('${esc(m.photo)}') center/cover"></span>` : "", foot: pbs.length ? "Campaign PBs: trackmania.io, 10 Nov" : "" });
  },
  fact(p) { const f = (OD.S.facts || []).find(x => x.id === p.fid); if (!f) return null;
    const subj = f.subject.type === "team" ? teamChip(f.subject.id) : f.subject.type === "player" ? `<b>${esc(pname(f.subject.id))}</b> ${OD.nat(f.subject.id)}` : "";
    return card("Did you know", `<div class="fact">${esc(f.text)}</div>`, { ctx: subj, foot: f.source ? "Source: " + esc(f.source) : "" }); },
  custom(p) { if (!p.text && !p.title) return null; return card(p.kicker || "OverDrive Major", `${p.title ? `<div class="big">${esc(p.title)}</div>` : ""}${p.text ? `<div class="fact" style="margin-top:6px">${esc(p.text)}</div>` : ""}`); }
};
const norm = OD.norm;
SC.GFX = GFX;
SC.gfxHTML = g => { if (!g || !GFX[g.type]) return ""; try { return GFX[g.type](g.params || {}) || ""; } catch (e) { console.error(e); return ""; } };
SC.gfxAvailable = (type, params) => !!SC.gfxHTML({ type, params });

/* ======================================================================= gameplay (transparent, editorial only) */
SC.gameplay = (root, preview) => {
  root.innerHTML = `<div class="stage gp-stage" id="st"><div class="gp-host" id="host"></div>${preview ? `<div class="pv-safe"></div>` : ""}</div>`;
  const st = root.querySelector("#st"), host = root.querySelector("#host"); OD.fit(st);
  let shownUid = null, shownHTML = "", outT = null;
  const place = () => { const p = (OD.S.gp && OD.S.gp.pos) || { preset: "bl", dx: 0, dy: 0 }, sc = (OD.S.gp && OD.S.gp.scale) || 1;
    host.className = "gp-host pos-" + p.preset; host.style.translate = `${p.dx}px ${p.dy}px`; host.style.scale = sc; };
  OD.onState(s => {
    place();
    const g = preview ? s.gp.preview : s.gp.live, html = SC.gfxHTML(g);
    if (g && html) {
      if (g.uid === shownUid && html === shownHTML) return;
      clearTimeout(outT);
      const fresh = g.uid !== shownUid; shownUid = g.uid; shownHTML = html;
      host.innerHTML = html; const el = host.firstElementChild; if (fresh && el) el.classList.add("in");
    } else if (shownUid) {
      shownUid = null; shownHTML = "";
      const el = host.firstElementChild; if (!el) return;
      el.classList.remove("in"); el.classList.add("out");
      outT = setTimeout(() => { if (!shownUid) host.innerHTML = ""; }, 460);   // back to fully transparent
    }
  });
};

/* ======================================================================= bracket / tournament overview */
const BX = { w: 290, h: 98, cols: [40, 350, 660, 970, 1280, 1590] };
const BLAYOUT = {
  R1_UB1: [0, 196], R1_UB2: [0, 320], R1_UB3: [0, 444], R1_UB4: [0, 568],
  R2_UB1: [1, 258], R2_UB2: [1, 506], R3_UBF: [2, 382],
  R2_LB1: [1, 722], R2_LB2: [1, 846], R3_LB1: [2, 722], R3_LB2: [2, 846], R4_LBF: [3, 784], R5_CF: [4, 784], R6_GF: [5, 583]
};
SC.bracketHTML = (opts, inner) => {
  const M = OD.M, o = Object.assign({ title: true, times: true, seeds: true, opacity: 100 }, opts || {});
  const pos = id => { const p = BLAYOUT[id]; return p ? { x: BX.cols[p[0]], y: p[1] } : null; };
  let h = o.title ? `<div class="hdr"><div class="kicker">OverDrive Major 2026</div><h1>Tournament <em>bracket</em></h1></div>` : "";
  h += `<div class="sect lo" style="left:350px;top:672px">Lower bracket</div>`;
  const paths = [];
  for (const r of Object.values(M.byBid)) {
    const b = pos(r.bid); if (!b) continue;
    for (const sl of Object.values(M.slots[r.bid] || {})) {
      if (sl.cond !== "W" || !pos(sl.origin)) continue;
      const a = pos(sl.origin), src = M.byBid[sl.origin];
      const x1 = a.x + BX.w, y1 = a.y + BX.h / 2, x2 = b.x, y2 = b.y + (sl.slot === 1 ? 24 : 74), mx = x2 - 22;
      paths.push(`<path class="${src && src.winner ? "hot" : ""}" d="M${x1},${y1} H${mx} V${y2} H${x2}"/>`);
    }
  }
  h += `<svg class="lines" width="1920" height="1080" aria-hidden="true">${paths.join("")}</svg>`;
  const activeId = M.active && M.active.id;
  for (const r of Object.values(M.byBid)) {
    const p = pos(r.bid); if (!p) continue;
    const row = i => {
      const id = r.t[i];
      if (!id) return `<div class="row tbd"><span class="seed"></span><span class="name">${esc(r.hint[i] || "To be decided")}</span></div>`;
      const cls = r.winner ? (r.winner === id ? "win" : "lose") : "";
      return `<div class="row ${cls}"><span class="seed">${esc(r.seed[i] || "")}</span><span class="logo">${OD.logo(id, "")}</span><span class="name">${esc(OD.tname(id))}</span><span class="score"><i>${esc(r.forfeit && r.winner ? (r.winner === id ? "W" : "FF") : (i ? r.s2 : r.s1))}</i></span></div>`;
    };
    const flag = r.status === "live" || r.id === activeId ? `<span class="live${r.id === activeId ? " oncast" : ""}${r.status === "live" ? "" : " nolive"}">${r.status === "live" ? "Live" : ""}${r.status === "live" && r.id === activeId ? " · " : ""}${r.id === activeId ? "On air" : ""}</span>` : "";
    h += `<div class="match${r.bid === "R6_GF" ? " gf" : ""}${r.status === "live" ? " is-live" : ""}" style="left:${p.x}px;top:${p.y}px;width:${BX.w}px">
      <div class="mhead"><b>${esc(r.roundShort)}</b>${o.times && r.at && !r.winner ? `<span>${esc(OD.day(r.at).split(" ")[0])} ${esc(OD.time(r.at))}</span>` : ""}</div>
      ${flag}${row(0)}${row(1)}</div>`;
  }
  const gf = M.byBid.R6_GF;
  if (gf && gf.winner) h += `<div class="champ" style="left:${BX.cols[5]}px;top:470px">${OD.logo(gf.winner, "")}<span><small>Champion</small><b>${esc(OD.tname(gf.winner))}</b></span></div>`;
  if (inner) return h;
  return `<div class="stage bracket${o.seeds ? "" : " hide-seeds"}" style="--boxa:${o.opacity / 100}">${h}</div>`;
};
function scheduleHTML() {
  const M = OD.M, done = M.list.filter(r => r.winner).slice(-7).reverse(), next = M.list.filter(r => !r.winner && r.status !== "void");
  const row = (r, i) => { const side = k => { const id = r.t[k]; return id ? `${k ? OD.logo(id, "lg") : ""}<b>${esc(OD.tname(id))}</b>${k ? "" : OD.logo(id, "lg")}` : `<i class="tbd">${esc(r.hint[k])}</i>`; };
    const wl = k => r.winner && r.winner !== r.t[k] ? " l" : "";
    return `<div class="srow tile${r.status === "live" ? " is-live" : ""}" data-r style="--i:${i}"><span class="rd lbl">${esc(r.roundShort)}</span><span class="a${wl(0)}">${side(0)}</span>
      ${r.winner || r.status === "live" ? `<span class="mid">${scoreTxt(r)}</span>` : `<span class="mid vs">${r.at ? esc(OD.time(r.at)) : "vs"}</span>`}<span class="b${wl(1)}">${side(1)}</span></div>`; };
  return `<div class="sched">${next.length ? `<div class="col"><h3 class="lbl ac" data-r>Still to play</h3>${next.map(row).join("")}</div>` : ""}
    ${done.length ? `<div class="col"><h3 class="lbl ac" data-r>Results</h3>${done.map(row).join("")}</div>` : ""}</div>
    <div class="hdr" style="position:absolute;left:var(--safe);top:110px" data-r><div class="d-l" style="font-size:76px">Matches</div></div>`;
}
SC.bracket = (root, preview) => {
  const F = mountFS(root, "bar", "bracket");
  OD.onState(s => {
    const sc = s.scenes.bracket, st = preview ? sc.preview : sc.live, bg = sc.bg || s.bracketOpts.bg;
    F.bg(bg); F.st.classList.toggle("hide-seeds", !s.bracketOpts.seeds); F.st.style.setProperty("--boxa", s.bracketOpts.opacity / 100);
    F.chrome(bg && st.view === "schedule" ? "Tournament" : "");
    F.bar(bg ? barHTML(eventLine()) : "");
    F.show(st.view, st.view === "schedule" ? scheduleHTML() : `<div data-r>${SC.bracketHTML(s.bracketOpts, true)}</div>`);
  });
};

/* ======================================================================= matchup / team introduction */
SC.matchupViews = r => {
  const M = OD.M, out = [];
  if (!r || !r.ready) return out;
  out.push("versus", "intro0", "intro1");
  if (M.h2h(r.t[0], r.t[1]).filter(x => x.id !== r.id).length) out.push("h2h");
  if (r.t.some(id => journeyOf(r, id).played.length)) out.push("path");
  out.push("stakes");
  return out;
};
const roadLine = id => { const M = OD.M, sd = M.seeds(id), rec = M.record(id), bits = [];
  if (sd && sd.original) bits.push(sd.current && sd.current !== sd.original ? `Seed ${sd.current} <small>(started ${sd.original})</small>` : `Seed ${sd.original}`);
  if (rec.sw + rec.sl) bits.push(`Major ${rec.sw}–${rec.sl}`);
  return bits.join(" · "); };
function versusHTML(r) {
  const M = OD.M;
  const side = (i, cls) => { const id = r.t[i], t = M.team(id);
    return `<div class="vs-side ${cls}"><div class="vs-head" data-r="${i ? "r" : "l"}">${tlogo(id)}<div><div class="d-m">${esc(t.name)}</div><div class="lbl">${roadLine(id)}</div></div></div>
      <div class="duo">${t.players.map((pid, k) => `<div data-r style="--i:${2 + k + i * 2}">${pcard(pid)}</div>`).join("")}</div></div>`; };
  return `${side(0, "a")}<div class="vs-mid" data-r style="--i:1"><div class="vs">VS</div></div>${side(1, "b")}`;
}
const fitPx = (txt, base, chars) => Math.round(base * Math.min(1, chars / Math.max(1, String(txt).length)));
function introHTML(r, i) {
  // left: team identity and its numbers on a dark angled panel · right: both players as full-height portraits
  const M = OD.M, id = r.t[i], t = M.team(id), rec = M.record(id), sd = M.seeds(id), lines = M.teamLines(id), wc = M.wildcardPath(id);
  const stats = [];
  if (sd && sd.original) stats.push(["Seed", sd.current && sd.current !== sd.original ? sd.current : sd.original, sd.current && sd.current !== sd.original ? "started " + sd.original : ""]);
  if (rec.sw + rec.sl) { stats.push(["Major", `${rec.sw}–${rec.sl}`, "series"]); stats.push(["Maps", `${rec.mw}–${rec.ml}`, ""]); }
  const notes = lines.slice(0, 2).map(l => l.text);
  if (!notes.length && wc.length) notes.push("Wildcards: " + wc.map(x => `${x.won ? "W" : "L"} ${x.sf}–${x.sa} ${x.opp}`).join(" · "));
  const ach = pid => { const a = M.achievements(pid)[0]; return a ? `<div class="ti2-ach"><em>${esc(a.place)}</em>${esc(a.event)}</div>` : ""; };
  const ph = (pid, k) => `<div class="ti2-ph p${k}" data-r="r" style="--d:${250 + k * 160}ms">${OD.photo(pid, "", 1.15) || `<div class="phx noph"></div>`}
    <div class="ti2-pn"><div class="nm">${esc(pname(pid))} ${OD.nat(pid)}</div>${ach(pid)}</div></div>`;
  return `<div class="ti2 seq"><div class="tv-pa ti2-pa" data-r="l" style="--d:0ms"></div><div class="ti2-ghost tv-ghost">${esc(t.short)}</div>
    <div class="ti2-l">${tlogo(id) ? `<div class="ti2-logo" data-r="l" style="--d:80ms">${tlogo(id)}</div>` : ""}
      <div class="ti2-k" data-r="l" style="--d:160ms">${esc(r.round)} · team introduction</div>
      <div class="ti2-nm" data-r="l" style="--d:220ms;font-size:${fitPx(t.name, 150, 9)}px">${esc(t.name)}</div>
      ${stats.length ? `<div class="tv-stats">${stats.map(([k, v, sub], n) => `<div class="tv-stat" data-r style="--d:${500 + n * 90}ms"><small>${k}</small><b>${esc(v)}</b>${sub ? `<i>${esc(sub)}</i>` : ""}</div>`).join("")}</div>` : ""}
      ${notes.map((x, n) => `<div class="ti2-note" data-r style="--d:${800 + n * 90}ms">${esc(x)}</div>`).join("")}</div>
    ${t.players.map((pid, k) => ph(pid, k)).join("")}</div>`;
}
function infoPanels(r, view) {
  const M = OD.M, head = id => `<div class="ph-head">${tlogo(id)}<div class="d-s">${esc(OD.tname(id))}</div></div>`;
  if (view === "h2h") { const h = M.h2h(r.t[0], r.t[1]).filter(x => x.id !== r.id), wa = h.filter(x => x.winner === r.t[0]).length, wb = h.filter(x => x.winner === r.t[1]).length;
    // both teams large on angled panels, the series count between them, every previous meeting as a full-width row
    return `<div class="h2 seq"><div class="tv-pa" data-r="l" style="--d:0ms"></div><div class="tv-pb" data-r="r" style="--d:0ms"></div>
      ${[0, 1].map(i => `<div class="h2-t ${i ? "R" : "L"}" data-r="${i ? "r" : "l"}" style="--d:${120 + i * 100}ms">${tlogo(r.t[i])}<div class="nm" style="font-size:${fitPx(OD.tname(r.t[i]), 80, 9)}px">${esc(OD.tname(r.t[i]))}</div></div>`).join("")}
      <div class="h2-mid"><div class="k" data-r style="--d:300ms">Head to head</div><div class="sc" data-r style="--d:420ms"><b class="${wa > wb ? "hi" : ""}">${wa}</b><i>–</i><b class="${wb > wa ? "hi" : ""}">${wb}</b></div><div class="s" data-r style="--d:500ms">${h.length} previous ${h.length === 1 ? "meeting" : "meetings"}</div></div>
      <div class="h2-rows">${h.slice(-4).map((x, n) => `<div class="h2-r" data-r style="--d:${700 + n * 140}ms"><span class="w ${x.winner === r.t[0] ? "on" : ""}">${x.winner === r.t[0] ? "Win" : ""}</span><b class="${x.winner === r.t[0] ? "" : "lo"}">${esc(x.sa)}</b><span class="m"><em>${esc(x.src)}</em>${esc(x.round)}</span><b class="${x.winner === r.t[1] ? "" : "lo"}">${esc(x.sb)}</b><span class="w ${x.winner === r.t[1] ? "on" : ""}">${x.winner === r.t[1] ? "Win" : ""}</span></div>`).join("")}</div></div>`; }
  if (view === "stakes") return `<div class="mu-panels one"><div class="panel" data-r><div class="lbl ac" style="margin-bottom:14px">What's at stake</div><div class="kvs">${stakesOf(r).map(x => `<div class="kv"><span>${esc(x.k)}</span><b>${esc(x.v)}</b></div>`).join("")}</div></div></div>`;
  return `<div class="mu-panels">${r.t.map((id, i) => { const rec = M.record(id);
    return `<div class="panel" data-r style="--i:${i}">${head(id)}<ul class="list">${rec.played.map(x => `<li class="${x.won ? "won" : "lost"}"><em>${x.won ? "W" : "L"} ${esc(x.sf)}–${esc(x.sa)}</em>vs ${esc(OD.tname(x.opp))}<span>${esc(x.r.roundShort)}</span></li>`).join("")}
      ${M.wildcardPath(id).map(x => `<li class="${x.won ? "won" : "lost"}"><em>${x.won ? "W" : "L"} ${esc(x.sf)}–${esc(x.sa)}</em>vs ${esc(x.opp)}<span>Wildcards</span></li>`).join("")}</ul></div>`; }).join("")}</div>`;
}
/* ---------- Road so far: each team's Major journey, converging on the current matchup ----------
   Everything comes from the derived tournament model (Major sheet + producer overrides); nothing is hardcoded. */
function journeyOf(r, id) {
  const M = OD.M, i = r.t.indexOf(id);
  const played = M.record(id).played.filter(p => p.r.id !== r.id && p.r.roundNo < r.roundNo);
  let sw = 0, sl = 0, mw = 0, ml = 0, streak = 0;
  for (const p of played) { if (p.won) { sw++; streak++; } else { sl++; streak = 0; }
    const a = parseInt(p.sf, 10), b = parseInt(p.sa, 10); if (!isNaN(a) && !isNaN(b)) { mw += a; ml += b; } }
  const t = M.team(id), orig = t.seed, cur = r.seed[i];
  return { id, played, sw, sl, mw, ml, streak, orig, cur, lower: played.some(p => !p.won), wc: (M.wcQual || []).includes(id) };
}
const bracketOf = bid => /_UB/.test(bid) ? ["UB", "Upper"] : /_LB/.test(bid) ? ["LB", "Lower"] : ["F", "Finals"];
const roundWord = bid => { const k = OD.roundName(bid, true).replace(/\s*#\d+$/, ""); return k.replace(/^(UB|LB)\s*/, "").replace(/^R(\d)/, "Round $1"); };
function journeyHTML(r) {
  const M = OD.M, J = r.t.map(id => journeyOf(r, id));
  const n = Math.max(1, J[0].played.length, J[1].played.length);
  // rows region y 330–830; rows grow when there are few of them
  const gap = n > 3 ? 12 : 18, rh = Math.min(136, Math.floor((462 - (n - 1) * gap) / n)), total = n * rh + (n - 1) * gap, top = 342 + Math.round((462 - total) / 2);
  const step = 380, base = 700, rowDelay = k => base + k * step, nowDelay = base + n * step + 250;
  const facing = r.bid !== "R6_GF" && !r.loseTo, finalNote = r.bid === "R6_GF" ? "Playing for the title" : null;
  const head = (j, side) => { const t = M.team(j.id), stats = [];
    stats.push(["Record", j.sw + j.sl ? `${j.sw}–${j.sl}` : "0–0"]);
    if (j.mw + j.ml) stats.push(["Maps", `${j.mw}–${j.ml}`]);
    if (j.orig) stats.push(["Seed", j.cur && j.cur !== j.orig ? `${j.cur}<small>from ${j.orig}</small>` : `${j.orig}`]);
    if (j.streak >= 1) stats.push(["Streak", `W${j.streak}`]);
    const chips = [`<span class="jr-chip">${r.bid === "R6_GF" || r.bid === "R5_CF" ? (j.lower ? "From the lower bracket" : "Unbeaten") : j.lower ? "Lower bracket" : "Upper bracket"}</span>`];
    if (facing && j.lower || facing && /_LB|R5_CF/.test(r.bid)) chips.push(`<span class="jr-chip hot">Facing elimination</span>`);
    if (finalNote) chips.push(`<span class="jr-chip hot">${finalNote}</span>`);
    if (j.wc) chips.push(`<span class="jr-chip">Via Wildcards</span>`);
    return `<div class="jr-head ${side}" data-r="${side === "L" ? "l" : "r"}" style="--d:${side === "L" ? 120 : 220}ms">${tlogo(j.id)}
      <div class="jr-hb"><div class="jr-chips">${chips.join("")}</div><div class="jr-name" style="font-size:${Math.round(66 * Math.min(1, 11 / Math.max(1, t.name.length)))}px">${esc(t.name)}</div>
      <div class="jr-stats">${stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div></div></div>`; };
  const row = (j, p, k, side) => { const [bk, bw] = bracketOf(p.r.bid), sc = p.r.forfeit ? (p.won ? "W" : "L") + "<small>FF</small>" : `${esc(p.sf)}<i>–</i>${esc(p.sa)}`;
    return `<div class="jr-row ${p.won ? "won" : "lost"}" data-r="${side === "L" ? "l" : "r"}" style="--d:${rowDelay(k) + (side === "R" ? 120 : 0)}ms;top:${top + k * (rh + gap)}px">
      <div class="jr-rd ${bk}"><span>${bw}</span><b>${esc(roundWord(p.r.bid))}</b></div>
      <div class="jr-opp">${tlogo(p.opp)}<b style="--fit:${Math.min(1, 8.5 / Math.max(1, OD.tname(p.opp).length)).toFixed(2)}">${esc(OD.tname(p.opp))}</b></div>
      <div class="jr-sc">${sc}</div><div class="jr-res">${p.won ? "Win" : "Loss"}</div></div>`; };
  const empty = (j, side) => `<div class="jr-row first" data-r="${side === "L" ? "l" : "r"}" style="--d:${rowDelay(0)}ms;top:${top}px"><div class="jr-first"><b>Opening match</b><span>${j.orig ? "Seed " + j.orig + " · " : ""}first series of the Major</span></div></div>`;
  // spines: from the first row down the inner edge, then turning in to meet above the current matchup
  const y0 = top + rh / 2, yEnd = 826, dur = Math.max(.9, (nowDelay - base) / 1000);
  const spine = side => { const x = side === "L" ? 892 : 1028, dx = side === "L" ? 1 : -1;
    return `<path class="jr-spine" pathLength="1" d="M${x} ${y0} V${yEnd - 30} Q${x} ${yEnd} ${x + dx * 30} ${yEnd} H960"/>`; };
  const ticks = (j, side) => j.played.map((p, k) => { const y = top + k * (rh + gap) + rh / 2, x = side === "L" ? 892 : 1028;
    return `<g class="jr-dot ${p.won ? "won" : ""}" style="--d:${rowDelay(k) + 200}ms"><path d="M${side === "L" ? 862 : 1058} ${y} H${x}"/><rect x="${x - 9}" y="${y - 9}" width="18" height="18" transform="rotate(45 ${x} ${y})"/></g>`; }).join("");
  const live = r.status === "live" || r.winner;
  const now = `<div class="jr-now" data-r style="--d:${nowDelay}ms"><div class="jr-now-k">${live ? (r.winner ? "Final" : "Live now") : "Up now"}</div>
    <div class="jr-now-b">${tlogo(r.t[0])}<div class="jr-now-m"><b>${esc(r.round)}</b><span>${live ? `${esc(r.s1 || 0)}–${esc(r.s2 || 0)}` : `Best of ${esc(r.bo)}${r.at ? " · " + esc(OD.time(r.at)) + " CET" : ""}`}</span></div>${tlogo(r.t[1])}</div></div>`;
  return `<div class="jr" style="--rh:${rh}px;--dur:${dur}s;--d0:${base}ms">
    <div class="jr-title" data-r style="--d:0ms"><span class="lbl">Road to the</span><div class="d-m">${esc(r.round)}</div></div>
    ${head(J[0], "L")}${head(J[1], "R")}
    <svg class="jr-lines" viewBox="0 0 1920 1080" width="1920" height="1080">${spine("L")}${spine("R")}${ticks(J[0], "L")}${ticks(J[1], "R")}</svg>
    <div class="jr-col L">${J[0].played.length ? J[0].played.map((p, k) => row(J[0], p, k, "L")).join("") : empty(J[0], "L")}</div>
    <div class="jr-col R">${J[1].played.length ? J[1].played.map((p, k) => row(J[1], p, k, "R")).join("") : empty(J[1], "R")}</div>
    ${now}</div>`;
}
SC.journeyHTML = journeyHTML;
/* ---------- What's at stake: consequences of the result, built from the bracket structure ----------
   Advancement, elimination placements, guaranteed floors, prize money and next opponents all come from the derived
   bracket (core.js) and the verified prize table. Stages: teams → importance → winner's route → losing. */
const roundTitle = m => m ? OD.roundName(m.bid).replace(/ · Match \d+$/, "") : "";
const oppHTML = (o, d) => { if (!o) return "";
  if (o.kind === "team") return `<div class="sk-opp" data-r style="--d:${d}ms"><span class="k">Next opponent</span><div class="v">${tlogo(o.id)}<b>${esc(OD.tname(o.id))}</b></div></div>`;
  if ((o.kind === "winner" || o.kind === "loser") && o.src && o.src.ready) return `<div class="sk-opp" data-r style="--d:${d}ms"><span class="k">${o.kind === "winner" ? "Winner of" : "Loser of"}</span><div class="v two">${tlogo(o.src.t[0])}<b>${esc(OD.tname(o.src.t[0]))}</b><i>or</i>${tlogo(o.src.t[1])}<b>${esc(OD.tname(o.src.t[1]))}</b></div></div>`;
  if (o.kind === "winner" || o.kind === "loser") return `<div class="sk-opp" data-r style="--d:${d}ms"><span class="k">Next opponent</span><div class="v txt">${o.kind === "winner" ? "Winner" : "Loser"} of the ${esc(roundTitle(o.src))}</div></div>`;
  return ""; };
function routeHTML(r, from, cls, d0) {
  // current match → each remaining stage up to the Grand Final, as connected bracket nodes
  const M = OD.M, route = from ? M.route(from.bid) : [];
  const nodes = [{ m: r, cur: true }].concat(route.map((m, i) => ({ m, next: i === 0 })));
  return `<div class="sk-route ${cls} n${nodes.length}">${nodes.map((n, i) => `${i ? `<i class="sk-ln" data-r="w" style="--d:${d0 + i * 260 - 120}ms"></i>` : ""}<div class="sk-node ${n.cur ? "cur" : ""} ${n.next ? "next" : ""} ${n.m.bid === "R6_GF" ? "gf" : ""}" data-r style="--d:${d0 + i * 260}ms">
      <span class="k">${n.cur ? (cls === "l" ? "Drops to" : "Now") : n.next ? "Next" : n.m.bid === "R6_GF" ? "Final" : "Then"}</span><b>${esc(OD.roundName(n.m.bid, true).replace(/\s*#\d+$/, ""))}</b>${n.m.at && !n.cur ? `<span class="t">${esc(OD.time(n.m.at))}</span>` : ""}</div>`).join("")}</div>`;
}
function stakesHTML(r) {
  const M = OD.M, gf = r.bid === "R6_GF", elim = !r.loseTo && !gf;
  const win = gf ? null : r.winTo ? M.byBid[r.winTo.bid] : null, lose = r.loseTo ? M.byBid[r.loseTo.bid] : null;
  const winFloor = gf ? "1st" : win ? M.floor(win) : null, loseFloor = gf ? "2nd" : lose ? M.floor(lose) : r.elimPlace;
  const pz = p => M.prize(p);
  const team = (i) => { const id = r.t[i];
    return `<div class="sk-team ${i ? "R" : "L"}" data-r="${i ? "r" : "l"}" style="--d:${i * 120}ms">${tlogo(id)}<div class="sk-nm" style="font-size:${Math.round(58 * Math.min(1, 10 / Math.max(1, OD.tname(id).length)))}px">${esc(OD.tname(id))}</div></div>`; };
  const badge = gf ? `<div class="sk-badge title" data-r style="--d:700ms">Title decider</div>` : elim ? `<div class="sk-badge out" data-r style="--d:700ms">Elimination match</div>` : `<div class="sk-badge safe" data-r style="--d:700ms">Second life for the loser</div>`;
  // winner
  const W0 = 1150;
  const prizeBig = (p, d, cls) => pz(p) ? `<div class="sk-prize ${cls}" data-r style="--d:${d}ms"><span>Prize money</span><b>${esc(pz(p))}</b></div>` : "";
  const winBody = gf ? `<div class="sk-big" data-r style="--d:${W0 + 200}ms">Champions</div><div class="sk-sub" data-r style="--d:${W0 + 350}ms">OverDrive Major winners</div>${prizeBig("1st", W0 + 550, "go")}`
    : `<div class="sk-head" data-r style="--d:${W0 + 100}ms">Advances to the <b>${esc(roundTitle(win))}</b></div>${routeHTML(r, r.winTo, "w", W0 + 250)}${oppHTML(M.opponentFor(r.winTo), W0 + 250 + 520)}`;
  const winFoot = winFloor && !gf ? `<div class="sk-foot" data-r style="--d:${W0 + 900}ms"><span>${gf ? "Finishes" : "Guaranteed"}</span><b>${esc(gf ? "1st" : winFloor + " or better")}</b>${pz(winFloor) ? `<em>${esc(pz(winFloor))}${gf ? "" : "<small>at least</small>"}</em>` : ""}</div>` : "";
  // loser
  const L0 = W0 + 1500;
  const loseBody = (elim || gf) ? `<div class="sk-place" data-r style="--d:${L0 + 150}ms">${esc(loseFloor || "")}</div><div class="sk-sub" data-r style="--d:${L0 + 300}ms">${gf ? "Runners-up" : "Eliminated · tournament over"}</div>${prizeBig(loseFloor, L0 + 500, "")}`
    : `<div class="sk-head" data-r style="--d:${L0 + 100}ms">Drops to the <b>${esc(roundTitle(lose))}</b></div>${routeHTML(lose, lose.winTo, "l", L0 + 250).replace('class="sk-node cur', 'class="sk-node cur drop')}${oppHTML(M.opponentFor(r.loseTo), L0 + 700)}`;
  const loseFoot = loseFloor && !(elim || gf) ? `<div class="sk-foot" data-r style="--d:${L0 + 600}ms"><span>${elim || gf ? "Final placement" : "Still guaranteed"}</span><b>${esc(elim || gf ? loseFloor : loseFloor + " or better")}</b>${pz(loseFloor) ? `<em>${esc(pz(loseFloor))}</em>` : ""}</div>` : "";
  return `<div class="sk ${elim ? "elim" : ""} ${gf ? "gf" : ""}">
    <div class="tv-pa" data-r="l" style="--d:0ms"></div><div class="tv-pb" data-r="r" style="--d:0ms"></div>
    ${team(0)}${team(1)}
    <div class="sk-title"><div class="k" data-r style="--d:450ms">${esc(r.round)} · Best of ${esc(r.bo)}</div><div class="h" data-r style="--d:520ms">What's at stake</div>${badge}</div>
    <div class="sk-split">
      <div class="sk-side win" data-r="w" style="--d:${W0 - 150}ms"><div class="sk-tag" data-r="l" style="--d:${W0}ms"><b>Win</b></div><div class="sk-body">${winBody}</div>${winFoot}</div>
      <div class="sk-side lose" data-r="w" style="--d:${L0 - 150}ms"><div class="sk-tag" data-r="r" style="--d:${L0}ms"><b>Lose</b></div><div class="sk-body">${loseBody}</div>${loseFoot}</div>
    </div></div>`;
}
SC.stakesHTML = stakesHTML;

SC.matchup = (root, preview) => {
  const F = mountFS(root, "bar", "mu");
  OD.onState(s => {
    const sc = s.scenes.matchup, st = preview ? sc.preview : sc.live, r = OD.M.active;
    F.bg(sc.bg); F.chrome(r ? "Matchup" : "");
    let view = st.view; if (!SC.matchupViews(r).includes(view)) view = "versus";
    if (!r || !r.ready) { F.bar(""); return F.show("empty", ""); }
    F.bar(barHTML([r.round, "Best of " + r.bo].concat(r.at && !r.winner ? [OD.day(r.at) + " · " + OD.time(r.at) + " CET"] : [])));
    const top = `<div class="mu-top" data-r><div class="d-m">${esc(r.round)}</div></div>`;
    if (view === "stakes") return F.show(r.id + ":stakes:" + (r.winTo ? r.winTo.bid : ""), stakesHTML(r), 4600);
    if (view === "path") { const h = journeyHTML(r); return F.show(r.id + ":path", h, 1000 + (Math.max(1, ...r.t.map(id => journeyOf(r, id).played.length)) + 2) * 380 + 900); }
    const html = view === "versus" ? top + `<div class="vs-grid">${versusHTML(r)}</div>` : view === "intro0" ? introHTML(r, 0) : view === "intro1" ? introHTML(r, 1) : view === "h2h" ? infoPanels(r, view) : top + infoPanels(r, view);
    F.show(r.id + ":" + view, html);
  });
};

/* ======================================================================= player information */
SC.playerAvailable = (view, p) => { const M = OD.M; return view === "compare" ? !!(M.player(p.a) && M.player(p.b)) : !!M.player(p.pid); };
const honours = (pid, n) => OD.M.achievements(pid).slice(0, n);
function showcase(pid, opts) {
  // the original OverDrive showcase: identity on the left, a full-height portrait panel with an accent edge on the right
  const M = OD.M, p = M.player(pid); if (!p) return "";
  const t = M.teamOfPlayer(pid), v = M.vplayer(pid), age = M.age(pid), wins = M.wins(pid).filter(r => /tier 1/i.test(r.tier)).length;
  const stats = opts.stats ? [v && v.earnings ? ["Career prize money", v.earnings, 1] : null, age ? ["Age", age] : null, wins ? [wins === 1 ? "Tier 1 title" : "Tier 1 titles", wins] : null].filter(Boolean) : [];
  const who = [v && v.realName, v && v.country || p.nat].filter(Boolean).join(" · ");
  const ach = honours(pid, opts.rows || 5);
  return `<div class="sc2 seq">${M.photo(pid) ? `<div class="tv-ph" data-r="r" style="--d:0ms">${OD.photo(pid, "", 1.05)}<div class="sc2-ghost">${esc(opts.ghost || p.name)}</div></div><div class="tv-edge" data-r="r" style="--d:60ms"></div>` : ""}
    <div class="sc2-l">${opts.tag || ""}
      ${t ? `<div class="sc2-team" data-r="l" style="--d:120ms">${tlogo(t.id)}<b>${esc(t.name)}</b>${OD.nat(pid)}</div>` : ""}
      <div class="sc2-nm" data-r="l" style="--d:200ms;font-size:${fitPx(p.name, 196, 7)}px">${esc(p.name)}</div>
      ${who && !opts.noWho ? `<div class="sc2-who" data-r="l" style="--d:280ms">${esc(who)}</div>` : ""}
      ${opts.mid || ""}
      ${stats.length ? `<div class="tv-stats">${stats.map(([k, b, hot], n) => `<div class="tv-stat" data-r style="--d:${420 + n * 90}ms"><small>${esc(k)}</small><b class="${hot ? "hot" : ""}">${esc(b)}</b></div>`).join("")}</div>` : ""}
      ${ach.length && opts.rows ? `<div class="tv-list" data-r style="--d:700ms"><h3>Honours</h3>${ach.map(a => `<div class="r"><span>${esc(yr(a.date))}</span><b class="${/^1st/.test(a.place) ? "gold" : ""}">${esc(a.place)}</b><i>${esc(a.event)}</i></div>`).join("")}</div>` : ""}
      ${v && opts.src !== false ? `<div class="sc2-src" data-r style="--d:900ms">Source: Liquipedia, read 9–10 Nov 2026</div>` : ""}</div></div>`;
}
const profileHTML = pid => showcase(pid, { stats: true, rows: 5 });
function compareHTML(a, b) {
  // two portraits on the outer edges, the comparison as large left/right values around a centre label
  const M = OD.M; if (!M.player(a) || !M.player(b)) return "";
  const info = pid => { const v = M.vplayer(pid), t = M.teamOfPlayer(pid), best = honours(pid, 1)[0];
    return { t, earn: v && v.earnings, age: M.age(pid), wins: M.wins(pid).filter(r => /tier 1/i.test(r.tier)).length, best: best ? best.place + " " + best.event : null, nat: OD.natCode(M.player(pid).nat) }; };
  const A = info(a), B = info(b);
  const rows = [["Team", A.t ? `${tlogo(A.t.id)}${esc(A.t.short || A.t.name)}` : "—", B.t ? `${esc(B.t.short || B.t.name)}${tlogo(B.t.id)}` : "—", 1],
    A.nat || B.nat ? ["Nation", esc(A.nat || "—"), esc(B.nat || "—")] : null,
    A.age || B.age ? ["Age", esc(A.age || "—"), esc(B.age || "—")] : null,
    A.earn || B.earn ? ["Prize money", esc(A.earn || "—"), esc(B.earn || "—"), 0, 1] : null,
    ["Tier 1 titles", A.wins, B.wins],
    A.best || B.best ? ["Best result", esc(A.best || "—"), esc(B.best || "—"), 0, 0, 1] : null].filter(Boolean);
  const ph = (pid, cls, d) => `<div class="cp-ph ${cls}" data-r="${cls === "a" ? "l" : "r"}" style="--d:${d}ms">${OD.photo(pid, "", 1.1) || `<div class="phx noph"></div>`}<div class="cp-nm">${esc(pname(pid))}</div></div>`;
  return `<div class="cp seq">${ph(a, "a", 0)}${ph(b, "b", 120)}
    <div class="cp-mid"><div class="k" data-r style="--d:250ms">Player comparison</div><div class="h" data-r style="--d:320ms"><span>${esc(pname(a))}</span><i>vs</i><span>${esc(pname(b))}</span></div>
      ${rows.map(([k, x, y, logo, hot, small], n) => `<div class="cp-r ${small ? "sm" : ""}" data-r style="--d:${520 + n * 110}ms"><b class="${hot ? "hot" : ""}">${x}</b><span>${esc(k)}</span><b class="${hot ? "hot" : ""}">${y}</b></div>`).join("")}
      <div class="sc2-src" data-r style="--d:1200ms;text-align:center">Source: Liquipedia, read 9–10 Nov 2026</div></div></div>`;
}
SC.player = (root, preview) => {
  const F = mountFS(root, "bar", "pl");
  OD.onState(s => {
    const sc = s.scenes.player, st = preview ? sc.preview : sc.live, p = st.params || {};
    F.bg(sc.bg); F.chrome(SC.playerAvailable(st.view, p) ? (st.view === "compare" ? "Player comparison" : "Player profile") : "");
    const html = st.view === "compare" ? compareHTML(p.a, p.b) : profileHTML(p.pid);
    F.bar(html ? barHTML(eventLine().slice(0, 2)) : "");
    F.show(st.view + ":" + (p.pid || p.a + "-" + p.b), html);
  });
};

/* ======================================================================= map information */
function poolHTML(cur) {
  const maps = OD.M.maps(); if (!maps.length) return "";
  return `<div class="mu-top" style="top:150px" data-r><div class="d-m">Map pool</div><div class="lbl">TMWT Duos · five maps</div></div>
    <div class="maps-row">${maps.map((m, i) => `<div class="mcard tile${cur === m.id ? " cur" : ""}" data-r style="--i:${i + 1}">${cur === m.id ? `<span class="now">Now playing</span>` : ""}
      <div class="img" style="${m.photo ? `background-image:url('${esc(m.photo)}')` : ""}"></div><div class="cap"><div class="d-s">${esc(m.name)}</div><div class="lbl" style="font-size:15px">Author ${esc(m.author)}</div></div></div>`).join("")}</div>`;
}
function mapHTML(id) {
  // the map's own screenshot fills the frame; name, author time and the field's fastest campaign times sit on a dark panel
  const M = OD.M, m = M.maps().find(x => x.id === id); if (!m) return "";
  const r = M.active, inMatch = r ? r.t.filter(Boolean).flatMap(t => M.team(t).players.map(pid => norm(pname(pid)))) : [];
  const hl = h => inMatch.includes(norm(h)) || inMatch.includes(norm(h) + "tm");
  const logoOf = h => { const p = M.playerByHandle(h), t = p && M.teamOfPlayer(p.id); return t ? tlogo(t.id) : ""; };
  return `<div class="mp2 seq">${m.photo ? `<div class="mp2-shot" data-r="l" style="--d:0ms;background-image:url('${esc(m.photo)}')"></div>` : ""}<div class="mp2-pa" data-r="r" style="--d:100ms"></div>
    <div class="mp2-i"><div class="k" data-r style="--d:200ms">Map</div><div class="nm" data-r style="--d:260ms;font-size:${fitPx(m.name, 150, 8)}px">${esc(m.name)}</div>
      <div class="tv-stats"><div class="tv-stat" data-r style="--d:400ms"><small>Author time</small><b>${esc(m.author)}</b></div></div>
      ${m.pbs.length ? `<div class="tv-list pb" data-r style="--d:600ms"><h3>Fastest in the field · campaign PBs</h3>${m.pbs.slice(0, 5).map(([h, t], n) => `<div class="r ${hl(h) ? "hl" : ""}"><span>${n + 1}</span><b class="gold">${esc(t)}</b><i>${logoOf(h)}${esc(h)}</i></div>`).join("")}</div>
        <div class="sc2-src" data-r style="--d:800ms">${esc(M.mapsSource)}</div>` : ""}</div></div>`;
}
SC.maps = (root, preview) => {
  const F = mountFS(root, "bar", "mp");
  OD.onState(s => {
    const sc = s.scenes.maps, st = preview ? sc.preview : sc.live, p = st.params || {};
    const html = st.view === "map" ? mapHTML(p.id) : poolHTML(p.current);
    F.bg(sc.bg); F.chrome(html ? "Maps" : ""); F.bar(html ? barHTML(["OverDrive Major", "TMWT Duos", "Bo5"]) : "");
    F.show(st.view + ":" + (p.id || p.current || ""), html);
  });
};

/* ======================================================================= post-match / MVP */
function resultHTML(r) {
  if (!r || !r.winner) return "";
  const M = OD.M, gf = r.bid === "R6_GF";
  const side = i => { const id = r.t[i], w = r.winner === id;
    return `<div class="rs-t ${i ? "R" : "L"} ${w ? "w" : "l"}" data-r="${i ? "r" : "l"}" style="--d:${150 + i * 100}ms">${w ? `<span class="rs-tag">Winner</span>` : ""}${tlogo(id)}<div class="nm" style="font-size:${fitPx(OD.tname(id), 96, 9)}px">${esc(OD.tname(id))}</div></div>`; };
  const win = r.winTo ? M.byBid[r.winTo.bid] : null, lose = r.loseTo ? M.byBid[r.loseTo.bid] : null;
  const out = (cls, team, txt, extra, d) => `<div class="rs-o ${cls}" data-r style="--d:${d}ms">${tlogo(team)}<div><b>${esc(OD.tname(team))}</b><span>${txt}</span></div>${extra ? `<em>${esc(extra)}</em>` : ""}</div>`;
  const wTxt = gf ? "OverDrive Major champions" : win ? "advance to the " + esc(roundTitle(win)) : "advance";
  const lTxt = gf ? "finish 2nd" : lose ? "drop to the " + esc(roundTitle(lose)) : "eliminated · " + esc(r.elimPlace || "");
  return `<div class="rs seq"><div class="tv-pa" data-r="l" style="--d:0ms"></div><div class="tv-pb" data-r="r" style="--d:0ms"></div>
    <div class="rs-top"><div class="k" data-r style="--d:100ms">Final result</div><div class="h" data-r style="--d:160ms">${esc(r.round)}</div></div>
    ${side(0)}${side(1)}
    <div class="rs-sc" data-r style="--d:500ms"><b class="${r.winner === r.t[0] ? "" : "lo"}">${r.forfeit ? (r.winner === r.t[0] ? "W" : "FF") : esc(r.s1)}</b><i>–</i><b class="${r.winner === r.t[1] ? "" : "lo"}">${r.forfeit ? (r.winner === r.t[1] ? "W" : "FF") : esc(r.s2)}</b></div>
    <div class="rs-out">${out("go", r.winner, wTxt, gf ? M.prize("1st") : "", 900)}${out(lose || gf ? "" : "stop", r.loser, lTxt, (gf || !lose) ? M.prize(gf ? "2nd" : r.elimPlace) : "", 1050)}</div></div>`;
}
function mvpHTML(r, pid) {
  const M = OD.M, p = M.player(pid); if (!p || !r) return "";
  const res = r.winner ? `<div class="mvp2-res" data-r style="--d:420ms">${tlogo(r.winner)}<b>${esc(OD.tname(r.winner))}</b><span>${winnerFirst(r)}</span><b class="lo">${esc(OD.tname(r.loser))}</b>${tlogo(r.loser)}</div>`
    : `<div class="mvp2-res" data-r style="--d:420ms">${tlogo(r.t[0])}<b>${esc(OD.tname(r.t[0]))}</b><span>vs</span><b>${esc(OD.tname(r.t[1]))}</b>${tlogo(r.t[1])}</div>`;
  return showcase(pid, { ghost: "MVP", noWho: true, stats: true, rows: 0, tag: `<div class="mvp2-tag" data-r="l" style="--d:60ms"><small>${esc(r.round)}</small><b>Match MVP</b></div>`, mid: res });
}
SC.post = (root, preview) => {
  const F = mountFS(root, "bar", "po");
  OD.onState(s => {
    const sc = s.scenes.post, st = preview ? sc.preview : sc.live, p = st.params || {}, r = OD.M.active;
    const html = st.view === "mvp" ? mvpHTML(r, p.pid) : resultHTML(r);
    F.bg(sc.bg); F.chrome(html ? (st.view === "mvp" ? "Most valuable player" : "Post-match") : ""); F.bar(html ? barHTML(eventLine().slice(0, 2)) : "");
    F.show(st.view + ":" + (r ? r.id : "") + ":" + (p.pid || "") + ":" + (r && r.winner ? r.s1 + r.s2 : ""), html);
  });
};

/* ======================================================================= caster desk: two persistent cameras, solo or dual */
SC.DESK = {
  solo: { video: "desk-solo", slots: [{ x: 427, y: 207, w: 1067, h: 600, ph: 58 }] },
  duo: { video: "desk-duo", slots: [{ x: 177, y: 308, w: 730, h: 408, ph: 58 }, { x: 1013, y: 308, w: 730, h: 408, ph: 58 }] }
};
/* ---------- desk presentation states: information placed around the fixed camera frames ----------
   Dual: a header above the cameras and a band under them (one wing under each camera).
   Solo: a header above the camera and a column either side of it. The cameras never move, so the desk loop's
   baked-in frames and any local OBS camera sources stay aligned in every state. */
const DESK_VIEWS = { clean: "Clean desk", upcoming: "Upcoming matchup", stats: "Tournament stats", others: "Other matches", pred: "Predictions" };
SC.DESK_VIEWS = DESK_VIEWS;
SC.deskViewOk = (view, s) => { const M = OD.M, r = M && M.active;
  if (view === "clean") return true;
  if (view === "others") return deskOthers(r).res.length + deskOthers(r).next.length > 0;
  if (!r || !r.ready) return false;
  if (view === "pred") return Object.values(((s.pred.byMatch[r.id] || {}).picks) || {}).some(p => r.t.includes(p.team));
  return true; };
function deskOthers(r) { const M = OD.M, not = x => !r || x.id !== r.id;
  return { res: M.list.filter(x => x.winner && not(x)).slice(-4).reverse(), next: M.list.filter(x => x.ready && !x.winner && not(x)).slice(0, 4) }; }
const dpTeam = (r, i, orient, d) => { const M = OD.M, id = r.t[i], t = M.team(id), j = journeyOf(r, id);
  const line = [j.orig ? (j.cur && j.cur !== j.orig ? `Seed ${j.cur} · from ${j.orig}` : `Seed ${j.orig}`) : null, `Major ${j.sw}–${j.sl}`].filter(Boolean).join(" · ");
  return `<div class="dp-team ${orient}" data-r="${i ? "r" : "l"}" style="--i:${d}">${tlogo(id)}<div class="dp-tb"><div class="dp-nm">${esc(t.name)}</div><div class="dp-ln">${esc(line)}</div></div></div>`; };
const dpStats = (r, i, d) => { const id = r.t[i], j = journeyOf(r, id);
  const st = [["Record", `${j.sw}–${j.sl}`], ["Maps", `${j.mw}–${j.ml}`], ["Seed", j.orig ? (j.cur && j.cur !== j.orig ? `${j.cur}<small>/${j.orig}</small>` : `${j.orig}`) : "—"], ["Streak", j.streak ? "W" + j.streak : "—"]];
  const status = r.bid === "R6_GF" ? "Playing for the title" : !r.loseTo ? "Facing elimination" : j.lower ? "Lower bracket" : "Upper bracket";
  return `<div class="dp-st" data-r="${i ? "r" : "l"}" style="--i:${d}"><div class="dp-sth">${tlogo(id)}<b>${esc(OD.tname(id))}</b><span class="${!r.loseTo ? "hot" : ""}">${esc(status)}</span></div>
    <div class="dp-stg">${st.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div></div>`; };
const dpMatch = (x, d) => { const sc = x.winner || x.status === "live";
  return `<div class="dp-m ${x.status === "live" ? "live" : ""}" data-r style="--i:${d}"><span class="rd">${esc(x.roundShort)}</span>
    <span class="a ${x.winner && x.winner !== x.t[0] ? "l" : ""}"><b>${esc(OD.tname(x.t[0]))}</b>${tlogo(x.t[0])}</span>
    <span class="sc">${sc ? scoreTxt(x) : esc(OD.time(x.at))}</span>
    <span class="b ${x.winner && x.winner !== x.t[1] ? "l" : ""}">${tlogo(x.t[1])}<b>${esc(OD.tname(x.t[1]))}</b></span></div>`; };
const dpPick = (r, c, p, sealed, d) => { if (!c) return "";
  if (!p || !p.team || !r.t.includes(p.team)) return `<div class="dp-pk none" data-r style="--i:${d}"><div class="who">${esc(c.name)}</div><div class="none">No pick yet</div></div>`;
  const i = r.t.indexOf(p.team), score = p.s1 != null && p.s2 != null ? (i ? `${p.s2}–${p.s1}` : `${p.s1}–${p.s2}`) : "";
  return `<div class="dp-pk ${sealed ? "sealed" : ""}" data-r style="--i:${d}"><div class="who"><small>${sealed ? "Not revealed yet" : "Predicts"}</small>${esc(c.name)}</div>
    ${tlogo(p.team)}<div class="tm"><b>${esc(OD.tname(p.team))}</b>${score ? `<span>${esc(score)}</span>` : ""}</div></div>`; };
function deskPanelHTML(view, s, lay, cams, preview) {
  const M = OD.M, r = M.active;
  if (view === "clean" || !SC.deskViewOk(view, s)) return "";
  const head = (k, t, sub) => `<div class="dp-head ${lay}" data-r style="--i:0"><span class="k">${esc(k)}</span><div class="t">${esc(t)}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  const when = r && r.ready ? (r.status === "live" ? `Live · ${scoreTxt(r)}` : r.winner ? `Final · ${scoreTxt(r)}` : `Best of ${esc(r.bo)}${r.at ? " · " + esc(OD.day(r.at)) + " · " + esc(OD.time(r.at)) + " CET" : ""}`) : "";
  const wings = (a, b) => `<div class="dp-w ${lay} A">${a}</div><div class="dp-w ${lay} B">${b}</div>`;
  const o = lay === "solo" ? "v" : "h";
  if (view === "upcoming") return head(r.status === "live" ? "Live now" : r.winner ? "Result" : "Up next", r.round, when) + wings(dpTeam(r, 0, o, 1), dpTeam(r, 1, o + " R", 2)) + (lay === "duo" ? `<div class="dp-vs" data-r style="--i:2">VS</div>` : "");
  if (view === "stats") { const done = M.list.filter(x => x.winner), maps = done.reduce((n, x) => n + (parseInt(x.s1, 10) || 0) + (parseInt(x.s2, 10) || 0), 0),
      sweeps = done.filter(x => /^[03]$/.test(String(x.s1)) && /^[03]$/.test(String(x.s2)) && x.s1 !== x.s2).length;
    return head("Tournament so far", `${OD.tname(r.t[0])} vs ${OD.tname(r.t[1])}`, `${done.length} series · ${maps} maps played · ${sweeps} sweeps`) + wings(dpStats(r, 0, 1), dpStats(r, 1, 2)); }
  if (view === "others") { const O = deskOthers(r), n = lay === "solo" ? 4 : 2;
    const col = (title, xs, d) => `<div class="dp-ol"><div class="dp-ot" data-r style="--i:${d}">${title}</div>${xs.slice(0, n).map((x, k) => dpMatch(x, d + 1 + k)).join("") || `<div class="dp-none" data-r style="--i:${d + 1}">None</div>`}</div>`;
    return head("Around the Major", "Other matches", r && r.ready ? `Excluding ${esc(OD.tname(r.t[0]))} vs ${esc(OD.tname(r.t[1]))}` : "") + wings(col("Results", O.res, 1), col("Live & up next", O.next, 2)); }
  if (view === "pred") { const picks = (s.pred.byMatch[r.id] || {}).picks || {}, show = c => c && picks[c.id];
    // dual: each pick under its caster's camera · solo: the on-camera caster, then the other caster if they picked
    let list = cams.filter(Boolean);
    if (lay === "solo") { const other = s.casters.find(c => c.name && !list.includes(c) && picks[c.id] && picks[c.id].team); if (other) list = list.concat(other); }
    const pk = (c, d) => c && c.name ? dpPick(r, c, show(c), preview && !(show(c) || {}).revealed, d) : "";
    return head("Caster predictions", `${OD.tname(r.t[0])} vs ${OD.tname(r.t[1])}`, esc(r.round) + " · who wins?") + wings(pk(list[0], 1), pk(list[1], 2)); }
  return "";
}
SC.desk = (root, preview) => {
  root.innerHTML = `<div class="stage desk" id="st"><video id="vid" muted loop autoplay playsinline></video><div id="cams"></div><div id="frames"></div><div id="lts"></div><div class="dp view" id="dp"></div><div id="decor"></div></div>`;
  const dp = root.querySelector("#dp"), ltEl = root.querySelector("#lts"), pgm = /(^|[#&])pgm(&|$)/.test(location.hash);
  let dpKey = null, dpHTML = null, dpOut = null, dpSet = null, lastLt = "";
  const swap = (k, h) => {                                  // same motion as the full-screen views: out, then staggered in
    if (k === dpKey) { if (h !== dpHTML) { dpHTML = h; dp.innerHTML = h; } return; }
    const first = dpKey === null; dpKey = k; dpHTML = h; clearTimeout(dpOut); clearTimeout(dpSet);
    const put = () => { dp.className = "dp view"; dp.innerHTML = h; void dp.offsetWidth; dp.className = "dp view in"; dpSet = setTimeout(() => dp.classList.add("settled"), 1600); };
    if (first || !dp.innerHTML) put(); else { dp.className = "dp view out"; dpOut = setTimeout(put, 280); }
  };
  const st = root.querySelector("#st"), vid = root.querySelector("#vid"), camsEl = root.querySelector("#cams"), frEl = root.querySelector("#frames"), decor = root.querySelector("#decor");
  OD.fit(st);
  let PRIV = null, privRev = null, lastFrames = "", lastDecor = "";
  const iframes = {};                                       // camera id → iframe, kept alive across solo/dual switches
  const loadPriv = async s => { if (s.privRev === privRev) return; privRev = s.privRev; PRIV = await OD.getPrivate(); render(OD.S); };
  function render(s) {
    const d = s.desk, L = SC.DESK[d.layout] || SC.DESK.duo, ids = (s.deskProfiles[d.layout] || []).slice(0, L.slots.length);
    const want = d.bg ? OD.brand(L.video) : null;
    vid.style.display = want ? "" : "none";
    if (want && vid.getAttribute("src") !== want) { vid.setAttribute("src", want); vid.play().catch(() => {}); }
    if (!want && vid.getAttribute("src")) { vid.pause(); vid.removeAttribute("src"); vid.load(); }
    // Integrated: both cameras load once and stay connected (solo ↔ dual just moves them).
    // Local OBS mode: no VDO.Ninja connection at all from this page; the openings stay transparent.
    const integrated = d.mode === "integrated" && d.cams && !preview && PRIV;
    st.classList.toggle("local", d.mode !== "integrated");
    const casters = Object.fromEntries((s.casters || []).map(c => [c.id, c]));
    const needed = new Set(integrated ? ["c1", "c2"].filter(id => d.preload || ids.includes(id)) : []);
    for (const id of Object.keys(iframes)) if (!needed.has(id) || !(PRIV && (PRIV.casters[id] || {}).vdo)) { iframes[id].remove(); delete iframes[id]; }
    for (const id of needed) {
      const vdo = (PRIV.casters[id] || {}).vdo; if (!vdo) continue;
      let f = iframes[id];
      if (!f) { f = iframes[id] = document.createElement("div"); f.className = "cam"; f.innerHTML = `<iframe allow="autoplay; camera; microphone; fullscreen" src="${esc(vdo)}"></iframe>`; camsEl.appendChild(f); }
      else if (f.firstElementChild.getAttribute("src") !== vdo) f.firstElementChild.setAttribute("src", vdo);
      const i = ids.indexOf(id), crop = (casters[id] || {}).crop || { x: 0, y: 0, zoom: 1 };
      if (i >= 0) { const sl = L.slots[i]; Object.assign(f.style, { left: sl.x + "px", top: sl.y + "px", width: sl.w + "px", height: sl.h + "px" }); f.className = "cam"; }
      else f.className = "cam parked";
      f.firstElementChild.style.transform = `translate(${crop.x}%, ${crop.y}%) scale(${crop.zoom})`;
    }
    // frames & nameplates (the desk loop carries its own frames and plate bars; drawn here only without it)
    const r = OD.M.active, picks = r && s.pred.visible && (s.pred.matchId || s.active) === r.id ? ((s.pred.byMatch[r.id] || {}).picks || {}) : {};
    let fr = "";
    L.slots.forEach((sl, i) => {
      const c = casters[ids[i]];
      if (d.frames && !d.bg) fr += `<div class="dframe" style="left:${sl.x - 2}px;top:${sl.y - 2}px;width:${sl.w + 4}px;height:${sl.h + sl.ph + 4}px"></div><div class="dbar" style="left:${sl.x}px;top:${sl.y + sl.h}px;width:${sl.w}px;height:${sl.ph}px"></div>`;
      if (d.plates && c && c.name) fr += `<div class="plate" style="left:${sl.x}px;top:${sl.y + sl.h}px;width:${sl.w}px;height:${sl.ph}px"><b>${esc(c.name)}</b>${c.role || c.handle ? `<span>${esc(c.role)}${c.role && c.handle ? " · " : ""}${c.handle ? esc(c.handle) : ""}</span>` : ""}</div>`;
      const pk = c && picks[c.id];
      if (pk && pk.team && pk.revealed) fr += `<div class="pick" style="right:${1920 - (sl.x + sl.w - 14)}px;top:${sl.y + 14}px">${OD.logo(pk.team, "lg")}<div><small>Prediction</small><b>${esc(OD.tname(pk.team))}</b></div></div>`;
      if (preview && !c?.name) fr += `<div class="pv-hole" style="left:${sl.x}px;top:${sl.y}px;width:${sl.w}px;height:${sl.h}px">Camera ${ids[i] === "c2" ? 2 : 1}: no caster name set</div>`;
    });
    if (fr !== lastFrames) { frEl.innerHTML = fr; lastFrames = fr; }
    let dc = "";
    if (d.decor && r && r.ready) dc = `<div class="dstrip"><span class="k">${r.status === "live" ? "Live" : r.winner ? "Result" : "Up next"}</span>${OD.logo(r.t[0], "lg")}<b>${esc(OD.tname(r.t[0]))}</b>${r.winner || r.status === "live" ? `<span class="sc">${scoreTxt(r)}</span>` : `<i>vs</i>`}<b>${esc(OD.tname(r.t[1]))}</b>${OD.logo(r.t[1], "lg")}<span class="rd">${esc(r.round)}${!r.winner && r.status !== "live" && r.at ? " · " + esc(OD.time(r.at)) + " CET" : ""}</span></div>`;
    if (dc !== lastDecor) { decor.innerHTML = dc; lastDecor = dc; }
    // presentation state around the cameras (never changes on its own: preview → Take → live)
    const view = preview && !pgm ? s.deskShow.preview : s.deskShow.live;
    const ph = deskPanelHTML(view, s, d.layout === "solo" ? "solo" : "duo", ids.map(id => casters[id]), preview && !pgm);
    swap(view + ":" + d.layout + ":" + (r ? r.id : ""), ph);
    // optional lower thirds: large name straps over the bottom of each camera
    let lt = "";
    if (s.deskShow.lt) L.slots.forEach((sl, i) => { const c = casters[ids[i]]; if (!c || !c.name) return;
      lt += `<div class="dlt ${d.layout}" style="left:${sl.x + 26}px;top:${sl.y + sl.h - (d.layout === "solo" ? 128 : 112)}px"><b>${esc(c.name)}</b>${c.role || c.handle ? `<span>${c.role ? `<i>${esc(c.role)}</i>` : ""}${c.handle ? `<em>${esc(c.handle)}</em>` : ""}</span>` : ""}</div>`; });
    if (lt !== lastLt) { ltEl.innerHTML = lt; lastLt = lt; }
  }
  OD.onState(s => { loadPriv(s); render(s); });
};

/* ======================================================================= caster predictions */
SC.predHTML = (s, preview) => {
  // full-screen: one half per caster, each with their pick as a large team logo, name and optional score
  const M = OD.M, mid = s.pred.matchId || s.active, r = M.byId[mid];
  if (!r || !r.ready || (!s.pred.visible && !preview)) return "";
  const picks = (s.pred.byMatch[mid] || {}).picks || {};
  const casters = (s.casters || []).filter(c => c.name && picks[c.id] && r.t.includes(picks[c.id].team)).slice(0, 2);
  if (!casters.length) return "";
  const col = (c, k) => { const p = picks[c.id], show = p.revealed || preview, i = r.t.indexOf(p.team);
    const score = p.s1 != null && p.s2 != null ? (i ? `${p.s2}–${p.s1}` : `${p.s1}–${p.s2}`) : "";
    let res = ""; if (r.winner && p.revealed) res = `<span class="pr-acc ${p.team === r.winner ? "ok" : "no"}">${p.team === r.winner ? "Called it" : "Missed"}</span>`;
    return `<div class="pr-c ${casters.length === 1 ? "one" : k ? "R" : "L"} ${show ? "" : "sealed"} ${preview && !p.revealed ? "pv" : ""}" data-r="${k ? "r" : "l"}" style="--d:${300 + k * 250}ms">
      <div class="who">${esc(c.name)}</div><div class="lb">predicts</div>
      ${show ? `${tlogo(p.team)}<div class="tm" style="font-size:${fitPx(OD.tname(p.team), 84, 9)}px">${esc(OD.tname(p.team))}</div>${score ? `<div class="scr">${esc(score)}</div>` : ""}${res}` : `<div class="seal">Sealed</div>`}</div>`; };
  return `<div class="pr2 seq in">${casters.length > 1 ? `<div class="tv-pa" data-r="l" style="--d:0ms"></div><div class="tv-pb" data-r="r" style="--d:0ms"></div>` : `<div class="tv-pa one" data-r style="--d:0ms"></div>`}
    <div class="pr2-top"><div class="k" data-r style="--d:80ms">Caster predictions · ${esc(r.round)}</div><div class="h" data-r style="--d:140ms">Who wins?</div>
      <div class="mu" data-r style="--d:200ms">${tlogo(r.t[0])}<b>${esc(OD.tname(r.t[0]))}</b><i>vs</i><b>${esc(OD.tname(r.t[1]))}</b>${tlogo(r.t[1])}</div></div>
    ${casters.map(col).join("")}</div>`;
};
SC.predictions = (root, preview) => {
  const F = mountFS(root, "bar", "prd");
  OD.onState(s => { const html = SC.predHTML(s, preview), mid = s.pred.matchId || s.active;
    F.bg(!!html && s.scenes.matchup.bg !== false); F.chrome(html ? "Caster predictions" : ""); F.bar("");
    F.show(html ? "pred:" + mid : "none", html.replace('class="pr2 seq in"', 'class="pr2 seq"'), 2200); });
};

/* ======================================================================= break screens (Starting soon / BRB / Ending) */
SC.breakPanels = s => {
  const M = OD.M, P = s.brk.panels, out = [];
  const next = nextUp(M);
  if (P.next && next && next.ready) out.push({ k: "next", r: next });
  if (P.live && M.list.some(r => r.status === "live")) out.push({ k: "live" });
  if (P.upcoming && M.list.some(r => !r.winner && r.status === "upcoming")) out.push({ k: "upcoming" });
  if (P.results && M.list.some(r => r.winner)) out.push({ k: "results" });
  if (P.bracket && M.list.some(r => !r.winner)) out.push({ k: "bracket" });
  if (P.facts) for (const f of (s.facts || [])) out.push({ k: "fact", f });
  return out;
};
const brow = (r, opt) => { const sc = r.winner || r.status === "live";
  return `<div class="bk-r ${r.status === "live" ? "live" : ""}"><span class="rd">${esc(r.roundShort)}</span>
    <span class="a ${r.winner && r.winner !== r.t[0] ? "l" : ""}">${r.t[0] ? `<b>${esc(OD.tname(r.t[0]))}</b>${tlogo(r.t[0])}` : `<b class="h">${esc(r.hint[0])}</b>`}</span>
    <span class="sc">${sc ? scoreTxt(r) : esc(OD.time(r.at))}</span>
    <span class="b ${r.winner && r.winner !== r.t[1] ? "l" : ""}">${r.t[1] ? `${tlogo(r.t[1])}<b>${esc(OD.tname(r.t[1]))}</b>` : `<b class="h">${esc(r.hint[1])}</b>`}</span></div>`; };
function breakPanelHTML(p) {
  const M = OD.M, list = (k, xs) => `<div class="bk-p"><div class="bk-k">${k}</div>${xs.map(brow).join("")}</div>`;
  if (p.k === "next") { const r = p.r;
    return `<div class="bk-p bk-next"><div class="bk-k">${r.status === "live" ? "Live now" : "Up next"} · ${esc(r.round)}</div>
      <div class="bk-line">${[0, 1].map(i => `<div class="bk-nt ${i ? "R" : ""}">${tlogo(r.t[i])}<b style="font-size:${fitPx(OD.tname(r.t[i]), 72, 9)}px">${esc(OD.tname(r.t[i]))}</b></div>${i ? "" : `<div class="bk-vs">VS</div>`}`).join("")}</div>
      <div class="bk-when">Best of ${esc(r.bo)}${r.at && r.status !== "live" ? " · " + esc(OD.day(r.at)) + " · " + esc(OD.time(r.at)) + " CET" : ""}</div></div>`; }
  if (p.k === "live") return list("Live now", M.list.filter(r => r.status === "live").slice(0, 3));
  if (p.k === "upcoming") return list("Coming up", M.list.filter(r => !r.winner && r.status === "upcoming").slice(0, 3));
  if (p.k === "results") return list("Latest results", M.list.filter(r => r.winner).slice(-3).reverse());
  if (p.k === "bracket") return list("Road to the final", M.list.filter(r => !r.winner && r.status !== "void").slice(-3));
  if (p.k === "fact") { const f = p.f; return `<div class="bk-p bk-fact"><div class="bk-k">Did you know</div><div class="fx">${esc(f.text)}</div>${f.source ? `<div class="sc2-src">Source: ${esc(f.source)}</div>` : ""}</div>`; }
  return "";
}
SC.brk = root => {
  root.innerHTML = `<div class="stage fs brk" id="st"><video class="bgv" muted loop autoplay playsinline></video><div class="vign"></div><div class="corner" id="cn">Intermission</div><img class="evlogo" id="lg" alt="">
    <div class="bk-b1"><div class="bk-ti" id="ti"></div></div><div class="bk-b2"><div class="bk-cd" id="cd"></div><div class="b-div" id="dv"></div><div class="bk-pn" id="pn"></div></div><div class="bbar" id="ft"></div></div>`;
  const st = root.querySelector("#st"); OD.fit(st);
  const vid = st.querySelector("video"), lg = st.querySelector("#lg"), ti = st.querySelector("#ti"), cd = st.querySelector("#cd"), dv = st.querySelector("#dv"), pn = st.querySelector("#pn"), ft = st.querySelector("#ft");
  let lastPanel = "", lastFoot = "";
  const tick = () => {
    const s = OD.S; if (!s || !OD.M) return;
    const want = s.brk.bg ? OD.brand("screen") : null;
    st.classList.toggle("has-bg", !!want);
    if (want && vid.getAttribute("src") !== want) { vid.setAttribute("src", want); vid.play().catch(() => {}); }
    if (!want && vid.getAttribute("src")) { vid.pause(); vid.removeAttribute("src"); vid.load(); }
    vid.style.display = want ? "" : "none";
    const logo = OD.eventLogo(); if (logo && lg.getAttribute("src") !== logo) lg.setAttribute("src", logo);
    if (ti.textContent !== s.brk.title) { ti.textContent = s.brk.title; ti.style.fontSize = fitPx(s.brk.title, 150, 16) + "px"; }
    ti.style.visibility = s.brk.title ? "" : "hidden";
    const now = OD.now();
    const bl = s.brk.breakAt && s.brk.breakAt > now ? OD.countdown(s.brk.breakAt - now) : "";
    const lbl = /starting/i.test(s.brk.title) ? "Starting in" : /thank|ending/i.test(s.brk.title) ? "Next broadcast in" : "Back in";
    const bcd = bl ? `<div class="lbl">${lbl}</div><span class="cd">${OD.cdSlots(bl)}</span>` : "";
    if (cd.innerHTML !== bcd) cd.innerHTML = bcd;
    cd.style.display = dv.style.display = bl ? "" : "none";
    const list = SC.breakPanels(s);
    const idx = list.length ? Math.floor(now / (s.brk.rotateSec * 1000)) % list.length : -1;   // same panel on every source
    const html = idx >= 0 ? breakPanelHTML(list[idx]) : "";
    if (html !== lastPanel) { lastPanel = html; pn.innerHTML = html ? `<div class="view in" style="width:100%">${html.replace('<div class="bk-p', '<div data-r="r" class="bk-p')}</div>` : ""; }
    // next-match countdown, independent from the break countdown
    const nx = nextUp(OD.M);
    let right = "";
    if (nx && nx.ready) {
      const at = s.brk.nextAt || (nx.at ? new Date(nx.at).getTime() : null), left = at && at > now ? OD.countdown(at - now) : "";
      right = `<span style="color:var(--dim)">${nx.status === "live" ? "Live" : "Next"}</span> ${esc(OD.tname(nx.t[0]))} <span class="sep">vs</span> ${esc(OD.tname(nx.t[1]))}${left ? ` <span class="sep">·</span> <span style="font-variant-numeric:tabular-nums">${esc(left)}</span>` : ""}`;
    }
    const foot = barHTML(right ? eventLine().slice(0, 1) : eventLine().slice(0, 2), right);
    if (foot !== lastFoot) { lastFoot = foot; ft.innerHTML = foot; }
  };
  OD.onState(tick); setInterval(tick, 250);
};

/* ======================================================================= casters strip (kept from the Wildcard build) */
SC.casters = root => {
  root.innerHTML = `<div class="stage" id="st"><div id="h"></div></div>`; const st = root.querySelector("#st"), h = root.querySelector("#h"); OD.fit(st);
  let last = "";
  const tick = () => {
    const M = OD.M; if (!M) return;
    const r = nextUp(M); let html = "";
    if (r && r.ready) {
      const at = r.at ? new Date(r.at).getTime() : null, left = at ? OD.countdown(at - OD.now()) : "";
      html = `<div class="cs"><div class="cs-top"><span class="cs-lbl${r.status === "live" ? " on-air" : ""}">${r.status === "live" ? "Live now" : r.winner ? "Result" : "Up next"}${M.active && M.active.id === r.id ? " · On air" : ""}</span><span class="cs-rd">${esc(r.round)}</span></div>
        <div class="cs-teams">${OD.logo(r.t[0], "lg")}<b>${esc(OD.tname(r.t[0]))}</b>${r.winner ? `<span class="sc">${scoreTxt(r)}</span>` : "<i>vs</i>"}<b>${esc(OD.tname(r.t[1]))}</b>${OD.logo(r.t[1], "lg")}</div>
        ${r.status === "live" || r.winner || !at ? "" : `<div class="cs-cd"><span>${left ? "Starts in" : "Starting soon"}</span>${left ? `<b>${OD.cdSlots(left)}</b>` : ""}</div>`}</div>`;
    }
    if (html !== last) { const first = !last; last = html; h.innerHTML = html; if (first && h.firstElementChild) h.firstElementChild.classList.add("in"); }
  };
  OD.onState(tick); setInterval(tick, 500);
};
})();
