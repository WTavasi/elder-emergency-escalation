import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface PathLookup {
  cwd?: string;
  exists?: (path: string) => boolean;
}

/**
 * Finds a credentials file named by a relative path in configuration.
 *
 * The working directory is not a reliable base in a monorepo. `npm run dev -w` starts
 * the API in apps/api, running the compiled output starts it wherever the process was
 * launched, and a deployment host picks its own. Meanwhile secrets belong in one place,
 * the repository's credentials folder, so that one .gitignore rule covers all of them.
 *
 * So a relative path is tried against the working directory first, then against the
 * repository root. An absolute path is used as given.
 */
export function resolveCredentialsPath(configured: string, lookup: PathLookup = {}): string {
  const cwd = lookup.cwd ?? process.cwd();
  const exists = lookup.exists ?? existsSync;

  if (isAbsolute(configured)) return configured;

  const fromCwd = resolve(cwd, configured);
  if (exists(fromCwd)) return fromCwd;

  const root = findRepositoryRoot(cwd, exists);
  if (root) {
    const fromRoot = resolve(root, configured);
    if (exists(fromRoot)) return fromRoot;
  }

  throw new Error(
    [
      `Could not find "${configured}".`,
      `Looked in ${fromCwd}`,
      root ? `and in ${resolve(root, configured)}` : 'and could not locate the repository root',
      'Put the file in the repository credentials folder, or set an absolute path.',
    ].join(' '),
  );
}

/** Nearest ancestor of the working directory that contains a .git entry. */
export function findRepositoryRoot(from: string, exists: (path: string) => boolean): string | null {
  let current = resolve(from);

  // Bounded rather than while(true): a symlink loop or an odd mount should not hang
  // the process at startup.
  for (let depth = 0; depth < 12; depth += 1) {
    if (exists(join(current, '.git'))) return current;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }

  return null;
}
