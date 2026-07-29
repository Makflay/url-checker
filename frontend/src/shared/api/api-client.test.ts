import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { API_BASE_URL } from "./api.constants";
import { apiRequest } from "./api-client";
import { ApiError } from "./api-error";

function createJsonResponse(body: unknown, init: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

describe("apiRequest", () => {
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("rejects a path that does not start with a slash", async () => {
    await expect(apiRequest("api/jobs")).rejects.toThrow(
      'API request path must start with "/"',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const request = apiRequest("/api/jobs");

    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      message: "Unable to connect to the server",
      status: 0,
      details: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/api/jobs`, {});
  });

  it("uses a backend string message for a non-success response", async () => {
    const backendBody = {
      statusCode: 404,
      message: "Job was not found",
      error: "Not Found",
    };

    fetchMock.mockResolvedValue(
      createJsonResponse(backendBody, {
        status: 404,
      }),
    );

    const request = apiRequest("/api/jobs/unknown");

    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      message: "Job was not found",
      status: 404,
      details: backendBody,
    });
  });

  it("joins backend validation messages", async () => {
    const backendBody = {
      statusCode: 400,
      message: ["urls is required", "urls must be an array", "", 123],
      error: "Bad Request",
    };

    fetchMock.mockResolvedValue(
      createJsonResponse(backendBody, {
        status: 400,
      }),
    );

    await expect(apiRequest("/api/jobs")).rejects.toMatchObject({
      name: "ApiError",
      message: "urls is required; urls must be an array",
      status: 400,
      details: backendBody,
    });
  });

  it("uses the HTTP status fallback when the error body has no message", async () => {
    fetchMock.mockResolvedValue(
      new Response("Gateway unavailable", {
        status: 502,
        headers: {
          "Content-Type": "text/plain",
        },
      }),
    );

    await expect(apiRequest("/api/jobs")).rejects.toMatchObject({
      name: "ApiError",
      message: "Request failed with status 502",
      status: 502,
      details: "Gateway unavailable",
    });
  });

  it("reports an invalid successful JSON response", async () => {
    fetchMock.mockResolvedValue(
      new Response("{invalid-json", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    await expect(apiRequest("/api/jobs")).rejects.toMatchObject({
      name: "ApiError",
      message: "Server returned an invalid response",
      status: 200,
      details: null,
    });
  });

  it("returns undefined for a successful 204 response", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    await expect(
      apiRequest<void>("/api/jobs/job-1", {
        method: "DELETE",
      }),
    ).resolves.toBeUndefined();
  });

  it("preserves an AbortError from fetch", async () => {
    const abortError = new Error("The request was aborted");
    abortError.name = "AbortError";

    fetchMock.mockRejectedValue(abortError);

    await expect(apiRequest("/api/jobs")).rejects.toBe(abortError);
  });

  it("creates ApiError instances for normalized failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    try {
      await apiRequest("/api/jobs");
      throw new Error("Expected apiRequest to reject");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ApiError);
    }
  });
});
