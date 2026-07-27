import { useCallback, useEffect, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../../app/store";
import { ACTIVE_JOB_POLLING_INTERVAL_MS } from "../lib/job-polling.constants";
import { isPollingJobStatus } from "../lib/job-polling.utils";
import type { JobDetails } from "../model/job.types";
import { fetchJobDetailsThunk } from "../model/jobs.thunks";

interface AbortableDetailsRequest {
  abort: () => void;
  unwrap: () => Promise<JobDetails>;
}

export interface ActiveJobPollingControls {
  retry: () => void;
}

export function useActiveJobPolling(): ActiveJobPollingControls {
  const dispatch = useAppDispatch();

  const activeJobId = useAppSelector((state) => state.jobs.activeJobId);

  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback((): void => {
    setRetryToken((currentToken) => currentToken + 1);
  }, []);

  useEffect(() => {
    if (activeJobId === null) {
      return;
    }

    const jobId = activeJobId;

    let isActive = true;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    let currentRequest: AbortableDetailsRequest | null = null;

    function clearTimer(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    async function runPollingRequest(): Promise<void> {
      if (!isActive || currentRequest !== null) {
        return;
      }

      const request = dispatch(fetchJobDetailsThunk(jobId));

      currentRequest = request;

      try {
        const details = await request.unwrap();

        if (currentRequest === request) {
          currentRequest = null;
        }

        if (!isActive || !isPollingJobStatus(details.status)) {
          return;
        }

        timeoutId = setTimeout(() => {
          timeoutId = null;
          void runPollingRequest();
        }, ACTIVE_JOB_POLLING_INTERVAL_MS);
      } catch {
        if (currentRequest === request) {
          currentRequest = null;
        }
      }
    }

    void runPollingRequest();

    return () => {
      isActive = false;
      clearTimer();

      currentRequest?.abort();
      currentRequest = null;
    };
  }, [activeJobId, dispatch, retryToken]);

  return {
    retry,
  };
}
