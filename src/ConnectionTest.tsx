import type {
  CustomWidgetProps,
  NuclearPluginAPI,
} from '@nuclearplayer/plugin-sdk';
import { Button } from '@nuclearplayer/ui';
import { useEffect, useState, type FC } from 'react';

import { SETTINGS } from './config';
import { normalizeServerUrl, type Account } from './account';
import { openClient, readAccount } from './subsonic';

type Result = { ok: true; lines: string[] } | { ok: false; error: string };

const describe = (account: Account) =>
  `Using ${account.url} as ${account.username}.`;

// Checks the URL and credentials typed above; only once the server accepts
// them are they saved as the account every request uses.
export const ConnectionTest: FC<CustomWidgetProps<NuclearPluginAPI>> = ({
  api,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<Result>();
  const [current, setCurrent] = useState<Account>();

  useEffect(() => {
    readAccount(api).then(setCurrent, () => setCurrent(undefined));
  }, [api]);

  const connect = async () => {
    setConnecting(true);
    setResult(undefined);
    try {
      const [rawUrl, rawUsername, password] = await Promise.all([
        api.Settings.get<string>(SETTINGS.URL),
        api.Settings.get<string>(SETTINGS.USERNAME),
        api.Settings.get<string>(SETTINGS.PASSWORD),
      ]);
      const username = rawUsername?.trim();
      if (!rawUrl || !username || !password) {
        throw new Error('Fill in the server URL, username and password.');
      }
      const account = { url: normalizeServerUrl(rawUrl), username, password };
      const client = await openClient(api, account);
      const ping = await client.ping();
      await api.Settings.set(SETTINGS.ACCOUNT, JSON.stringify(account));
      setCurrent(account);
      const server = ping.type
        ? `${ping.type} ${ping.serverVersion ?? ''}`.trim()
        : 'a Subsonic server';
      setResult({
        ok: true,
        lines: [
          `Connected to ${server} (API ${ping.version}).`,
          client.extensionNames.length
            ? `OpenSubsonic extensions: ${client.extensionNames.join(', ')}.`
            : 'No OpenSubsonic extensions: plain Subsonic features only.',
        ],
      });
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={connect}
        disabled={connecting}
      >
        {connecting ? 'Connecting...' : 'Connect'}
      </Button>
      <span>{current ? describe(current) : 'Not connected.'}</span>
      {result?.ok === true &&
        result.lines.map((line) => <span key={line}>{line}</span>)}
      {result?.ok === false && (
        <span className="text-accent-red">{result.error}</span>
      )}
    </div>
  );
};
