/**
 * GitHub REST API helpers (server-side only).
 * Anonymous calls have a 60 req/h limit; pass GITHUB_TOKEN to lift it.
 */

export interface RepoMeta {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  topics: string[];
  license: string | null;
  homepage: string | null;
  pushedAt: string | null;
}

export interface FileEntry {
  path: string;
  size: number;
  type: "blob" | "tree";
}

export interface RepoBundle {
  owner: string;
  repo: string;
  branch: string;
  meta: RepoMeta;
  treeTruncated: boolean;
  tree: FileEntry[];
  readme: string | null;
  configFiles: Record<string, string>;
  sourceFiles: Record<string, string>;
}

const FILE_BYTE_LIMIT = 80 * 1024; // single file
const TOTAL_SOURCE_LIMIT = 200 * 1024; // total source bytes
const TREE_PATH_LIMIT = 600; // entries shown in prompt

const CONFIG_FILE_NAMES = [
  "package.json",
  "tsconfig.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "nuxt.config.ts",
  "svelte.config.js",
  "remix.config.js",
  "astro.config.mjs",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "Pipfile",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
];

const SOURCE_PRIORITY_HINTS = [
  /^src\/index\.[tj]sx?$/,
  /^src\/main\.[tj]sx?$/,
  /^src\/app\.[tj]sx?$/,
  /^src\/main\.py$/,
  /^src\/main\.go$/,
  /^src\/main\.rs$/,
  /^app\/page\.[tj]sx?$/,
  /^app\/layout\.[tj]sx?$/,
  /^pages\/index\.[tj]sx?$/,
  /^pages\/_app\.[tj]sx?$/,
  /^index\.[tj]sx?$/,
  /^main\.[tj]sx?$/,
  /^main\.py$/,
  /^main\.go$/,
  /^main\.rs$/,
  /^cmd\/.+\/main\.go$/,
  /^lib\.rs$/,
];

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".rb",
  ".php",
  ".swift",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".vue",
  ".svelte",
];

const SOURCE_BLOCKLIST_DIRS = [
  "node_modules/",
  "vendor/",
  "dist/",
  "build/",
  ".next/",
  "out/",
  "target/",
  "__pycache__/",
  ".venv/",
  "venv/",
  "test/",
  "tests/",
  "__tests__/",
  "spec/",
  "examples/",
  "example/",
  "docs/",
  "doc/",
  ".git/",
];

export interface ParsedRepo {
  owner: string;
  repo: string;
  branch?: string;
}

export function parseRepoUrl(input: string): ParsedRepo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Forms supported:
  //   https://github.com/owner/repo
  //   https://github.com/owner/repo/tree/branch
  //   github.com/owner/repo
  //   owner/repo
  const shortMatch = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed);
  if (shortMatch && !trimmed.includes("://")) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  let urlString = trimmed;
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  let branch: string | undefined;
  if (segments[2] === "tree" && segments[3]) {
    branch = segments.slice(3).join("/");
  }
  return { owner, repo, branch };
}

function ghHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "toolkit-app",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function ghFetch(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: ghHeaders(),
    cache: "no-store",
  });
}

async function ghJson<T>(path: string): Promise<T> {
  const res = await ghFetch(path);
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.message ? ` — ${data.message}` : "";
    } catch {
      // ignore
    }
    throw new Error(`GitHub ${res.status} ${res.statusText}${detail}`);
  }
  return (await res.json()) as T;
}

