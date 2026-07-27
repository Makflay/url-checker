import { useEffect } from "react";
import { Section } from "../../../shared/ui";
import { useAppDispatch, useAppSelector } from "../../../app/store";
import { fetchJobsThunk, setActiveJobId } from "../model";
import { JobListItem } from "./JobListItem";

export function JobsList() {
  const dispatch = useAppDispatch();

  const jobs = useAppSelector((state) => state.jobs.jobs);

  const activeJobId = useAppSelector((state) => state.jobs.activeJobId);

  const listStatus = useAppSelector((state) => state.jobs.status.list);

  const listError = useAppSelector((state) => state.jobs.errors.list);

  useEffect(() => {
    void dispatch(fetchJobsThunk());
  }, [dispatch]);

  const isInitialLoading = listStatus === "loading" && jobs.length === 0;

  const isRefreshing = listStatus === "loading" && jobs.length > 0;

  const isEmpty =
    listStatus !== "loading" && jobs.length === 0 && listError === null;

  function handleSelectJob(jobId: string): void {
    dispatch(setActiveJobId(jobId));
  }

  function handleRetry(): void {
    void dispatch(fetchJobsThunk());
  }

  return (
    <Section title="Jobs" description="Select a job to view its details.">
      <div className="jobs-list">
        {isRefreshing ? (
          <p className="jobs-list__refreshing" aria-live="polite">
            Updating…
          </p>
        ) : null}

        {listError ? (
          <div className="jobs-list__error-container">
            <p className="jobs-list__error" role="alert">
              {listError}
            </p>

            <button
              className="jobs-list__retry"
              type="button"
              onClick={handleRetry}
              disabled={listStatus === "loading"}
            >
              Try again
            </button>
          </div>
        ) : null}

        {isInitialLoading ? (
          <p className="jobs-list__state" aria-live="polite">
            Loading jobs…
          </p>
        ) : null}

        {isEmpty ? (
          <p className="jobs-list__state">
            No jobs yet. Create your first URL checking job.
          </p>
        ) : null}

        {jobs.length > 0 ? (
          <ul className="jobs-list__items">
            {jobs.map((job) => (
              <JobListItem
                key={job.id}
                job={job}
                isActive={job.id === activeJobId}
                onSelect={handleSelectJob}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </Section>
  );
}
