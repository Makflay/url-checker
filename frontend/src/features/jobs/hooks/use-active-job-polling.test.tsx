import { configureStore } from "@reduxjs/toolkit";
import type { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import { act, renderHook } from "@testing-library/react";
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
import { initialJobsState, jobsReducer, setActiveJobId } from "../model";
import type { JobDetails, JobStatus, UrlCheckStatus } from "../model";
import { ACTIVE_JOB_POLLING_INTERVAL_MS } from "../lib/job-polling.constants";
import { useActiveJobPolling } from "./use-active-job-polling";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly settled: boolean;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,

    get settled(): boolean {
      return settled;
    },

    resolve(value: T | PromiseLike<T>): void {
      if (settled) {
        return;
      }

      settled = true;
      resolvePromise(value);
    },

    reject(reason?: unknown): void {
      if (settled) {
        return;
      }

      settled = true;
      rejectPromise(reason);
    },
  };
}

function getItemStatus(status: JobStatus): UrlCheckStatus {
  switch (status) {
    case "pending":
      return "pending";

    case "in_progress":
      return "in_progress";

    case "completed":
      return "success";

    case "cancelled":
      return "cancelled";

    case "failed":
      return "error";
  }
}

function createJobDetails(id: string, status: JobStatus): JobDetails {
  const itemStatus = getItemStatus(status);
  const isTerminal =
    status === "completed" || status === "cancelled" || status === "failed";

  const isStarted = status !== "pending";

  return {
    id,
    createdAt: "2026-01-01T10:00:00.000Z",
    startedAt: isStarted ? "2026-01-01T10:00:01.000Z" : null,
    finishedAt: isTerminal ? "2026-01-01T10:00:02.000Z" : null,
    status,
    statistics: {
      total: 1,
      pending: status === "pending" ? 1 : 0,
      inProgress: status === "in_progress" ? 1 : 0,
      success: status === "completed" ? 1 : 0,
      error: status === "failed" ? 1 : 0,
      cancelled: status === "cancelled" ? 1 : 0,
      processed: isTerminal ? 1 : 0,
    },
    items: [
      {
        id: `${id}-item`,
        url: `https://${id}.example.com`,
        status: itemStatus,
        httpStatus: status === "completed" ? 200 : null,
        errorMessage: status === "failed" ? "Job processing failed" : null,
        startedAt: isStarted ? "2026-01-01T10:00:01.000Z" : null,
        finishedAt: isTerminal ? "2026-01-01T10:00:02.000Z" : null,
        durationMs: isTerminal ? 1_000 : null,
      },
    ],
    failureMessage: status === "failed" ? "Job processing failed" : null,
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

function createTestStore(activeJobId: string | null) {
  return configureStore({
    reducer: {
      jobs: jobsReducer,
    },
    preloadedState: {
      jobs: {
        ...initialJobsState,
        activeJobId,
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

function createStoreWrapper(store: ReturnType<typeof createTestStore>) {
  function StoreWrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>;
  }

  return StoreWrapper;
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

describe("useActiveJobPolling", () => {
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

  it("starts immediately, polls sequentially and retries after a temporary error", async () => {
    const firstResponse = createDeferred<Response>();
    const thirdResponse = createDeferred<Response>();

    fetchMock
      .mockImplementationOnce(() => firstResponse.promise)
      .mockRejectedValueOnce(new TypeError("Temporary network failure"))
      .mockImplementationOnce(() => thirdResponse.promise);

    const store = createTestStore("job-1");
    const wrapper = createStoreWrapper(store);

    const { rerender, unmount } = renderHook(() => useActiveJobPolling(), {
      wrapper,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_BASE_URL}/api/jobs/job-1`,
      expect.objectContaining({
        method: "GET",
      }),
    );

    rerender();

    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS * 2);
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    firstResponse.resolve(
      createJsonResponse(createJobDetails("job-1", "in_progress")),
    );

    await flushAsyncWork();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS - 1);
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await flushAsyncWork();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    thirdResponse.resolve(
      createJsonResponse(createJobDetails("job-1", "completed")),
    );

    await flushAsyncWork();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS * 2);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    unmount();
  });

  it.each<JobStatus>(["completed", "cancelled", "failed"])(
    "stops polling when the first response has terminal status %s",
    async (terminalStatus) => {
      fetchMock.mockResolvedValue(
        createJsonResponse(createJobDetails("job-terminal", terminalStatus)),
      );

      const store = createTestStore("job-terminal");
      const wrapper = createStoreWrapper(store);

      const { unmount } = renderHook(() => useActiveJobPolling(), {
        wrapper,
      });

      expect(fetchMock).toHaveBeenCalledOnce();

      await flushAsyncWork();

      expect(store.getState().jobs.activeJobDetails?.status).toBe(
        terminalStatus,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS * 5);
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      unmount();
    },
  );

  it("does not start a request when there is no active job", () => {
    const store = createTestStore(null);
    const wrapper = createStoreWrapper(store);

    const { unmount } = renderHook(() => useActiveJobPolling(), {
      wrapper,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    unmount();
  });

  it("aborts the previous request when the active job changes and aborts the current request on unmount", async () => {
    const jobAResponse = createDeferred<Response>();
    const jobBResponse = createDeferred<Response>();

    fetchMock
      .mockImplementationOnce(() => jobAResponse.promise)
      .mockImplementationOnce(() => jobBResponse.promise);

    const store = createTestStore("job-a");
    const wrapper = createStoreWrapper(store);

    const { unmount } = renderHook(() => useActiveJobPolling(), {
      wrapper,
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const jobAOptions = fetchMock.mock.calls[0]?.[1];
    const jobASignal = jobAOptions?.signal;

    expect(jobASignal).toBeInstanceOf(AbortSignal);
    expect(jobASignal?.aborted).toBe(false);

    act(() => {
      store.dispatch(setActiveJobId("job-b"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobASignal?.aborted).toBe(true);

    const jobBOptions = fetchMock.mock.calls[1]?.[1];
    const jobBSignal = jobBOptions?.signal;

    expect(jobBSignal).toBeInstanceOf(AbortSignal);
    expect(jobBSignal?.aborted).toBe(false);

    unmount();

    expect(jobBSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    jobAResponse.resolve(
      createJsonResponse(createJobDetails("job-a", "in_progress")),
    );

    jobBResponse.resolve(
      createJsonResponse(createJobDetails("job-b", "in_progress")),
    );

    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.getState().jobs.activeJobId).toBe("job-b");
    expect(store.getState().jobs.activeJobDetails).toBeNull();
  });

  it("clears a scheduled polling timer on unmount", async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(createJobDetails("job-timer", "in_progress")),
    );

    const store = createTestStore("job-timer");
    const wrapper = createStoreWrapper(store);

    const { unmount } = renderHook(() => useActiveJobPolling(), {
      wrapper,
    });

    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_JOB_POLLING_INTERVAL_MS * 2);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
