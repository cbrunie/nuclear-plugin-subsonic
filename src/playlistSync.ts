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
  modified: string;
  // A copy imported from this server earlier, by hand.
  originServerId?: string;
  hasServerTracks: boolean;
};

export type ServerSide = { id: string; changed?: string };

export type SyncAction =
  | { type: 'push'; link: PlaylistLink }
  | { type: 'pull'; link: PlaylistLink }
  | { type: 'deleteOnServer'; link: PlaylistLink }
  | { type: 'deleteInNuclear'; link: PlaylistLink }
  | { type: 'unlink'; link: PlaylistLink }
  | { type: 'link'; nuclearId: string; serverId: string }
  | { type: 'createOnServer'; nuclearId: string }
  | { type: 'importFromServer'; serverId: string };

export const planPlaylistSync = ({
  links,
  nuclear,
  server,
  vanished,
}: {
  links: PlaylistLink[];
  nuclear: NuclearSide[];
  server: ServerSide[];
  // Nuclear playlists seen disappearing while the plugin was running. Only
  // those are deleted on the server: a playlist merely missing (at startup,
  // say) is never taken for a deletion.
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
      if (vanished.has(link.nuclearId)) {
        actions.push({ type: 'deleteOnServer', link });
        linkedServer.add(link.serverId);
      } else {
        actions.push({ type: 'unlink', link });
      }
      continue;
    }
    if (!s) {
      // Deleted on the server: follow, unless edited in Nuclear since.
      if (n.modified === link.nuclearModified) {
        actions.push({ type: 'deleteInNuclear', link });
        linkedNuclear.add(link.nuclearId);
      } else {
        actions.push({ type: 'unlink', link });
      }
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

  for (const n of nuclear) {
    if (linkedNuclear.has(n.id)) {
      continue;
    }
    if (
      n.originServerId &&
      serverById.has(n.originServerId) &&
      !linkedServer.has(n.originServerId)
    ) {
      actions.push({
        type: 'link',
        nuclearId: n.id,
        serverId: n.originServerId,
      });
      linkedServer.add(n.originServerId);
    } else if (n.hasServerTracks) {
      actions.push({ type: 'createOnServer', nuclearId: n.id });
    }
  }

  for (const s of server) {
    if (!linkedServer.has(s.id)) {
      actions.push({ type: 'importFromServer', serverId: s.id });
    }
  }

  return actions;
};
