import type { JobStatus } from '../enums/job-status.enum';
import type { JobStatistics } from './job-statistics.interface';

export interface JobSummary {
  id: string;
  createdAt: string;
  status: JobStatus;
  statistics: JobStatistics;
}
