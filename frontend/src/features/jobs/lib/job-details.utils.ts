import type { UrlCheckStatus } from "../model/job.types";
import { formatJobCreatedAt } from "./job-list.utils";

const URL_STATUS_LABELS: Record<UrlCheckStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  success: "Success",
  error: "Error",
  cancelled: "Cancelled",
};

export function formatDateTime(value: string | null): string {
  if (value === null) {
    return "—";
  }

  return formatJobCreatedAt(value);
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "—";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  if (durationMs < 60_000) {
    const seconds = durationMs / 1000;
    const fractionDigits = seconds >= 10 ? 1 : 2;
    const formattedSeconds = Number(seconds.toFixed(fractionDigits));

    return `${formattedSeconds} s`;
  }

  const totalSeconds = Math.round(durationMs / 1000);

  const minutes = Math.floor(totalSeconds / 60);

  const seconds = totalSeconds % 60;

  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

export function formatUrlCheckStatus(status: UrlCheckStatus): string {
  return URL_STATUS_LABELS[status];
}
