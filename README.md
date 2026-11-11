# Mapped EPG for TiviMate

EPG URL (available after the first successful Actions run):

https://raw.githubusercontent.com/ihamie/epg4k/main/docs/guide.xml.gz

Add this as an EPG source in TiviMate, enable it for the Stalker playlist, and update EPG. Make it the preferred source for that playlist. A prior manual assignment can override automatic matching; clear or change it if necessary.

## What is included

The saved lineup contains 5,841 channels. Curated mappings are supplemented by conservative automatic source-index matching; `docs/status.json` records the current mapped and covered totals. A match does not guarantee that the source has live listings. `docs/status.json` reports current coverage; `docs/coverage.json` lists each channel. Matches preserve region and feed distinctions. They have not all been checked against the video broadcast.

Portal XMLTV IDs are retained where possible. Missing, conflicting, or time-corrected IDs use `stalker.<channel ID>` and may require a one-time manual assignment by channel name. No stream URLs, MAC addresses, passwords, or portal sessions are included. This version retrieves public EPGShare feeds only, not authenticated provider schedules.

## Channel logos

The guide adds XMLTV `<icon src="..."/>` tags using exact channel-ID matches from the public iptv-org logo catalog, with a fallback to uniquely matching channel names and country metadata from the iptv-org channel directory. The updater accepts currently used, feed-neutral HTTPS logos and does not guess artwork for similarly named channels or mix country/regional feeds. This improves logos for matched channels but does not guarantee artwork for all 5,841 channels. The last successful logo mapping is saved at `docs/channel-logos.json` and reused if the public catalog is temporarily unavailable. `docs/status.json` reports `channels_with_logos` after a successful update. Your Stalker playlist and all existing XMLTV channel IDs are unchanged.

In TiviMate, choose EPG logos as the preferred logo source for the playlist (if available in your version) and refresh the EPG. If TiviMate continues showing portal logos, its playlist logo setting or cached images may take precedence.

## Additional automatic schedule matching

Each refresh checks the public `.txt` indexes corresponding to the configured EPGShare feeds. Curated mappings stay authoritative. New mappings are accepted only for a unique source ID with region safeguards; ambiguous candidates and 24/7 loops, PPV and temporary sports event groups are excluded. Sources with failed indexes retain their previously saved automatic mappings only when safe. New mappings cause the relevant programme-source cache to refresh immediately. No fabricated programme listings are generated. Changes appear in `docs/auto-mappings.json` and source-index failures in `docs/source-index-errors.json`.

## NBA team-specific game schedules

The 30 team-specific `SPORTS | NBA` Stalker channels get scheduled matchup listings using the NBA season schedule, with ESPN scoreboard fallback. Each listing shows the actual opposing team and scheduled UTC tipoff (TiviMate displays your local time), with a **three-hour estimated game window**, not a verified broadcast end. There are no filler entries on off-days; WNBA, PPV, numbered streaming events and other sports channels remain unchanged. Schedule metadata does **not** verify that your IPTV provider is carrying the game at that time.

The schedule is fetched on every guide rebuild, including the existing once-daily automatic refresh. `docs/sports-status.json` reports source, games/entries and errors. If both sources fail, NBA game entries are omitted instead of fabricated. Postponements and last-minute changes may not appear until the next refresh. This does not alter any Stalker channel identifiers or your TiviMate EPG URL.

## Updates

GitHub Actions refreshes once per day at 13:17 UTC (05:17 Pacific Standard Time / 06:17 Pacific Daylight Time), runs automatically after relevant source-code changes, and can be run manually under Actions → Refresh mapped EPG → Run workflow. Scheduled execution may be delayed by GitHub. Successful publication commits real guide changes to this repository. Source refreshes have a 12-hour freshness check; manually rerunning within that window can reuse downloaded schedule data. If the repository has no activity for 60 days, GitHub can disable its scheduled workflow; check Actions if the guide becomes stale.

The updater caches filtered source data, preserves the previous successful source on download failure, removes expired programs, and refuses to replace the published guide with an empty guide. Partial failures are reported in status and logs; an old cached source cannot supply schedules beyond its original horizon. It does not invent listings for uncovered channels.

No paid service, PC server, portal credentials, or GitHub Pages setting is required. Public guide hosting means anyone can download the schedules and saved channel names. The guide's GitHub URL is stable while this repository, branch, and path are retained.

## Local checks

Requires Node.js 22 (with node:sqlite support).

```
node --test tests/guide.test.mjs
node update.mjs
```

Sources and saved mappings are in `data/`. Source credentials must never be committed here. Guide updates do not automatically discover provider lineup changes.
