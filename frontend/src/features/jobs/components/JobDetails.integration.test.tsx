import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { API_BASE_URL } from "../../../shared/api/api.constants";
import { ACTIVE_JOB_POLLING_INTERVAL_MS } from "../lib/job-polling.constants";
import type {
  JobDetails as JobDetailsModel,
  JobStatus,
  UrlCheckStatus,
} from "../model/job.types";
import { initialJobsState, jobsReducer } from "../model";
import { JobDetails } from "./JobDetails";

const JOB_ID = "job-polling-integration";
const JOB_URL = "https://example.com";

function createJobDetails(status: JobStatus): JobDetailsModel {
  const isCompleted = status === "completed";

  const itemStatus: UrlCheckStatus = isCompleted ? "success" : "in_progress";

  return {
    id: JOB_ID,
    createdAt: "2026-01-01T10:00:00.000Z",
    startedAt: "2026-01-01T10:00:01.000Z",
    finishedAt: isCompleted ? "2026-01-01T10:00:02.000Z" : null,
    status,
    statistics: {
      total: 1,
      pending: 0,
      inProgress: isCompleted ? 0 : 1,
      success: isCompleted ? 1 : 0,
      error: 0,
      cancelled: 0,
      processed: isCompleted ? 1 : 0,
    },
    items: [
      {
        id: "item-1",
        url: JOB_URL,
        status: itemStatus,
        httpStatus: isCompleted ? 200 : null,
        errorMessage: null,
        startedAt: "2026-01-01T10:00:01.000Z",
        finishedAt: isCompleted ? "2026-01-01T10:00:02.000Z" : null,
        durationMs: isCompleted ? 1_000 : null,
      },
    ],
    failureMessage: null,
  };
}

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createTestStore() {
  return configureStore({
    reducer: {
      jobs: jobsReducer,
    },
    preloadedState: {
      jobs: {
        ...initialJobsState,
        jobs: [
          {
            id: JOB_ID,
            createdAt: "2026-01-01T10:00:00.000Z",
            status: "in_progress" as const,
            statistics: {
              total: 1,
              pending: 0,
              inProgress: 1,
              success: 0,
              error: 0,
              cancelled: 0,
              processed: 0,
            },
          },
        ],
        activeJobId: JOB_ID,
        status: {
          ...initialJobsState.status,
        },
        errors: {
          ...initialJobsState.errors,
        },
      },
    },
  });
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

describe("JobDetails polling integration", () => {
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    vi.useFakeTimers();

    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("updates the UI until completion and stops polling", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse(createJobDetails("in_progress")),
      )
      .mockResolvedValueOnce(createJsonResponse(createJobDetails("completed")));

    const store = createTestStore();

    render(
      <Provider store={store}>
        <JobDetails />
      </Provider>,
    );

    expect(screen.getByText(/Loading job details/i)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_BASE_URL}/api/jobs/${JOB_ID}`,
      expect.objectContaining({
        method: "GET",
      }),
    );

    await flushAsyncWork();

    expect(
      screen.getByRole("progressbar", {
        name: "Job progress: 0 of 1",
      }),
    ).toBeInTheDocument();

    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);

    expect(
      screen.getByRole("button", {
        name: "Cancel job",
      }),
    ).toBeEnabled();

    expect(
      screen.getByRole("link", {
        name: JOB_URL,
      }),
    ).toBeInTheDocument();

    expect(store.getState().jobs.activeJobDetails?.status).toBe("in_progress");

    expect(store.getState().jobs.jobs[0]?.status).toBe("in_progress");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS);
    });

    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(screen.getByText("Completed")).toBeInTheDocument();

    expect(
      screen.getByRole("progressbar", {
        name: "Job progress: 1 of 1",
      }),
    ).toBeInTheDocument();

    expect(screen.getAllByText("Success")).toHaveLength(2);

    expect(screen.getByText("200")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Cancel job",
      }),
    ).not.toBeInTheDocument();

    expect(store.getState().jobs.activeJobDetails?.status).toBe("completed");

    expect(store.getState().jobs.jobs[0]?.status).toBe("completed");

    expect(store.getState().jobs.jobs[0]?.statistics).toEqual(
      store.getState().jobs.activeJobDetails?.statistics,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS * 3);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
