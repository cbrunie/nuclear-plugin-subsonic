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
password, then hit "Test connection". Everything else (bitrate, format,
syncs, scrobbling) is in the same section.

The password is never sent as is: requests use Subsonic token auth.

## Notes

- Lyrics are synced when the server supports the OpenSubsonic `songLyrics`
  extension, plain otherwise. Same idea for a couple of other extensions:
  they are used when available, with a plain Subsonic fallback.
- Playlist sync: songs from other sources (YouTube etc.) stay in the Nuclear
  playlist but are not sent to the server. If a playlist changed on both
  sides, the Nuclear version wins. Renaming a playlist on the server is not
  reflected in Nuclear, the plugin API can't rename playlists.
- Only songs that play to the end are scrobbled.

## License

AGPL-3.0-only, see [LICENSE](LICENSE). Icon: the
[OpenSubsonic](https://github.com/opensubsonic/open-subsonic-api) logo
(Apache-2.0).
