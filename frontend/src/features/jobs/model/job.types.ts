export type JobStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

export type UrlCheckStatus =
  | "pending"
  | "in_progress"
  | "success"
  | "error"
  | "cancelled";

export interface CreateJobRequest {
  urls: string[];
}

export interface CreateJobResponse {
  jobId: string;
}

export interface JobStatistics {
  total: number;
  pending: number;
  inProgress: number;
  success: number;
  error: number;
  cancelled: number;
  processed: number;
}

export interface JobUrlResult {
  id: string;
  url: string;
  status: UrlCheckStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface JobSummary {
  id: string;
  createdAt: string;
  status: JobStatus;
  statistics: JobStatistics;
}

export interface JobDetails {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: JobStatus;
  statistics: JobStatistics;
  items: JobUrlResult[];
  failureMessage: string | null;
}
