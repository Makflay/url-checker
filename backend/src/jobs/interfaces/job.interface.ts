import type { JobStatus } from '../enums/job-status.enum';
import type { JobItem } from './job-item.interface';

export interface Job {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: JobStatus;
  items: JobItem[];
  failureMessage: string | null;
}
