// Two-way playlist sync: the decisions, kept pure so the rules that can
// lose data are testable.

export type PlaylistLink = {
  nuclearId: string;
  serverId: string;
  // Both sides' last modification as of the last sync.
  nuclearModified: string;
  serverChanged?: string;
};

export type NuclearSide = {
  id: string;
  name: string;
  modified: string;
  // A copy imported from this server earlier, by hand.
  originServerId?: string;
  hasServerTracks: boolean;
};

export type ServerSide = {
  id: string;
  name: string;
  changed?: string;
  // Owned by the connected user. Other users' public playlists are listed
  // but cannot be edited: they are never synced, and never taken as gone.
  editable: boolean;
};

export type SyncAction =
  | { type: 'push'; link: PlaylistLink }
  | { type: 'pull'; link: PlaylistLink }
  | { type: 'deleteOnServer'; link: PlaylistLink }
  // The executor deletes only once the server confirms the playlist is gone.
  | { type: 'deleteInNuclear'; link: PlaylistLink }
  | { type: 'unlink'; link: PlaylistLink }
  // Pairs two existing playlists; the server's songs then fill Nuclear's.
  | { type: 'link'; nuclearId: string; serverId: string }
  | { type: 'createOnServer'; nuclearId: string }
  | { type: 'importFromServer'; serverId: string };

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export const planPlaylistSync = ({
  links,
  nuclear,
  server,
  vanished,
}: {
  links: PlaylistLink[];
  nuclear: NuclearSide[];
  server: ServerSide[];
  // Nuclear playlists seen disappearing while the sync was on. Only those
  // are deleted on the server: a playlist merely missing (at startup, or
  // deleted while the sync was off) is never taken for a deletion.
  vanished: Set<string>;
}): SyncAction[] => {
  const actions: SyncAction[] = [];
  const nuclearById = new Map(nuclear.map((n) => [n.id, n]));
  const serverById = new Map(server.map((s) => [s.id, s]));
  const linkedNuclear = new Set<string>();
  const linkedServer = new Set<string>();

  for (const link of links) {
    const n = nuclearById.get(link.nuclearId);
    const s = serverById.get(link.serverId);

    // An unlinked survivor is handled below in the same pass: imported from
    // the server, or created back on it.
    if (!n && !s) {
      actions.push({ type: 'unlink', link });
      continue;
    }
    if (!n) {
      if (vanished.has(link.nuclearId) && s!.editable) {
        actions.push({ type: 'deleteOnServer', link });
        linkedServer.add(link.serverId);
      } else {
        actions.push({ type: 'unlink', link });
      }
      continue;
    }
    if (!s) {
      // Not listed by the server: follow a deletion, unless edited in
      // Nuclear since. The executor checks with the server first.
      if (n.modified === link.nuclearModified) {
        actions.push({ type: 'deleteInNuclear', link });
        linkedNuclear.add(link.nuclearId);
      } else {
        actions.push({ type: 'unlink', link });
      }
      continue;
    }
    if (!s.editable) {
      actions.push({ type: 'unlink', link });
      continue;
    }

    linkedNuclear.add(link.nuclearId);
    linkedServer.add(link.serverId);
    if (n.modified !== link.nuclearModified) {
      // Changed in Nuclear, maybe on both sides: Nuclear wins.
      actions.push({ type: 'push', link });
    } else if (s.changed !== link.serverChanged) {
      actions.push({ type: 'pull', link });
    }
  }

  const unlinkedNuclear = nuclear.filter((n) => !linkedNuclear.has(n.id));
  const unlinkedServer = () =>
    server.filter((s) => s.editable && !linkedServer.has(s.id));

  for (const n of unlinkedNuclear) {
    // The same playlist on both sides, links lost or made by hand: pair them
    // rather than duplicate. By origin first, then by a name found exactly
    // once on each side.
    const byOrigin = unlinkedServer().find((s) => s.id === n.originServerId);
    const byName = unlinkedServer().filter((s) => sameName(s.name, n.name));
    const nameIsUnique =
      unlinkedNuclear.filter((other) => sameName(other.name, n.name)).length ===
      1;
    const match =
      byOrigin ?? (byName.length === 1 && nameIsUnique ? byName[0] : undefined);

    if (match) {
      actions.push({ type: 'link', nuclearId: n.id, serverId: match.id });
      linkedServer.add(match.id);
    } else if (n.hasServerTracks) {
      actions.push({ type: 'createOnServer', nuclearId: n.id });
    }
  }

  for (const s of unlinkedServer()) {
    actions.push({ type: 'importFromServer', serverId: s.id });
  }

  return actions;
};
