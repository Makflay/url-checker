import type { UrlCheckStatus } from '../enums/url-check-status.enum';

export interface JobItem {
  id: string;
  url: string;
  status: UrlCheckStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}
