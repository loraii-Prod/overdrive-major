# New event from this template

This is the OverDrive Major broadcast with all event content removed. The layouts, scenes, producer and caster desks are unchanged. It starts with 8 placeholder teams ("Team 1"…"Team 8", players "Player 1A"…) so every graphic can be previewed straight away.

Set up a new event in this order. Everything you leave empty is hidden on air.

## 1. Event details: `data/verified.json` → `event`

| Field | What it shows | Example |
|---|---|---|
| `name` | Full event name | `OverDrive 2027 Split 1: Major` |
| `short` | Name used on graphics ("… champions", break bar, maps bar) | `OverDrive Major` |
| `kicker` | Small line above the bracket title | `OverDrive Major 2027` |
| `dates` | Event dates | `20–21 March 2027` |
| `formatShort` / `format` | Format line | `8 teams · double elimination` |
| `game`, `bo` | Map-pool bar | `TMWT Duos`, `Bo5` |
| `tz` | Label after match times | `CET` |
| `day` | Event day, used for player ages | `2027-03-21` |
| `prizePool`, `prizes` | What's at Stake / results prize money | `[["1st","€5,000"], …]` |
| `careerSource` | Source line under player careers | `Liquipedia, read 10 Mar 2027` |

The same file also holds:
- `maps.list`: the map pool (id, name, author time, player PBs).
- `players`: verified careers, keyed by the lowercase handle. `_examplePlayer` shows the shape; delete it once you've added real players.
- `teams`: short notes per team.

## 2. Teams, players, bracket and schedule

You have two options:

- **Live sheet (recommended).** Make a copy of the event Google Sheet with the same columns as the Major sheet. In the producer, go to **Settings → Event sheet CSV** and paste its gviz CSV link. The bracket, seeds, times and scores then update every 30 s.
- **Offline.** Edit `data/seed-major.json` (the format is described in its `_note`).

The bracket structure is 8-team double elimination. Other formats need code changes.

**Settings → Wildcard CSV** is optional. If you set it to a previous stage's sheet, you get head-to-heads and "road so far". The Wildcard bracket layout in `server.js` (`WC_STRUCT`) is from the 2026 Wildcards and needs adjusting for a different qualifier.

## 3. Assets: drop files in, no restart

- `public/logos/<teamname>.png`: the filename is the team name in lowercase, letters and digits only (`Team Abyssal` → `teamabyssal.png`).
- `public/players/<handle>.jpg`: player portraits. Adjust the framing in the producer, or set defaults in `PHOTO_FRAME` in `public/core.js`.
- `public/maps/<map id>.jpg`: map thumbnails, named after `maps.list[].id`.
- `public/brand/`: the OverDrive loops, stinger and logo. Keep the filenames if you rebrand.

In `public/core.js` you can also set:
- `TEAM_META`: short team tags.
- `ALIASES`: other spellings of team names.

## 4. Run

`node server.js`, then open `http://localhost:10000/#control`. The browser sources and workflow are the same as in `README.md`.
