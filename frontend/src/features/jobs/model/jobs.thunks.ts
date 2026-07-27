import { createAsyncThunk } from "@reduxjs/toolkit";

import type { RootState } from "../../../app/store/store";
import { ApiError } from "../../../shared/api";
import { cancelJob, createJob, getJobById, getJobs } from "../api";
import type {
  CreateJobRequest,
  CreateJobResponse,
  JobDetails,
  JobSummary,
} from "./job.types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return "An unexpected error occurred";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const fetchJobsThunk = createAsyncThunk<
  JobSummary[],
  void,
  { rejectValue: string }
>("jobs/fetchJobs", async (_, { rejectWithValue }) => {
  try {
    return await getJobs();
  } catch (error: unknown) {
    return rejectWithValue(getErrorMessage(error));
  }
});

export const createJobThunk = createAsyncThunk<
  CreateJobResponse,
  CreateJobRequest,
  { rejectValue: string }
>("jobs/createJob", async (payload, { dispatch, rejectWithValue }) => {
  try {
    const result = await createJob(payload);

    void dispatch(fetchJobsThunk());

    return result;
  } catch (error: unknown) {
    return rejectWithValue(getErrorMessage(error));
  }
});

export const fetchJobDetailsThunk = createAsyncThunk<
  JobDetails,
  string,
  {
    rejectValue: string;
  }
>("jobs/fetchJobDetails", async (jobId, { signal, rejectWithValue }) => {
  try {
    return await getJobById(jobId, signal);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }

    return rejectWithValue(getErrorMessage(error));
  }
});

export const cancelJobThunk = createAsyncThunk<
  string,
  string,
  {
    state: RootState;
    rejectValue: string;
  }
>("jobs/cancelJob", async (jobId, { dispatch, getState, rejectWithValue }) => {
  try {
    await cancelJob(jobId);

    const state = getState();

    void dispatch(fetchJobsThunk());

    if (state.jobs.activeJobId === jobId) {
      void dispatch(fetchJobDetailsThunk(jobId));
    }

    return jobId;
  } catch (error: unknown) {
    return rejectWithValue(getErrorMessage(error));
  }
});
