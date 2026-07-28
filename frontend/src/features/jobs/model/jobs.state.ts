import type { JobDetails, JobSummary } from "./job.types";

export type RequestStatus = "idle" | "loading" | "succeeded" | "failed";

export interface JobsRequestStatus {
  list: RequestStatus;
  create: RequestStatus;
  details: RequestStatus;
  cancel: RequestStatus;
}

export interface JobsErrorsState {
  list: string | null;
  create: string | null;
  details: string | null;
  cancel: string | null;
}

export interface JobsState {
  jobs: JobSummary[];
  activeJobId: string | null;
  activeJobDetails: JobDetails | null;
  activeListRequestId: string | null;
  activeDetailsRequestId: string | null;
  cancellingJobId: string | null;
  cancelErrorJobId: string | null;
  status: JobsRequestStatus;
  errors: JobsErrorsState;
}

export const initialJobsState: JobsState = {
  jobs: [],
  activeJobId: null,
  activeJobDetails: null,
  activeListRequestId: null,
  activeDetailsRequestId: null,
  cancellingJobId: null,
  cancelErrorJobId: null,
  status: {
    list: "idle",
    create: "idle",
    details: "idle",
    cancel: "idle",
  },
  errors: {
    list: null,
    create: null,
    details: null,
    cancel: null,
  },
};
