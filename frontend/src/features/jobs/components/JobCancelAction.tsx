interface JobCancelActionProps {
  isCancelling: boolean;
  isDisabled: boolean;
  error: string | null;
  onCancel: () => void;
}

export function JobCancelAction({
  isCancelling,
  isDisabled,
  error,
  onCancel,
}: JobCancelActionProps) {
  return (
    <div className="job-cancel-action">
      <button
        type="button"
        className="job-cancel-action__button"
        onClick={onCancel}
        disabled={isDisabled}
        aria-busy={isCancelling}
        aria-describedby={error ? "job-cancel-error" : undefined}
      >
        {isCancelling ? "Cancelling…" : "Cancel job"}
      </button>

      {error ? (
        <p
          id="job-cancel-error"
          className="job-cancel-action__error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
