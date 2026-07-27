import { formatDateTime, formatDuration, formatUrlCheckStatus } from "../lib";
import type { JobUrlResult } from "../model";

interface JobUrlResultItemProps {
  item: JobUrlResult;
}

export function JobUrlResultItem({ item }: JobUrlResultItemProps) {
  const statusClassName = `url-status url-status--${item.status}`;

  const shouldShowError = item.status === "error" || item.errorMessage !== null;

  return (
    <li className="job-url-result">
      <div className="job-url-result__header">
        <a
          className="job-url-result__url"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.url}
        </a>

        <span className={`${statusClassName} job-url-result__status`}>
          {formatUrlCheckStatus(item.status)}
        </span>
      </div>

      <dl className="job-url-result__metadata">
        <div className="job-url-result__metadata-item">
          <dt>HTTP status</dt>
          <dd>{item.httpStatus ?? "—"}</dd>
        </div>

        <div className="job-url-result__metadata-item">
          <dt>Duration</dt>
          <dd>{formatDuration(item.durationMs)}</dd>
        </div>

        <div className="job-url-result__metadata-item">
          <dt>Started</dt>
          <dd>
            {item.startedAt !== null ? (
              <time dateTime={item.startedAt}>
                {formatDateTime(item.startedAt)}
              </time>
            ) : (
              "—"
            )}
          </dd>
        </div>

        <div className="job-url-result__metadata-item">
          <dt>Finished</dt>
          <dd>
            {item.finishedAt !== null ? (
              <time dateTime={item.finishedAt}>
                {formatDateTime(item.finishedAt)}
              </time>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {shouldShowError ? (
        <p className="job-url-result__error">
          <strong>Error:</strong>{" "}
          {item.errorMessage ?? "No error details provided."}
        </p>
      ) : null}
    </li>
  );
}
