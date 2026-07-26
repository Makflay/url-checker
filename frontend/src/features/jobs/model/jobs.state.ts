import type { JobDetails, JobSummary } from "./job.types";

export interface JobsLoadingState {
  list: boolean;
  create: boolean;
  details: boolean;
  cancel: boolean;
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
  loading: JobsLoadingState;
  errors: JobsErrorsState;
}

export const initialJobsState: JobsState = {
  jobs: [],
  activeJobId: null,
  activeJobDetails: null,
  loading: {
    list: false,
    create: false,
    details: false,
    cancel: false,
  },
  errors: {
    list: null,
    create: null,
    details: null,
    cancel: null,
  },
};
