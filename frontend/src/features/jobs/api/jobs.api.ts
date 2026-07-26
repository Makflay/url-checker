import { apiRequest } from "../../../shared/api";
import type {
  CreateJobRequest,
  CreateJobResponse,
  JobDetails,
  JobSummary,
} from "../model";

const JOBS_PATH = "/api/jobs";

export function createJob(
  payload: CreateJobRequest,
): Promise<CreateJobResponse> {
  return apiRequest<CreateJobResponse>(JOBS_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function getJobs(): Promise<JobSummary[]> {
  return apiRequest<JobSummary[]>(JOBS_PATH, {
    method: "GET",
  });
}

export function getJobById(
  id: string,
  signal?: AbortSignal,
): Promise<JobDetails> {
  const encodedId = encodeURIComponent(id);

  return apiRequest<JobDetails>(`${JOBS_PATH}/${encodedId}`, {
    method: "GET",
    signal,
  });
}

export function cancelJob(id: string): Promise<void> {
  const encodedId = encodeURIComponent(id);

  return apiRequest<void>(`${JOBS_PATH}/${encodedId}`, {
    method: "DELETE",
  });
}
