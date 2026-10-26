// The connected account, and how to tell two spellings of it apart.

export type Account = { url: string; username: string; password: string };

// Only http(s) server roots, without trailing slashes, query or fragment.
export const normalizeServerUrl = (raw: string): string => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Subsonic: the server URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      'Subsonic: the server URL must start with http:// or https://',
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      'Subsonic: the server URL must not have a query or fragment',
    );
  }
  return url.href.replace(/\/+$/, '');
};

// Identifies an account across spellings of the same URL and username:
// scheme, case, default port and trailing slashes do not matter.
export const accountKey = ({
  url,
  username,
}: Pick<Account, 'url' | 'username'>) => {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.host}${path}|${username}`.toLowerCase();
};

export const sameUser = (a?: string, b?: string) =>
  a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
