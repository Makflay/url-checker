import { API_BASE_URL } from "./api.constants";
import { ApiError } from "./api-error";
import { isAbortError } from "./is-abort-error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) {
    return fallback;
  }

  const message = body.message;

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );

    if (messages.length > 0) {
      return messages.map((item) => item.trim()).join("; ");
    }
  }

  return fallback;
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("json")) {
      return (await response.json()) as unknown;
    }

    const text = await response.text();

    return text.trim() || null;
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }

    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error('API request path must start with "/"');
  }

  const url = `${API_BASE_URL}${path}`;

  let response: Response;

  try {
    response = await fetch(url, options);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new ApiError("Unable to connect to the server", 0);
  }

  if (!response.ok) {
    const body = await readResponseBody(response);
    const fallbackMessage = `Request failed with status ${response.status}`;

    throw new ApiError(
      getErrorMessage(body, fallbackMessage),
      response.status,
      body,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError("Server returned an invalid response", response.status);
  }
}
