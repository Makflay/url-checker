import type { JobStatus } from "../model/job.types";

const jobDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function formatJobId(id: string, visibleLength = 8): string {
  if (id.length <= visibleLength) {
    return id;
  }

  return `${id.slice(0, visibleLength)}…`;
}

export function formatJobCreatedAt(value: string): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return "Unknown date";
  }

  return jobDateFormatter.format(timestamp);
}

export function formatJobStatus(status: JobStatus): string {
  return JOB_STATUS_LABELS[status];
}
