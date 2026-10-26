# Subsonic for Nuclear

Plays your own music library in [Nuclear](https://github.com/nukeop/nuclear)
from a Subsonic-compatible server. I use it with Navidrome; Gonic, Airsonic
and the like should work too.

What it does: search, artist and album pages, streaming (with optional
transcoding), lyrics, a dashboard with your most played and recently added
albums, and discovery from similar songs in your library. Playlists,
favorites and the play queue are kept in sync with the server, and plays are
scrobbled to it.

## Setup

Open Settings, Subsonic section: enter the server URL, your username and
password, then hit "Connect". Nothing is sent to the server before that,
and the plugin keeps using the last account that connected successfully.
Everything else (bitrate, format, syncs, scrobbling) is in the same section.

About credentials: requests use Subsonic token auth, so the password itself
is not sent, but that is weak protection. Anyone who captures a request URL
(stream and cover art URLs included) can replay it for any API call until
you change the password, and the MD5 token is cheap to brute-force. Use
HTTPS.

## Notes

- Lyrics are synced when the server supports the OpenSubsonic `songLyrics`
  extension, plain otherwise. Same idea for a couple of other extensions:
  they are used when available, with a plain Subsonic fallback.
- Playlist sync: songs from other sources (YouTube etc.) stay in the Nuclear
  playlist but are not sent to the server. If a playlist changed on both
  sides, the Nuclear version wins. Renaming a playlist on the server is not
  reflected in Nuclear, the plugin API can't rename playlists.
- Deletions: a playlist you delete in Nuclear is deleted on the server only
  if the sync is on at that moment. A playlist is removed from Nuclear only
  once the server confirms it no longer exists. Other users' public
  playlists are left alone.
- Only songs that play to the end are scrobbled.

## License

AGPL-3.0-only, see [LICENSE](LICENSE). Icon: the
[OpenSubsonic](https://github.com/opensubsonic/open-subsonic-api) logo
(Apache-2.0).
