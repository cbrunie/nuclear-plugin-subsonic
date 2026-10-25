import type {
  CustomWidgetProps,
  NuclearPluginAPI,
} from '@nuclearplayer/plugin-sdk';
import { Button } from '@nuclearplayer/ui';
import { useState, type FC } from 'react';

import { createClient } from './subsonic';

type Result = { ok: true; lines: string[] } | { ok: false; error: string };

// Checks the saved URL and credentials, and tells what the server is.
export const ConnectionTest: FC<CustomWidgetProps<NuclearPluginAPI>> = ({
  api,
}) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Result>();

  const test = async () => {
    setTesting(true);
    setResult(undefined);
    try {
      const client = await createClient(api)();
      const ping = await client.ping();
      const server = ping.type
        ? `${ping.type} ${ping.serverVersion ?? ''}`.trim()
        : 'a Subsonic server';
      setResult({
        ok: true,
        lines: [
          `Connected to ${server} as ${client.username} (API ${ping.version}).`,
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
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" size="sm" onClick={test} disabled={testing}>
        {testing ? 'Testing...' : 'Test connection'}
      </Button>
      {result?.ok === true &&
        result.lines.map((line) => <span key={line}>{line}</span>)}
      {result?.ok === false && (
        <span className="text-accent-red">{result.error}</span>
      )}
    </div>
  );
};
