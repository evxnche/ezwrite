export interface SyncBatchFailure {
  projectId: string;
  error: Error;
}

export function toSyncError(error: unknown, fallback = 'Sync failed'): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string' && error) return new Error(error);
  return new Error(fallback);
}

// Runs sync work sequentially so later projects still get a chance to sync when
// one project fails, and the caller can re-queue only the failures.
export async function runSequentialSyncBatch(
  projectIds: Iterable<string>,
  syncProject: (projectId: string) => Promise<void>,
): Promise<{ failed: SyncBatchFailure[] }> {
  const failed: SyncBatchFailure[] = [];

  for (const projectId of projectIds) {
    try {
      await syncProject(projectId);
    } catch (error) {
      failed.push({ projectId, error: toSyncError(error) });
    }
  }

  return { failed };
}
