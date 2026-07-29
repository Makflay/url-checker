import { describe, expect, it } from "vitest";

import type { JobDetails, JobStatistics, JobSummary } from "./job.types";
import { jobsReducer, setActiveJobId } from "./jobs.slice";
import { fetchJobDetailsThunk, fetchJobsThunk } from "./jobs.thunks";

function createStatistics(
  overrides: Partial<JobStatistics> = {},
): JobStatistics {
  return {
    total: 1,
    pending: 1,
    inProgress: 0,
    success: 0,
    error: 0,
    cancelled: 0,
    processed: 0,
    ...overrides,
  };
}

function createJobSummary(
  id: string,
  overrides: Partial<JobSummary> = {},
): JobSummary {
  return {
    id,
    createdAt: "2026-01-01T10:00:00.000Z",
    status: "pending",
    statistics: createStatistics(),
    ...overrides,
  };
}

function createJobDetails(
  id: string,
  overrides: Partial<JobDetails> = {},
): JobDetails {
  return {
    id,
    createdAt: "2026-01-01T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    status: "pending",
    statistics: createStatistics(),
    items: [
      {
        id: `${id}-item`,
        url: `https://${id}.example.com`,
        status: "pending",
        httpStatus: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
      },
    ],
    failureMessage: null,
    ...overrides,
  };
}

