import type { JobStatus } from "../model/job.types";

export function isPollingJobStatus(
  status: JobStatus,
  finishedAt: string | null,
): boolean {
  return (
    status === "pending" ||
    status === "in_progress" ||
    (status === "cancelled" && finishedAt === null)
  );
}
