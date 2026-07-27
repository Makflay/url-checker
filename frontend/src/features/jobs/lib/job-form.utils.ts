import { MAX_URLS_PER_JOB } from "./job-form.constants";

export function normalizeJobUrls(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isSupportedUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getJobUrlsValidationError(urls: string[]): string | null {
  if (urls.length === 0) {
    return "Enter at least one URL.";
  }

  if (urls.length > MAX_URLS_PER_JOB) {
    return `You can submit up to ${MAX_URLS_PER_JOB} URLs at a time.`;
  }

  const invalidUrls = urls.filter((url) => !isSupportedUrl(url));

  if (invalidUrls.length === 1) {
    return `Enter valid HTTP or HTTPS URLs. Invalid value: ${invalidUrls[0]}`;
  }

  if (invalidUrls.length > 1) {
    return `Enter valid HTTP or HTTPS URLs. First invalid value: ${invalidUrls[0]}`;
  }

  return null;
}
