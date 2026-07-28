import { Injectable, Inject } from '@nestjs/common';

import { jobsConfig } from '../../config';
import type { JobsConfig } from '../../config';

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
    @Inject(jobsConfig.KEY)
    private readonly config: JobsConfig,
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
      this.finalizeCancelledJob(jobId);
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

    const workerCount = Math.min(this.config.maxConcurrency, itemIds.length);

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

  private finalizeCancelledJob(jobId: string): void {
    const currentJob = this.jobsRepository.findById(jobId);

    if (
      !currentJob ||
      currentJob.status !== JobStatus.CANCELLED ||
      currentJob.finishedAt !== null
    ) {
      return;
    }

    const allItemsFinished = currentJob.items.every(
      (item) =>
        item.status === UrlCheckStatus.SUCCESS ||
        item.status === UrlCheckStatus.ERROR ||
        item.status === UrlCheckStatus.CANCELLED,
    );

    if (!allItemsFinished) {
      return;
    }

    const finalizedJob: Job = {
      ...currentJob,
      finishedAt: new Date().toISOString(),
    };

    this.jobsRepository.update(jobId, finalizedJob);
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

      const failedAtMs = Date.now();
      const failedAt = new Date(failedAtMs).toISOString();
      const failureMessage = 'Job processing failed';

      const items = currentJob.items.map((item): JobItem => {
        if (item.status === UrlCheckStatus.PENDING) {
          return {
            ...item,
            status: UrlCheckStatus.ERROR,
            httpStatus: null,
            errorMessage: failureMessage,
            startedAt: null,
            finishedAt: failedAt,
            durationMs: 0,
          };
        }

        if (item.status === UrlCheckStatus.IN_PROGRESS) {
          const startedAtMs =
            item.startedAt === null ? failedAtMs : Date.parse(item.startedAt);

          return {
            ...item,
            status: UrlCheckStatus.ERROR,
            httpStatus: null,
            errorMessage: failureMessage,
            finishedAt: failedAt,
            durationMs: Math.max(0, failedAtMs - startedAtMs),
          };
        }

        return item;
      });

      const failedJob: Job = {
        ...currentJob,
        status: JobStatus.FAILED,
        finishedAt: failedAt,
        failureMessage,
        items,
      };

      this.jobsRepository.update(jobId, failedJob);
    } catch (_error: unknown) {
      return;
    }
  }

  private getRandomDelayMs(): number {
    const { minMs, maxMs } = this.config.artificialDelay;
    const range = maxMs - minMs + 1;

    return Math.floor(Math.random() * range) + minMs;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
