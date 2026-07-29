import { useAppDispatch, useAppSelector } from "../../../app/store";
import { Section } from "../../../shared/ui";
import { JobDetailsSummary } from "./JobDetailsSummary";
import { JobUrlResultItem } from "./JobUrlResultItem";
import { useActiveJobPolling } from "../hooks";
import { JobCancelAction } from "./JobCancelAction";
import { isJobCancellable } from "../lib";
import { cancelJobThunk } from "../model";

export function JobDetails() {
  const dispatch = useAppDispatch();
  const { retry } = useActiveJobPolling();

  const activeJobId = useAppSelector((state) => state.jobs.activeJobId);

  const activeJobDetails = useAppSelector(
    (state) => state.jobs.activeJobDetails,
  );

  const detailsStatus = useAppSelector((state) => state.jobs.status.details);

  const detailsError = useAppSelector((state) => state.jobs.errors.details);

  const cancelStatus = useAppSelector((state) => state.jobs.status.cancel);

  const cancelError = useAppSelector((state) => state.jobs.errors.cancel);

  const cancellingJobId = useAppSelector((state) => state.jobs.cancellingJobId);

  const cancelErrorJobId = useAppSelector(
    (state) => state.jobs.cancelErrorJobId,
  );

  const isAnyCancelLoading = cancelStatus === "loading";

  const isCancellingActiveJob =
    isAnyCancelLoading && cancellingJobId === activeJobId;

  const visibleCancelError =
    cancelErrorJobId === activeJobId ? cancelError : null;

  const details =
    activeJobDetails?.id === activeJobId ? activeJobDetails : null;

  const isInitialLoading =
    activeJobId !== null &&
    details === null &&
    (detailsStatus === "idle" || detailsStatus === "loading");

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

  function handleCancel(): void {
    if (
      activeJobId === null ||
      details === null ||
      !isJobCancellable(details.status) ||
      isAnyCancelLoading
    ) {
      return;
    }

    void dispatch(cancelJobThunk(activeJobId));
  }

  return (
    <Section
      className="job-details-panel"
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

                {isJobCancellable(details.status) ? (
                  <JobCancelAction
                    isCancelling={isCancellingActiveJob}
                    isDisabled={isAnyCancelLoading}
                    error={visibleCancelError}
                    onCancel={handleCancel}
                  />
                ) : null}

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