describe("jobsReducer stale response handling", () => {
  it("ignores an older list response after a newer request succeeds", () => {
    const olderRequestId = "list-request-older";
    const newerRequestId = "list-request-newer";

    const olderPayload = [createJobSummary("job-older")];

    const newerPayload = [
      createJobSummary("job-newer", {
        status: "in_progress",
        statistics: createStatistics({
          pending: 0,
          inProgress: 1,
        }),
      }),
    ];

    let state = jobsReducer(
      undefined,
      fetchJobsThunk.pending(olderRequestId, undefined),
    );

    state = jobsReducer(
      state,
      fetchJobsThunk.pending(newerRequestId, undefined),
    );

    state = jobsReducer(
      state,
      fetchJobsThunk.fulfilled(newerPayload, newerRequestId, undefined),
    );

    expect(state.jobs).toEqual(newerPayload);
    expect(state.status.list).toBe("succeeded");
    expect(state.activeListRequestId).toBeNull();

    const stateAfterNewerResponse = state;

    state = jobsReducer(
      state,
      fetchJobsThunk.fulfilled(olderPayload, olderRequestId, undefined),
    );

    expect(state).toBe(stateAfterNewerResponse);
    expect(state.jobs).toEqual(newerPayload);

    state = jobsReducer(
      state,
      fetchJobsThunk.rejected(
        new Error("Older request failed"),
        olderRequestId,
        undefined,
        "Stale list error",
      ),
    );

    expect(state).toBe(stateAfterNewerResponse);
    expect(state.status.list).toBe("succeeded");
    expect(state.errors.list).toBeNull();
    expect(state.jobs).toEqual(newerPayload);
  });

  it("does not replace Job B with a late details response for Job A", () => {
    const jobARequestId = "details-job-a";
    const jobBRequestId = "details-job-b";

    const jobADetails = createJobDetails("job-a", {
      status: "completed",
      startedAt: "2026-01-01T10:00:01.000Z",
      finishedAt: "2026-01-01T10:00:02.000Z",
      statistics: createStatistics({
        pending: 0,
        success: 1,
        processed: 1,
      }),
    });

    const jobBDetails = createJobDetails("job-b", {
      status: "in_progress",
      startedAt: "2026-01-01T10:00:03.000Z",
      statistics: createStatistics({
        pending: 0,
        inProgress: 1,
      }),
    });

    let state = jobsReducer(undefined, setActiveJobId("job-a"));

    state = jobsReducer(
      state,
      fetchJobDetailsThunk.pending(jobARequestId, "job-a"),
    );

    state = jobsReducer(state, setActiveJobId("job-b"));

    state = jobsReducer(
      state,
      fetchJobDetailsThunk.pending(jobBRequestId, "job-b"),
    );

    state = jobsReducer(
      state,
      fetchJobDetailsThunk.fulfilled(jobBDetails, jobBRequestId, "job-b"),
    );

    expect(state.activeJobId).toBe("job-b");
    expect(state.activeJobDetails).toEqual(jobBDetails);
    expect(state.status.details).toBe("succeeded");

    const stateAfterJobBResponse = state;

    state = jobsReducer(
      state,
      fetchJobDetailsThunk.fulfilled(jobADetails, jobARequestId, "job-a"),
    );

    expect(state).toBe(stateAfterJobBResponse);
    expect(state.activeJobId).toBe("job-b");
    expect(state.activeJobDetails).toEqual(jobBDetails);

    state = jobsReducer(
      state,
      fetchJobDetailsThunk.rejected(
        new Error("Late Job A failure"),
        jobARequestId,
        "job-a",
        "Stale details error",
      ),
    );

    expect(state).toBe(stateAfterJobBResponse);
    expect(state.status.details).toBe("succeeded");
    expect(state.errors.details).toBeNull();
    expect(state.activeJobDetails).toEqual(jobBDetails);
  });

  it("updates the matching summary from details and prevents a later list response from rolling it back", () => {
    const initialListRequestId = "initial-list";
    const detailsRequestId = "details-completed";
    const refreshListRequestId = "refresh-list";

    const initialSummary = createJobSummary("job-1", {
      status: "in_progress",
      statistics: createStatistics({
        pending: 0,
        inProgress: 1,
      }),
    });

    const completedStatistics = createStatistics({
      pending: 0,
      success: 1,
      processed: 1,
    });

    const completedDetails = createJobDetails("job-1", {
      status: "completed",
      startedAt: "2026-01-01T10:00:01.000Z",
      finishedAt: "2026-01-01T10:00:02.000Z",
      statistics: completedStatistics,
      items: [
        {
          id: "job-1-item",
          url: "https://job-1.example.com",
          status: "success",
          httpStatus: 200,
          errorMessage: null,
          startedAt: "2026-01-01T10:00:01.000Z",
          finishedAt: "2026-01-01T10:00:02.000Z",
          durationMs: 1_000,
        },
      ],
    });

    let state = jobsReducer(
      undefined,
      fetchJobsThunk.pending(initialListRequestId, undefined),
    );

    state = jobsReducer(
      state,
      fetchJobsThunk.fulfilled(
        [initialSummary],
        initialListRequestId,
        undefined,
      ),
    );

    state = jobsReducer(state, setActiveJobId("job-1"));

    state = jobsReducer(
      state,
      fetchJobDetailsThunk.pending(detailsRequestId, "job-1"),
    );

    state = jobsReducer(
      state,
      fetchJobDetailsThunk.fulfilled(
        completedDetails,
        detailsRequestId,
        "job-1",
      ),
    );

    expect(state.activeJobDetails).toEqual(completedDetails);
    expect(state.jobs[0]?.status).toBe("completed");
    expect(state.jobs[0]?.statistics).toEqual(completedStatistics);

    const staleSummary = createJobSummary("job-1", {
      status: "in_progress",
      statistics: createStatistics({
        pending: 0,
        inProgress: 1,
      }),
    });

    state = jobsReducer(
      state,
      fetchJobsThunk.pending(refreshListRequestId, undefined),
    );

    state = jobsReducer(
      state,
      fetchJobsThunk.fulfilled([staleSummary], refreshListRequestId, undefined),
    );

    expect(state.activeJobDetails).toEqual(completedDetails);
    expect(state.jobs[0]).toEqual({
      ...staleSummary,
      status: "completed",
      statistics: completedStatistics,
    });
    expect(state.status.list).toBe("succeeded");
    expect(state.errors.list).toBeNull();
  });
});
