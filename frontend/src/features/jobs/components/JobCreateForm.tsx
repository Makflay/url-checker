import { useState, type ChangeEvent, type FormEvent } from "react";
import { Section } from "../../../shared/ui";
import { useAppDispatch, useAppSelector } from "../../../app/store";
import {
  getJobUrlsValidationError,
  MAX_URLS_PER_JOB,
  normalizeJobUrls,
} from "../lib";
import { clearCreateError, createJobThunk } from "../model";

export function JobCreateForm() {
  const dispatch = useAppDispatch();

  const createStatus = useAppSelector((state) => state.jobs.status.create);

  const createError = useAppSelector((state) => state.jobs.errors.create);

  const [value, setValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const isSubmitting = createStatus === "loading";
  const displayedError = validationError ?? createError;

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setValue(event.target.value);

    if (validationError !== null) {
      setValidationError(null);
    }

    if (createError !== null) {
      dispatch(clearCreateError());
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const urls = normalizeJobUrls(value);
    const error = getJobUrlsValidationError(urls);

    if (error !== null) {
      setValidationError(error);
      return;
    }

    setValidationError(null);

    try {
      await dispatch(
        createJobThunk({
          urls,
        }),
      ).unwrap();

      setValue("");
      setValidationError(null);
    } catch {
      // Redux state already contains the normalized error.
    }
  }

  return (
    <Section
      title="Create job"
      description="Enter one HTTP or HTTPS URL per line."
    >
      <form
        className="job-create-form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSubmitting}
      >
        <div className="job-create-form__field">
          <label className="job-create-form__label" htmlFor="job-urls">
            URLs
          </label>

          <textarea
            id="job-urls"
            name="urls"
            className="job-create-form__textarea"
            value={value}
            onChange={handleChange}
            placeholder={"https://example.com"}
            rows={7}
            disabled={isSubmitting}
            aria-describedby={
              displayedError ? "job-urls-help job-urls-error" : "job-urls-help"
            }
            aria-invalid={displayedError ? true : undefined}
          />

          <p id="job-urls-help" className="job-create-form__hint">
            Empty lines are ignored. Up to {MAX_URLS_PER_JOB} URLs.
          </p>
        </div>

        {displayedError ? (
          <p
            id="job-urls-error"
            className="job-create-form__error"
            role="alert"
          >
            {displayedError}
          </p>
        ) : null}

        <div className="job-create-form__actions">
          <button
            className="job-create-form__button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating…" : "Create job"}
          </button>
        </div>
      </form>
    </Section>
  );
}
