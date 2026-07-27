import type { JobSummary } from "../model";
import { formatJobCreatedAt, formatJobId, formatJobStatus } from "../lib";

interface JobListItemProps {
  job: JobSummary;
  isActive: boolean;
  onSelect: (jobId: string) => void;
}

export function JobListItem({ job, isActive, onSelect }: JobListItemProps) {
  const className = isActive
    ? "job-list-item job-list-item--active"
    : "job-list-item";

  const statusClassName = `job-status job-status--${job.status}`;

  return (
    <li className="jobs-list__item">
      <button
        type="button"
        className={className}
        onClick={() => onSelect(job.id)}
        aria-pressed={isActive}
      >
        <div className="job-list-item__header">
          <div className="job-list-item__identity">
            <code className="job-list-item__id" title={job.id}>
              {formatJobId(job.id)}
            </code>

            <time className="job-list-item__date" dateTime={job.createdAt}>
              {formatJobCreatedAt(job.createdAt)}
            </time>
          </div>

          <div className="job-list-item__badges">
            <span className={`${statusClassName} job-list-item__status`}>
              {formatJobStatus(job.status)}
            </span>

            {isActive ? (
              <span className="job-list-item__selected">Selected</span>
            ) : null}
          </div>
        </div>

        <dl className="job-list-item__statistics">
          <div className="job-list-item__stat">
            <dt>Total</dt>
            <dd>{job.statistics.total}</dd>
          </div>

          <div className="job-list-item__stat">
            <dt>Success</dt>
            <dd>{job.statistics.success}</dd>
          </div>

          <div className="job-list-item__stat">
            <dt>Errors</dt>
            <dd>{job.statistics.error}</dd>
          </div>
        </dl>
      </button>
    </li>
  );
}
