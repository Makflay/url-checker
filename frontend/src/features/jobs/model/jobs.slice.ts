import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { initialJobsState } from "./jobs.state";

const jobsSlice = createSlice({
  name: "jobs",
  initialState: initialJobsState,
  reducers: {
    setActiveJobId(state, action: PayloadAction<string | null>) {
      state.activeJobId = action.payload;
      state.activeJobDetails = null;
      state.errors.details = null;
    },
    clearActiveJob(state) {
      state.activeJobId = null;
      state.activeJobDetails = null;
      state.loading.details = false;
      state.errors.details = null;
    },
  },
});

export const { clearActiveJob, setActiveJobId } = jobsSlice.actions;

export const jobsReducer = jobsSlice.reducer;
