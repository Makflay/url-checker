import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { CreateJobDto } from './dto/create-job.dto';
import type { CreateJobResponse } from './interfaces/create-job-response.interface';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  let controller: JobsController;
  let createJobMock: Mock<JobsService['create']>;

  beforeEach(async () => {
    const response: CreateJobResponse = {
      jobId: 'test-job-id',
    };

    createJobMock = vi.fn((): CreateJobResponse => response);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: {
            create: createJobMock,
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
    expect(result).toEqual({
      jobId: 'test-job-id',
    });
  });
});
