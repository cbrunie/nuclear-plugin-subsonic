# Subsonic for Nuclear

Search and stream your own library from any Subsonic-compatible server
(Navidrome, Gonic, Airsonic…) in [Nuclear](https://github.com/nukeop/nuclear).

- Search artists, albums and tracks
- Artist pages (albums, biography when the server has one) and album pages
- Playback straight from the server; tracks found by other metadata
  providers are matched against your library too

The password never leaves your machine in clear: every request uses
Subsonic token authentication (`md5(password + salt)`, fresh salt each time).

## Setup

Settings → Subsonic: server URL, username, password.
