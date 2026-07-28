function getApiBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const normalizedValue = value.trim().replace(/\/+$/, "");

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch (_error) {
    throw new Error(
      "VITE_API_BASE_URL must be a valid absolute HTTP or HTTPS URL",
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("VITE_API_BASE_URL must use the HTTP or HTTPS protocol");
  }

  return normalizedValue;
}

export const API_BASE_URL = getApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
