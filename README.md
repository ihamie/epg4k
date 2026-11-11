# Mapped EPG for TiviMate

EPG URL (available after the first successful Actions run):

https://raw.githubusercontent.com/ihamie/epg4k/main/docs/guide.xml.gz

Add this as an EPG source in TiviMate, enable it for the Stalker playlist, and update EPG. Make it the preferred source for that playlist. A prior manual assignment can override automatic matching; clear or change it if necessary.

## What is included

The saved lineup has 5,841 channels and 1,095 public-source mappings. These are mappings, not a promise that every channel currently has listings. `docs/status.json` reports current coverage; `docs/coverage.json` lists each channel. Matches preserve region and feed distinctions. They have not all been checked against the video broadcast.

Portal XMLTV IDs are retained where possible. Missing, conflicting, or time-corrected IDs use `stalker.<channel ID>` and may require a one-time manual assignment by channel name. No stream URLs, MAC addresses, passwords, or portal sessions are included. This version retrieves public EPGShare feeds only, not authenticated provider schedules.

## Updates

GitHub Actions refreshes at 05:17 and 17:17 UTC daily and can be run manually under Actions → Refresh mapped EPG → Run workflow. Scheduled execution may be delayed by GitHub. Successful publication commits real guide changes to this repository. If the repository has no activity for 60 days, GitHub can disable its scheduled workflow; check Actions if the guide becomes stale.

The updater caches filtered source data, preserves the previous successful source on download failure, removes expired programs, and refuses to replace the published guide with an empty guide. Partial failures are reported in status and logs; an old cached source cannot supply schedules beyond its original horizon. It does not invent listings for uncovered channels.

No paid service, PC server, portal credentials, or GitHub Pages setting is required. Public guide hosting means anyone can download the schedules and saved channel names. The guide's GitHub URL is stable while this repository, branch, and path are retained.

## Local checks

Requires Node.js 22 (with node:sqlite support).

```
node --test tests/guide.test.mjs
node update.mjs
```

Sources and saved mappings are in `data/`. Source credentials must never be committed here. Guide updates do not automatically discover provider lineup changes.
