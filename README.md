# Subsonic for Nuclear

Search and stream your own library from any Subsonic-compatible server
(Navidrome, Gonic, Airsonic…) in [Nuclear](https://github.com/nukeop/nuclear).

- Search artists, albums and tracks
- Artist pages: albums, biography, top songs and similar artists (the last
  three when the server has an external agent such as Last.fm), album pages
- Playback straight from the server, with an optional maximum bitrate and
  format (transcoded by the server); tracks found by other metadata
  providers are matched against your library too
- Lyrics: synced, or word by word, when the server supports it, plain
  otherwise
- Dashboard: most played albums and their artists, recently added albums,
  starred songs and your server playlists
- Server playlists open in Nuclear and can be imported
- Discovery: similar songs from your library to keep the queue going,
  random ones when the server knows no similar songs
- Favorites synced both ways with the server's starred items
- Play queue saved on the server, to resume it from another client; an
  empty queue is restored from it at startup
- Scrobbling to the server: now playing, and a listen when a song plays to
  the end (skipped songs are not counted); the server updates its play
  counts and forwards them wherever it is set up to (Last.fm, ListenBrainz…)

The password never leaves your machine in clear: every request uses
Subsonic token authentication (`md5(password + salt)`, fresh salt each time).

## OpenSubsonic

Used when the server announces them, with a plain Subsonic fallback:

| Extension | Used for | Without it |
|---|---|---|
| `songLyrics` (v1, v2) | synced and word-level lyrics | plain lyrics by artist and title |
| `topSongsByArtistId` | top songs by artist id | top songs by artist name |
| `formPost` | saving long play queues | a window of 200 songs around the current one |

## Setup

Settings → Subsonic: server URL, username, password. Bitrate, format,
both syncs and scrobbling are in the same section.

Icon: the [OpenSubsonic](https://github.com/opensubsonic/open-subsonic-api) logo, Apache-2.0.
