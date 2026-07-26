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
    createJobMock = vi.fn((): CreateJobResponse => createResponse);

    findAllJobsMock = vi.fn((): JobSummary[] => summaries);

    findJobByIdMock = vi.fn((): JobDetails => details);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: {
            create: createJobMock,
            findAll: findAllJobsMock,
            findById: findJobByIdMock,
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

    const result = controller.create(dto);

    expect(createJobMock).toHaveBeenCalledTimes(1);
    expect(createJobMock).toHaveBeenCalledWith(dto);
    expect(result).toBe(createResponse);
  });

  it('returns all job summaries from the service', () => {
    const result = controller.findAll();

    expect(findAllJobsMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(summaries);
  });

  it('passes the ID to the service and returns job details', () => {
    const id = 'job-1';

    const result = controller.findById(id);

    expect(findJobByIdMock).toHaveBeenCalledTimes(1);
    expect(findJobByIdMock).toHaveBeenCalledWith(id);
    expect(result).toBe(details);
  });
});