async function ghText(path: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { ...ghHeaders(), Accept: "application/vnd.github.raw" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return await res.text();
}

interface RepoApi {
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  topics?: string[];
  license: { spdx_id?: string; name?: string } | null;
  homepage: string | null;
  pushed_at: string | null;
}

interface TreeApi {
  sha: string;
  truncated: boolean;
  tree: Array<{
    path: string;
    type: "blob" | "tree";
    size?: number;
    sha: string;
  }>;
}

function isProbablySource(path: string): boolean {
  const lower = path.toLowerCase();
  if (SOURCE_BLOCKLIST_DIRS.some((d) => lower.startsWith(d) || lower.includes(`/${d}`))) {
    return false;
  }
  if (lower.endsWith(".min.js") || lower.endsWith(".lock")) return false;
  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function pickSourceFiles(tree: FileEntry[]): string[] {
  const blobs = tree.filter((e) => e.type === "blob");
  const candidates = blobs.filter((e) => isProbablySource(e.path));

  // Prioritize matches in SOURCE_PRIORITY_HINTS
  const priority: FileEntry[] = [];
  const remaining: FileEntry[] = [];
  for (const f of candidates) {
    if (SOURCE_PRIORITY_HINTS.some((re) => re.test(f.path))) {
      priority.push(f);
    } else {
      remaining.push(f);
    }
  }

  // Then prefer shallow paths and reasonable size
  remaining.sort((a, b) => {
    const depthA = a.path.split("/").length;
    const depthB = b.path.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return (a.size ?? 0) - (b.size ?? 0);
  });

  const ordered = [...priority, ...remaining];
  const picked: string[] = [];
  let remainingBudget = TOTAL_SOURCE_LIMIT;
  for (const f of ordered) {
    if (picked.length >= 12) break;
    const size = Math.min(f.size ?? 0, FILE_BYTE_LIMIT);
    if (size === 0) continue;
    if (size > remainingBudget) continue;
    picked.push(f.path);
    remainingBudget -= size;
  }
  return picked;
}

export async function fetchRepoBundle(
  owner: string,
  repo: string,
  branchHint?: string,
): Promise<RepoBundle> {
  const repoApi = await ghJson<RepoApi>(`/repos/${owner}/${repo}`);
  const branch = branchHint || repoApi.default_branch;

  const meta: RepoMeta = {
    fullName: repoApi.full_name,
    description: repoApi.description,
    defaultBranch: repoApi.default_branch,
    language: repoApi.language,
    stars: repoApi.stargazers_count,
    forks: repoApi.forks_count,
    openIssues: repoApi.open_issues_count,
    topics: repoApi.topics ?? [],
    license: repoApi.license?.spdx_id || repoApi.license?.name || null,
    homepage: repoApi.homepage,
    pushedAt: repoApi.pushed_at,
  };

  const treeApi = await ghJson<TreeApi>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );

  const tree: FileEntry[] = treeApi.tree.map((t) => ({
    path: t.path,
    size: t.size ?? 0,
    type: t.type,
  }));

  // README — try the default helper first; falls back to scanning the tree.
  let readme = await ghText(`/repos/${owner}/${repo}/readme`);
  if (readme && readme.length > FILE_BYTE_LIMIT) {
    readme = readme.slice(0, FILE_BYTE_LIMIT) + "\n\n... (truncated)";
  }

  // Config files — try a curated list at repo root.
  const configFiles: Record<string, string> = {};
  await Promise.all(
    CONFIG_FILE_NAMES.map(async (name) => {
      if (!tree.find((t) => t.path === name && t.type === "blob")) return;
      const text = await ghText(
        `/repos/${owner}/${repo}/contents/${name}?ref=${encodeURIComponent(branch)}`,
      );
      if (text) {
        configFiles[name] =
          text.length > FILE_BYTE_LIMIT
            ? text.slice(0, FILE_BYTE_LIMIT) + "\n... (truncated)"
            : text;
      }
    }),
  );

  // Source files — heuristic pick.
  const sourcePaths = pickSourceFiles(tree);
  const sourceFiles: Record<string, string> = {};
  await Promise.all(
    sourcePaths.map(async (path) => {
      const text = await ghText(
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      );
      if (text) {
        sourceFiles[path] =
          text.length > FILE_BYTE_LIMIT
            ? text.slice(0, FILE_BYTE_LIMIT) + "\n... (truncated)"
            : text;
      }
    }),
  );

  return {
    owner,
    repo,
    branch,
    meta,
    treeTruncated: treeApi.truncated,
    tree: tree.slice(0, TREE_PATH_LIMIT),
    readme,
    configFiles,
    sourceFiles,
  };
}
