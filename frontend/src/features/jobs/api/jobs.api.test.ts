import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { API_BASE_URL } from "../../../shared/api/api.constants";
import type {
  CreateJobResponse,
  JobDetails,
  JobSummary,
} from "../model/job.types";
import { cancelJob, createJob, getJobById, getJobs } from "./jobs.api";

const STATISTICS = {
  total: 1,
  pending: 1,
  inProgress: 0,
  success: 0,
  error: 0,
  cancelled: 0,
  processed: 0,
};

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

describe("jobs API", () => {
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("creates a job with a JSON POST request", async () => {
    const payload = {
      urls: ["https://first.example.com", "https://second.example.com"],
    };

    const responseBody: CreateJobResponse = {
      jobId: "job-created",
    };

    fetchMock.mockResolvedValue(
      createJsonResponse(responseBody, {
        status: 201,
      }),
    );

    await expect(createJob(payload)).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/api/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  });

  it("loads the jobs list with GET", async () => {
    const responseBody: JobSummary[] = [
      {
        id: "job-list",
        createdAt: "2026-01-01T10:00:00.000Z",
        status: "pending",
        statistics: STATISTICS,
      },
    ];

    fetchMock.mockResolvedValue(createJsonResponse(responseBody));

    await expect(getJobs()).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/api/jobs`, {
      method: "GET",
    });
  });

  it("loads encoded job details and forwards the abort signal", async () => {
    const jobId = "job/id with spaces";
    const controller = new AbortController();

    const responseBody: JobDetails = {
      id: jobId,
      createdAt: "2026-01-01T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      status: "pending",
      statistics: STATISTICS,
      items: [
        {
          id: "item-1",
          url: "https://example.com",
          status: "pending",
          httpStatus: null,
          errorMessage: null,
          startedAt: null,
          finishedAt: null,
          durationMs: null,
        },
      ],
      failureMessage: null,
    };

    fetchMock.mockResolvedValue(createJsonResponse(responseBody));

    await expect(getJobById(jobId, controller.signal)).resolves.toEqual(
      responseBody,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        signal: controller.signal,
      },
    );
  });

  it("cancels an encoded job with DELETE and accepts an empty 204 response", async () => {
    const jobId = "job/id with spaces";

    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(cancelJob(jobId)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "DELETE",
      },
    );
  });
});
