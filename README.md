# OverDrive Major 2026: broadcast graphics

One producer, nine browser sources, one page to run the show. Select the match once: every graphic prepares itself, and nothing goes on air until you put it there.

### Broadcast scenes
Every full-screen scene is composed as a television graphic on the original OverDrive layers (dark angled panels, full-height portrait panels with an accent edge, large Anton type), checked at native 4K and at phone size. What's at Stake reads the bracket itself: advancement, elimination placements (counted from the bracket, not a fixed table), guaranteed placements, remaining route to the Grand Final, confirmed or possible next opponents and prize money (from the verified Liquipedia prize table) all follow the selected match. The break screen is composed into the two panels of the break loop. Gameplay stays transparent except for manually triggered popouts.

## Run it (on the streaming PC)

```
node server.js
```

Needs Node 18 or newer; there is nothing to install.

- Producer: `http://localhost:10000/#control` (in a browser, or as an OBS custom dock).
- Changes are only accepted from this computer. To control it from another machine, start it with `SYNC_KEY=something node server.js` and add `#key=something` to the producer address.
- Everything is saved in `data/`, so a restart loses nothing. Camera links and the OBS password live in `data/private.json` and never appear in the public state.

## The nine browser sources

Use **3840×2160** for native 4K or **1920×1080** for 1080p; the address is the same. Untick "Shutdown source when not visible".

| Source | Address | States inside it |
|---|---|---|
| Starting soon / BRB / Ending | `/#waiting` | title, break countdown, next-match countdown, rotating info |
| Pre-show / Analyst desk | `/#analyst` (add `&key=…` if a key is set) | producer tab F4 · analyst desk loops (desk-solo, desk-duo), its own two cameras, names and VDO links · matchup, team comparison, road so far, what's at stake, player spotlight, predictions, storylines |
| Match / Caster desk | `/#desk` (add `&key=…` if a key is set) | producer tab F5 · its own "Casters booth" loops (brand/caster-duo.webm, caster-trio.webm), its own three cameras, names and VDO links (Cameras & names on that tab), solo / dual / trio · series score, map info, map results and series progression (from the map log on that tab), other matches |
| Matchup / team introduction | `/#matchup` | versus, team A intro, team B intro, head to head, road so far, what's at stake |
| Player information | `/#player` | profile of any of the four players, two comparisons |
| Bracket / tournament overview | `/` or `/#bracket` | bracket, match schedule |
| Caster predictions | `/#predictions` | reveal per caster |
| Map information | `/#maps` | map pool (with "now playing"), one card per map |
| Gameplay editorial layer | `/#gameplay` | transparent; popouts only when you show one |
| Post-match / MVP | `/#postmatch` | final result, MVP of any of the four players |

Two more: `/#casters` (next-match strip, kept from the Wildcard build) and `brand/stinger.webm`, which works as an OBS stinger transition with the cut at 1000 ms. Every Wildcard address still works.

## One-person workflow

1. **Select the broadcast match** in the header.
   - Logos, portraits, rosters, careers, seeds, records, head-to-heads, map PBs, predictions and post-match graphics all prepare themselves.
   - The match never changes by itself, and incoming results never switch scenes or show anything.
2. **Match ready** (header) is green when everything is prepared. Otherwise it lists what's missing (a logo, a photo, caster names, predictions, offline data) and links to where to fix it.
3. **Full-screen** tab: one card per source. Click a state to see it in Preview, then **Take**. States without verified data are greyed out.
4. **Gameplay** tab: pick one of the four players or a team, choose a popout (spotlight, achievements, recent results, comparison, team stats, road so far, stakes, seeds, head to head, map card, other matches, upcoming, facts or a custom message).
   - Each popout goes Preview → **Show on air** with a duration → **Hide**.
   - **Clear editorial graphics** hides everything at once.
   - Other-match popouts always exclude the broadcast match.
5. **Caster Desk → Show**: click a state (Shift+1…5) to preview it, then Take; Hide returns to the clean desk. The cameras never move between states, so the desk loop's frames and local OBS cameras stay aligned, and the VDO.Ninja connections are never reloaded. Pick each caster's team and, optionally, a score there; taking Predictions reveals the picks. Everything follows the broadcast match automatically. Clear graphics (Esc) also returns the desk to clean and hides lower thirds.
6. **Predictions**: pick a team per caster, then Reveal. Revealed picks also appear on the desk cameras while the graphic is shown.
6. **MVP**: Full-screen → Post-match → pick one of the four players → Take.

There is no scoreboard, timer, round counter or any copy of the Trackmania HUD.

## Cameras

- **Two persistent cameras** (Caster desk tab): name, role, VDO.Ninja view link and framing for each, plus a solo or dual layout.
- **Integrated cameras on**: both feeds load once and stay connected. Solo ↔ dual just moves them, so there's no reconnect.
- **Integrated cameras off**: the page opens no VDO.Ninja connection at all and leaves transparent openings. The tab lists the exact positions for your OBS camera sources (1080p and 4K).

## Assets: replace a file, keep its name

Changes are picked up within 10 s, no restart. **Assets & settings** lists every slot and what is missing.

| Folder | What | Note |
|---|---|---|
| `public/brand/` | `major-logo.png` (add it), `logo`, `mark`, `loop`, `bar`, `screen`, `desk-solo`, `desk-duo`, `stinger` | The current files are the generic OverDrive package from the original project. Swap in the Major versions. |
| `public/logos/` | `<team>.png` (`big`, `cook`, `futxheav`…) | 64 px today; ≥256 px recommended for 4K. COOK has no logo yet. |
| `public/players/` | `<player>.jpg` (`gwen`, `nablatm`…) | 16 event photos from the original project. |
| `public/maps/` | `india`, `czech`, `egypt`, `uk`, `nz` | In-game shots from the original project. |

Portrait framing (focal point and zoom) is set per player in Assets & settings. It is the same on every graphic, and smaller boxes zoom in further automatically.

## Data and where it comes from

| Data | Source (highest first) |
|---|---|
| Scores, status, schedule, teams, rosters, seeds, seed takeover | Producer override → Major sheet (live, every 30 s) → cached sheet → snapshot of 21 Nov 18:45 |
| Wildcard results, head-to-heads | Wildcard sheet |
| Player careers, achievements, prize money, real names | `data/verified.json`, from the original project's Liquipedia notes (read 9–10 Nov 2026), plus optional Liquipedia imports you approve |
| Map pool, author times, campaign PBs | `data/verified.json` (trackmania.io, read 10 Nov 2026; shown with that date) |
| Team season lines, prize split | `data/verified.json` (Liquipedia Major page) |

- **Not available**: per-player match statistics. Nothing is invented; graphics without data are hidden or greyed out.
- **eCircuitMania** has no public API (Firebase with App Check) and is used as a manual reference only.

## Changes since the first Major build

- **Visual package rebuilt on the original OverDrive language**: animated loops behind full-screen scenes, a corner label and logo where the desk loops carry theirs, a shared bottom bar, dark panels with an accent edge, Anton display type and one motion curve.
- **New sources**: Player information, Map information, Post-match / MVP. Bracket gained a schedule state; matchup gained team introductions.
- **Cameras** simplified to two fixed slots; trio removed.
- **Predictions** simplified to team pick and reveal.
- **Match ready** indicator and asset checklist added.
- **Not carried over from the original project** (by design): the title plates with baked-in old-event text, voting, QR codes, the talent manager, the camera engine, audio routing and the separate control rooms.

The original Wildcard project is kept unchanged in `overdrive-wildcard-original.zip`.
