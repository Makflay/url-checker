import { Test, type TestingModule } from '@nestjs/testing';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';

import type { CreateJobDto } from './dto/create-job.dto';
import { JobStatus } from './enums/job-status.enum';
import type { CreateJobResponse } from './interfaces/create-job-response.interface';
import type { JobDetails } from './interfaces/job-details.interface';
import type { JobSummary } from './interfaces/job-summary.interface';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  let controller: JobsController;

  let createJobMock: MockedFunction<JobsService['create']>;
  let findAllJobsMock: MockedFunction<JobsService['findAll']>;
  let findJobByIdMock: MockedFunction<JobsService['findById']>;
  let cancelJobMock: MockedFunction<JobsService['cancel']>;

  const createResponse: CreateJobResponse = {
    jobId: 'job-1',
  };

  const summaries: JobSummary[] = [
    {
      id: 'job-1',
      createdAt: '2026-07-26T12:00:00.000Z',
      status: JobStatus.PENDING,
      statistics: {
        total: 1,
        pending: 1,
        inProgress: 0,
        success: 0,
        error: 0,
        cancelled: 0,
        processed: 0,
      },
    },
  ];

  const details: JobDetails = {
    id: 'job-1',
    createdAt: '2026-07-26T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    status: JobStatus.PENDING,
    statistics: {
      total: 1,
      pending: 1,
      inProgress: 0,
      success: 0,
      error: 0,
      cancelled: 0,
      processed: 0,
    },
    items: [],
    failureMessage: null,
  };

  beforeEach(async () => {
    createJobMock = vi.fn(
      (_dto: CreateJobDto): CreateJobResponse => createResponse,
    );

    findAllJobsMock = vi.fn((): JobSummary[] => summaries);

    findJobByIdMock = vi.fn((_id: string): JobDetails => details);

    cancelJobMock = vi.fn((_id: string): void => undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: {
            create: createJobMock,
            findAll: findAllJobsMock,
            findById: findJobByIdMock,
            cancel: cancelJobMock,
          },
        },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
  });

  it('passes the DTO to the service and returns its result', () => {
    const dto: CreateJobDto = {
      urls: ['https://example.com'],
    };

    expect(controller.create(dto)).toBe(createResponse);
    expect(createJobMock).toHaveBeenCalledWith(dto);
  });

  it('returns all job summaries from the service', () => {
    expect(controller.findAll()).toBe(summaries);
    expect(findAllJobsMock).toHaveBeenCalledTimes(1);
  });

  it('passes the ID to the service and returns job details', () => {
    expect(controller.findById('job-1')).toBe(details);
    expect(findJobByIdMock).toHaveBeenCalledWith('job-1');
  });

  it('passes the ID to cancel and returns undefined', () => {
    const result = controller.cancel('job-1');

    expect(cancelJobMock).toHaveBeenCalledTimes(1);
    expect(cancelJobMock).toHaveBeenCalledWith('job-1');
    expect(result).toBeUndefined();
  });
});
