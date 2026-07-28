import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { initialJobsState } from "./jobs.state";
import {
  cancelJobThunk,
  createJobThunk,
  fetchJobDetailsThunk,
  fetchJobsThunk,
} from "./jobs.thunks";

const jobsSlice = createSlice({
  name: "jobs",
  initialState: initialJobsState,
  reducers: {
    setActiveJobId(state, action: PayloadAction<string | null>) {
      if (state.activeJobId === action.payload) {
        return;
      }
      state.activeJobId = action.payload;
      state.activeJobDetails = null;
      state.activeDetailsRequestId = null;
      state.status.details = "idle";
      state.errors.details = null;
    },
    clearActiveJob(state) {
      state.activeJobId = null;
      state.activeJobDetails = null;
      state.activeDetailsRequestId = null;
      state.status.details = "idle";
      state.errors.details = null;
    },
    clearCreateError(state) {
      state.errors.create = null;

      if (state.status.create === "failed") {
        state.status.create = "idle";
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobsThunk.pending, (state, action) => {
        state.activeListRequestId = action.meta.requestId;
        state.status.list = "loading";
        state.errors.list = null;
      })
      .addCase(fetchJobsThunk.fulfilled, (state, action) => {
        if (state.activeListRequestId !== action.meta.requestId) {
          return;
        }

        const activeDetails = state.activeJobDetails;

        state.jobs = action.payload.map((summary) => {
          if (activeDetails === null || summary.id !== activeDetails.id) {
            return summary;
          }

          return {
            ...summary,
            status: activeDetails.status,
            statistics: activeDetails.statistics,
          };
        });

        state.status.list = "succeeded";
        state.activeListRequestId = null;
        state.errors.list = null;
      })
      .addCase(fetchJobsThunk.rejected, (state, action) => {
        if (state.activeListRequestId !== action.meta.requestId) {
          return;
        }

        state.activeListRequestId = null;

        if (action.meta.aborted) {
          state.status.list = "idle";
          state.errors.list = null;
          return;
        }

        state.status.list = "failed";
        state.errors.list = action.payload ?? "Unable to load jobs";
      })
      .addCase(createJobThunk.pending, (state) => {
        state.status.create = "loading";
        state.errors.create = null;
      })
      .addCase(createJobThunk.fulfilled, (state, action) => {
        state.status.create = "succeeded";
        state.activeJobId = action.payload.jobId;
        state.activeJobDetails = null;
        state.activeDetailsRequestId = null;
        state.status.details = "idle";
        state.errors.create = null;
        state.errors.details = null;
      })
      .addCase(createJobThunk.rejected, (state, action) => {
        state.status.create = "failed";
        state.errors.create = action.payload ?? "Unable to create job";
      })
      .addCase(fetchJobDetailsThunk.pending, (state, action) => {
        if (state.activeJobDetails?.id !== action.meta.arg) {
          state.activeJobDetails = null;
        }

        const isSameJob = state.activeJobDetails?.id === action.meta.arg;

        if (!isSameJob) {
          state.activeJobDetails = null;
        }

        state.activeDetailsRequestId = action.meta.requestId;
        state.status.details = "loading";
        state.errors.details = null;
      })
      .addCase(fetchJobDetailsThunk.fulfilled, (state, action) => {
        if (
          state.activeJobId !== action.meta.arg ||
          state.activeDetailsRequestId !== action.meta.requestId
        ) {
          return;
        }

        state.activeJobDetails = action.payload;
        state.activeDetailsRequestId = null;
        state.status.details = "succeeded";
        state.errors.details = null;

        const summary = state.jobs.find((job) => job.id === action.payload.id);

        if (summary !== undefined) {
          summary.status = action.payload.status;
          summary.statistics = action.payload.statistics;
        }
      })
      .addCase(fetchJobDetailsThunk.rejected, (state, action) => {
        if (
          state.activeJobId !== action.meta.arg ||
          state.activeDetailsRequestId !== action.meta.requestId
        ) {
          return;
        }

        state.activeDetailsRequestId = null;

        if (action.meta.aborted) {
          state.status.details = "idle";
          state.errors.details = null;
          return;
        }

        state.status.details = "failed";
        state.errors.details = action.payload ?? "Unable to load job details";
      })
      .addCase(cancelJobThunk.pending, (state, action) => {
        state.status.cancel = "loading";
        state.errors.cancel = null;
        state.cancellingJobId = action.meta.arg;
        state.cancelErrorJobId = null;
      })
      .addCase(cancelJobThunk.fulfilled, (state, action) => {
        if (state.cancellingJobId !== action.meta.arg) {
          return;
        }

        state.status.cancel = "succeeded";
        state.errors.cancel = null;
        state.cancellingJobId = null;
        state.cancelErrorJobId = null;
      })
      .addCase(cancelJobThunk.rejected, (state, action) => {
        if (state.cancellingJobId !== action.meta.arg) {
          return;
        }

        state.cancellingJobId = null;

        if (action.meta.aborted) {
          state.status.cancel = "idle";
          state.errors.cancel = null;
          state.cancelErrorJobId = null;
          return;
        }

        state.status.cancel = "failed";
        state.errors.cancel = action.payload ?? "Unable to cancel job";
        state.cancelErrorJobId = action.meta.arg;
      });
  },
});

export const { clearActiveJob, setActiveJobId, clearCreateError } =
  jobsSlice.actions;

export const jobsReducer = jobsSlice.reducer;
