# Mapped EPG for TiviMate

EPG URL (available after the first successful Actions run):

https://raw.githubusercontent.com/ihamie/epg4k/main/docs/guide.xml.gz

Add this as an EPG source in TiviMate, enable it for the Stalker playlist, and update EPG. Make it the preferred source for that playlist. A prior manual assignment can override automatic matching; clear or change it if necessary.

## What is included

The saved lineup has 5,841 channels and 1,095 public-source mappings. These are mappings, not a promise that every channel currently has listings. `docs/status.json` reports current coverage; `docs/coverage.json` lists each channel. Matches preserve region and feed distinctions. They have not all been checked against the video broadcast.

Portal XMLTV IDs are retained where possible. Missing, conflicting, or time-corrected IDs use `stalker.<channel ID>` and may require a one-time manual assignment by channel name. No stream URLs, MAC addresses, passwords, or portal sessions are included. This version retrieves public EPGShare feeds only, not authenticated provider schedules.

## Channel logos

The guide adds XMLTV `<icon src="..."/>` tags to channels with an exact channel-ID match in the public iptv-org logo catalog. The updater accepts currently used, feed-neutral HTTPS logos and does not guess artwork for similarly named channels or mix country/regional feeds. This improves logos for matched channels but does not guarantee artwork for all 5,841 channels. The last successful logo mapping is saved at `docs/channel-logos.json` and reused if the public catalog is temporarily unavailable. `docs/status.json` reports `channels_with_logos` after a successful update. Your Stalker playlist and all existing XMLTV channel IDs are unchanged.

In TiviMate, choose EPG logos as the preferred logo source for the playlist (if available in your version) and refresh the EPG. If TiviMate continues showing portal logos, its playlist logo setting or cached images may take precedence.

## Updates

GitHub Actions refreshes once per day at 13:17 UTC (05:17 Pacific Standard Time / 06:17 Pacific Daylight Time) and can be run manually under Actions → Refresh mapped EPG → Run workflow. Scheduled execution may be delayed by GitHub. Successful publication commits real guide changes to this repository. Source refreshes have a 12-hour freshness check; manually rerunning within that window can reuse downloaded schedule data. If the repository has no activity for 60 days, GitHub can disable its scheduled workflow; check Actions if the guide becomes stale.

The updater caches filtered source data, preserves the previous successful source on download failure, removes expired programs, and refuses to replace the published guide with an empty guide. Partial failures are reported in status and logs; an old cached source cannot supply schedules beyond its original horizon. It does not invent listings for uncovered channels.

No paid service, PC server, portal credentials, or GitHub Pages setting is required. Public guide hosting means anyone can download the schedules and saved channel names. The guide's GitHub URL is stable while this repository, branch, and path are retained.

## Local checks

Requires Node.js 22 (with node:sqlite support).

```
node --test tests/guide.test.mjs
node update.mjs
```

Sources and saved mappings are in `data/`. Source credentials must never be committed here. Guide updates do not automatically discover provider lineup changes.
