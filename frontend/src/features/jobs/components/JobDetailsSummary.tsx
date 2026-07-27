import { formatDateTime, formatJobStatus } from "../lib";
import type { JobDetails } from "../model";

interface JobDetailsSummaryProps {
  details: JobDetails;
}

export function JobDetailsSummary({ details }: JobDetailsSummaryProps) {
  const { total, pending, inProgress, success, error, cancelled, processed } =
    details.statistics;

  const progressMax = Math.max(total, 1);
  const statusClassName = `job-status job-status--${details.status}`;

  return (
    <div className="job-details__summary">
      <div className="job-details__header">
        <div>
          <h3 className="job-details__heading">Summary</h3>

          <code className="job-details__id" title={details.id}>
            {details.id}
          </code>
        </div>

        <span className={statusClassName}>
          {formatJobStatus(details.status)}
        </span>
      </div>

      <div className="job-details__progress">
        <div className="job-details__progress-text">
          <span>Progress</span>
          <strong>
            {processed} of {total}
          </strong>
        </div>

        <progress
          className="job-details__progress-bar"
          value={processed}
          max={progressMax}
          aria-label={`Job progress: ${processed} of ${total}`}
        >
          {processed} of {total}
        </progress>
      </div>

      <dl className="job-details__statistics">
        <div className="job-details__statistic">
          <dt>Total</dt>
          <dd>{total}</dd>
        </div>

        <div className="job-details__statistic">
          <dt>Success</dt>
          <dd>{success}</dd>
        </div>

        <div className="job-details__statistic">
          <dt>Errors</dt>
          <dd>{error}</dd>
        </div>

        <div className="job-details__statistic">
          <dt>Pending</dt>
          <dd>{pending}</dd>
        </div>

        <div className="job-details__statistic">
          <dt>In progress</dt>
          <dd>{inProgress}</dd>
        </div>

        <div className="job-details__statistic">
          <dt>Cancelled</dt>
          <dd>{cancelled}</dd>
        </div>
      </dl>

      <dl className="job-details__dates">
        <div className="job-details__date">
          <dt>Created</dt>
          <dd>
            <time dateTime={details.createdAt}>
              {formatDateTime(details.createdAt)}
            </time>
          </dd>
        </div>

        <div className="job-details__date">
          <dt>Started</dt>
          <dd>
            {details.startedAt !== null ? (
              <time dateTime={details.startedAt}>
                {formatDateTime(details.startedAt)}
              </time>
            ) : (
              "Not started"
            )}
          </dd>
        </div>

        <div className="job-details__date">
          <dt>Finished</dt>
          <dd>
            {details.finishedAt !== null ? (
              <time dateTime={details.finishedAt}>
                {formatDateTime(details.finishedAt)}
              </time>
            ) : (
              "Not finished"
            )}
          </dd>
        </div>
      </dl>

      {details.failureMessage !== null ? (
        <div className="job-details__failure" role="alert">
          <strong>Job failure</strong>
          <p>{details.failureMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
