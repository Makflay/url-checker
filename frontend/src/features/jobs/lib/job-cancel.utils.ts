import type { JobStatus } from "../model/job.types";

export function isJobCancellable(status: JobStatus): boolean {
  return status === "pending" || status === "in_progress";
}
