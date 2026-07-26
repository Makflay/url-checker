import { Injectable } from '@nestjs/common';

import {
  MAX_CONCURRENT_URL_CHECKS,
  MAX_RESULT_DELAY_MS,
  MIN_RESULT_DELAY_MS,
} from '../constants/processor.constants';
import { JobStatus } from '../enums/job-status.enum';
import { UrlCheckStatus } from '../enums/url-check-status.enum';
import type { HttpCheckResult } from '../http/http-check-result.interface';
import { HttpClientService } from '../http/http-client.service';
import type { JobItem } from '../interfaces/job-item.interface';
import type { Job } from '../interfaces/job.interface';
import { JobsRepository } from '../repositories/jobs.repository';

@Injectable()
export class JobsProcessor {
  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly httpClientService: HttpClientService,
  ) {}

  async process(jobId: string): Promise<void> {
    try {
      const job = this.jobsRepository.findById(jobId);

      if (!job || job.status !== JobStatus.PENDING) {
        return;
      }

      const startedJob: Job = {
        ...job,
        status: JobStatus.IN_PROGRESS,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        failureMessage: null,
      };

      const savedJob = this.jobsRepository.update(jobId, startedJob);

      if (!savedJob) {
        return;
      }

      const itemIds = savedJob.items.map((item) => item.id);

      await this.processItems(jobId, itemIds);
      this.completeJob(jobId);
    } catch (_error: unknown) {
      this.markJobAsFailed(jobId);
    }
  }

  private async processItems(jobId: string, itemIds: string[]): Promise<void> {
    let nextItemIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const currentJob = this.jobsRepository.findById(jobId);

        if (!currentJob || currentJob.status !== JobStatus.IN_PROGRESS) {
          return;
        }

        const currentIndex = nextItemIndex;
        nextItemIndex += 1;

        if (currentIndex >= itemIds.length) {
          return;
        }

        const itemId = itemIds[currentIndex];

        if (itemId === undefined) {
          return;
        }

        await this.processItem(jobId, itemId);
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT_URL_CHECKS, itemIds.length);

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  private async processItem(jobId: string, itemId: string): Promise<void> {
    const currentJob = this.jobsRepository.findById(jobId);

    if (!currentJob) {
      return;
    }

    const currentItem = currentJob.items.find((item) => item.id === itemId);

    if (!currentItem || currentItem.status !== UrlCheckStatus.PENDING) {
      return;
    }

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    const startedItem: JobItem = {
      ...currentItem,
      status: UrlCheckStatus.IN_PROGRESS,
      httpStatus: null,
      errorMessage: null,
      startedAt,
      finishedAt: null,
      durationMs: null,
    };

    const jobWithStartedItem: Job = {
      ...currentJob,
      items: currentJob.items.map((item) =>
        item.id === itemId ? startedItem : item,
      ),
    };

    const updatedJob = this.jobsRepository.update(jobId, jobWithStartedItem);

    if (!updatedJob) {
      return;
    }

    const result = await this.httpClientService.check(currentItem.url);

    await this.delay(this.getRandomDelayMs());

    const finishedAtMs = Date.now();
    const finishedAt = new Date(finishedAtMs).toISOString();
    const durationMs = finishedAtMs - startedAtMs;

    this.saveItemResult(jobId, itemId, result, finishedAt, durationMs);
  }

  private saveItemResult(
    jobId: string,
    itemId: string,
    result: HttpCheckResult,
    finishedAt: string,
    durationMs: number,
  ): void {
    const currentJob = this.jobsRepository.findById(jobId);

    if (
      !currentJob ||
      (currentJob.status !== JobStatus.IN_PROGRESS &&
        currentJob.status !== JobStatus.CANCELLED)
    ) {
      return;
    }

    const currentItem = currentJob.items.find((item) => item.id === itemId);

    if (!currentItem || currentItem.status !== UrlCheckStatus.IN_PROGRESS) {
      return;
    }

    const completedItem: JobItem =
      result.httpStatus !== null
        ? {
            ...currentItem,
            status: UrlCheckStatus.SUCCESS,
            httpStatus: result.httpStatus,
            errorMessage: null,
            finishedAt,
            durationMs,
          }
        : {
            ...currentItem,
            status: UrlCheckStatus.ERROR,
            httpStatus: null,
            errorMessage: result.errorMessage ?? 'HTTP request failed',
            finishedAt,
            durationMs,
          };

    const updatedJob: Job = {
      ...currentJob,
      items: currentJob.items.map((item) =>
        item.id === itemId ? completedItem : item,
      ),
    };

    this.jobsRepository.update(jobId, updatedJob);
  }

  private completeJob(jobId: string): void {
    const currentJob = this.jobsRepository.findById(jobId);

    if (!currentJob || currentJob.status !== JobStatus.IN_PROGRESS) {
      return;
    }

    const allItemsFinished = currentJob.items.every(
      (item) =>
        item.status === UrlCheckStatus.SUCCESS ||
        item.status === UrlCheckStatus.ERROR ||
        item.status === UrlCheckStatus.CANCELLED,
    );

    if (!allItemsFinished) {
      throw new Error(`Job ${jobId} still contains unfinished items`);
    }

    const completedJob: Job = {
      ...currentJob,
      status: JobStatus.COMPLETED,
      finishedAt: new Date().toISOString(),
      failureMessage: null,
    };

    this.jobsRepository.update(jobId, completedJob);
  }

  private markJobAsFailed(jobId: string): void {
    try {
      const currentJob = this.jobsRepository.findById(jobId);

      if (
        !currentJob ||
        currentJob.status === JobStatus.COMPLETED ||
        currentJob.status === JobStatus.CANCELLED ||
        currentJob.status === JobStatus.FAILED
      ) {
        return;
      }

      const failedJob: Job = {
        ...currentJob,
        status: JobStatus.FAILED,
        finishedAt: new Date().toISOString(),
        failureMessage: 'Job processing failed',
      };

      this.jobsRepository.update(jobId, failedJob);
    } catch (_error: unknown) {
      return;
    }
  }

  private getRandomDelayMs(): number {
    const range = MAX_RESULT_DELAY_MS - MIN_RESULT_DELAY_MS + 1;

    return Math.floor(Math.random() * range) + MIN_RESULT_DELAY_MS;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
