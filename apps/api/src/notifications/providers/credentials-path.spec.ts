import { findRepositoryRoot, resolveCredentialsPath } from './credentials-path';

const present = (...paths: string[]) => {
  const set = new Set(paths);
  return (path: string) => set.has(path);
};

describe('resolveCredentialsPath', () => {
  const cwd = '/repo/apps/api';

  it('uses an absolute path exactly as configured', () => {
    expect(resolveCredentialsPath('/etc/secrets/fcm.json', { cwd, exists: () => false })).toBe(
      '/etc/secrets/fcm.json',
    );
  });

  it('prefers the working directory when the file is there', () => {
    const exists = present(
      '/repo/apps/api/credentials/fcm.json',
      '/repo/credentials/fcm.json',
      '/repo/.git',
    );
    expect(resolveCredentialsPath('./credentials/fcm.json', { cwd, exists })).toBe(
      '/repo/apps/api/credentials/fcm.json',
    );
  });

  it('falls back to the repository root, which is where secrets actually live', () => {
    const exists = present('/repo/credentials/fcm.json', '/repo/.git');
    expect(resolveCredentialsPath('./credentials/fcm.json', { cwd, exists })).toBe(
      '/repo/credentials/fcm.json',
    );
  });

  it('names both places it looked when the file is in neither', () => {
    const exists = present('/repo/.git');
    let message = '';
    try {
      resolveCredentialsPath('./credentials/fcm.json', { cwd, exists });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('/repo/apps/api/credentials/fcm.json');
    expect(message).toContain('/repo/credentials/fcm.json');
  });

  it('says so when there is no repository root to fall back to', () => {
    expect(() =>
      resolveCredentialsPath('./credentials/fcm.json', { cwd, exists: () => false }),
    ).toThrow(/could not locate the repository root/);
  });
});

describe('findRepositoryRoot', () => {
  it('walks up to the nearest folder holding a .git entry', () => {
    expect(findRepositoryRoot('/repo/apps/api/dist', present('/repo/.git'))).toBe('/repo');
  });

  it('returns null rather than walking forever', () => {
    expect(findRepositoryRoot('/a/b/c', () => false)).toBeNull();
  });
});
