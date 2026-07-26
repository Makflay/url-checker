const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!rawApiBaseUrl?.trim()) {
  throw new Error("VITE_API_BASE_URL is not configured");
}

const normalizedApiBaseUrl = rawApiBaseUrl.trim().replace(/\/+$/, "");

if (!normalizedApiBaseUrl) {
  throw new Error("VITE_API_BASE_URL is not configured");
}

export const API_BASE_URL = normalizedApiBaseUrl;
