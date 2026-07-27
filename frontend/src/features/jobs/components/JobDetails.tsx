//import { useEffect } from "react";
import { useAppSelector } from "../../../app/store";
import { Section } from "../../../shared/ui";
//import { fetchJobDetailsThunk } from "../model";
import { JobDetailsSummary } from "./JobDetailsSummary";
import { JobUrlResultItem } from "./JobUrlResultItem";
import { useActiveJobPolling } from "../hooks";

export function JobDetails() {
  const { retry } = useActiveJobPolling();

  const activeJobId = useAppSelector((state) => state.jobs.activeJobId);

  const activeJobDetails = useAppSelector(
    (state) => state.jobs.activeJobDetails,
  );

  const detailsStatus = useAppSelector((state) => state.jobs.status.details);

  const detailsError = useAppSelector((state) => state.jobs.errors.details);

  const details =
    activeJobDetails?.id === activeJobId ? activeJobDetails : null;

  const isInitialLoading =
    activeJobId !== null &&
    details === null &&
    (detailsStatus === "idle" || detailsStatus === "loading");

  const isRefreshing = detailsStatus === "loading" && details !== null;

  const requestError =
    detailsStatus === "failed"
      ? (detailsError ?? "Unable to load job details.")
      : null;

  function handleRetry(): void {
    if (activeJobId === null || detailsStatus === "loading") {
      return;
    }

    retry();
  }
  return (
    <Section
      title="Job details"
      description="View progress and individual URL results."
    >
      <div className="job-details">
        {activeJobId === null ? (
          <p className="job-details__state">
            Select a job to view its details.
          </p>
        ) : (
          <>
            {isRefreshing ? (
              <p className="job-details__refreshing" role="status">
                Updating…
              </p>
            ) : null}

            {requestError ? (
              <div className="job-details__error-container">
                <p className="job-details__error" role="alert">
                  {requestError}
                </p>

                <button
                  className="job-details__retry"
                  type="button"
                  onClick={handleRetry}
                  disabled={detailsStatus === "loading"}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {isInitialLoading ? (
              <p className="job-details__state" aria-live="polite">
                Loading job details…
              </p>
            ) : null}

            {detailsStatus === "succeeded" && details === null ? (
              <p className="job-details__state">
                Job details are not available.
              </p>
            ) : null}

            {details ? (
              <>
                <JobDetailsSummary details={details} />

                <div className="job-details__results">
                  <h3 className="job-details__results-heading">URL results</h3>

                  {details.items.length > 0 ? (
                    <ul className="job-url-results">
                      {details.items.map((item) => (
                        <JobUrlResultItem key={item.id} item={item} />
                      ))}
                    </ul>
                  ) : (
                    <p className="job-details__state">
                      No URL results are available.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </Section>
  );
}
