import type { JobStatus } from '../enums/job-status.enum';
import type { JobItem } from './job-item.interface';
import type { JobStatistics } from './job-statistics.interface';

export interface JobDetails {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: JobStatus;
  statistics: JobStatistics;
  items: JobItem[];
  failureMessage: string | null;
}
