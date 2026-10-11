# Subsonic for Nuclear

Search and stream your own library from any Subsonic-compatible server
(Navidrome, Gonic, Airsonic…) in [Nuclear](https://github.com/nukeop/nuclear).

- Search artists, albums and tracks
- Artist pages: albums, biography, top songs and similar artists (the last
  three when the server has an external agent such as Last.fm), album pages
- Playback straight from the server; tracks found by other metadata
  providers are matched against your library too
- Dashboard: most played albums and their artists, recently added albums,
  starred songs and your server playlists
- Server playlists open in Nuclear and can be imported
- Discovery: similar songs from your library to keep the queue going,
  random ones when the server knows no similar songs

The password never leaves your machine in clear: every request uses
Subsonic token authentication (`md5(password + salt)`, fresh salt each time).

## Setup

Settings → Subsonic: server URL, username, password.

Icon: the [OpenSubsonic](https://github.com/opensubsonic/open-subsonic-api) logo, Apache-2.0.
