const SNAPSHOT_TTL_MS = 2 * 60 * 1000;

export function isSnapshotStale(fetchedAt: number | null): boolean {
  if (fetchedAt === null) return true;
  return Date.now() - fetchedAt > SNAPSHOT_TTL_MS;
}
