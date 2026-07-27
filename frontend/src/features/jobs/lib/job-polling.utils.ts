import type { JobStatus } from "../model/job.types";

export function isPollingJobStatus(status: JobStatus): boolean {
  return status === "pending" || status === "in_progress";
}
