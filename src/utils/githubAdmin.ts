import type { BusLine, SiteConfig } from '../types/transit';

const GITHUB_OWNER = 'evile92';
const GITHUB_REPO = 'TetoWay';
const GITHUB_BRANCH = 'main';
const ADMIN_TOKEN_STORAGE_KEY = 'tetoway-admin-pat';

export function readStoredAdminToken(): string {
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveAdminToken(token: string): void {
  try {
    const clean = token.trim();
    if (clean) {
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function clearAdminToken(): void {
  try {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function encodeUtf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return window.btoa(binary);
}

function buildGithubHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export interface GithubVerifyResult {
  ok: boolean;
  login?: string;
  error?: 'invalid_token' | 'no_write_access' | 'network_error';
}

/**
 * Verify that the provided GitHub Personal Access Token is valid AND has write/push
 * permission to `evile92/TetoWay`.
 */
export async function verifyGithubAdminToken(token: string): Promise<GithubVerifyResult> {
  const clean = token.trim();
  if (!clean) {
    return { ok: false, error: 'invalid_token' };
  }

  try {
    const repoRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
      {
        headers: buildGithubHeaders(clean),
        cache: 'no-store',
      },
    );

    if (repoRes.status === 401 || repoRes.status === 403) {
      return { ok: false, error: 'invalid_token' };
    }
    if (!repoRes.ok) {
      return { ok: false, error: 'network_error' };
    }

    const repoData = (await repoRes.json()) as {
      permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
    };

    const canWrite = Boolean(
      repoData.permissions?.push ||
        repoData.permissions?.admin ||
        repoData.permissions?.maintain,
    );

    if (!canWrite) {
      return { ok: false, error: 'no_write_access' };
    }

    return { ok: true, login: GITHUB_OWNER };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

async function putGithubRepoFile(
  token: string,
  filePath: string,
  contentText: string,
  commitMessage: string,
): Promise<void> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  // 1. Fetch current file SHA on `main`
  const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, {
    headers: buildGithubHeaders(token),
    cache: 'no-store',
  });

  let currentSha: string | undefined;
  if (getRes.ok) {
    const fileMeta = (await getRes.json()) as { sha?: string };
    currentSha = fileMeta.sha;
  } else if (getRes.status !== 404) {
    throw new Error(`GitHub GET ${filePath} failed (${getRes.status})`);
  }

  // 2. Commit updated UTF-8 file content directly to `main`
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      ...buildGithubHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      content: encodeUtf8ToBase64(contentText),
      branch: GITHUB_BRANCH,
      ...(currentSha ? { sha: currentSha } : {}),
    }),
  });

  if (!putRes.ok) {
    throw new Error(`GitHub PUT ${filePath} failed (${putRes.status})`);
  }
}

/**
 * Commit updated transit lines and/or site announcement config directly to
 * `evile92/TetoWay` (`main` branch), triggering an automatic Vercel production deploy.
 */
export async function publishAdminChangesToGithub(options: {
  token: string;
  lines?: BusLine[];
  siteConfig?: SiteConfig;
  commitNote?: string;
}): Promise<void> {
  const { token, lines, siteConfig, commitNote } = options;
  const noteSuffix = commitNote?.trim() ? `: ${commitNote.trim()}` : '';

  if (lines) {
    const jsonText = `${JSON.stringify(lines, null, 2)}\n`;
    await putGithubRepoFile(
      token,
      'public/data/tetouan-lines.json',
      jsonText,
      `chore(admin): update transit lines data${noteSuffix}`,
    );
  }

  if (siteConfig) {
    const configText = `${JSON.stringify(siteConfig, null, 2)}\n`;
    await putGithubRepoFile(
      token,
      'public/data/site-config.json',
      configText,
      `chore(admin): update public announcement banner${noteSuffix}`,
    );
  }
}
