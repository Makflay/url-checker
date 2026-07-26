import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsString,
  IsUrl,
} from 'class-validator';

import { MAX_URLS_PER_JOB } from '../constants/jobs.constants';

export class CreateJobDto {
  @IsDefined({
    message: 'urls is required',
  })
  @IsArray({
    message: 'urls must be an array',
  })
  @ArrayNotEmpty({
    message: 'urls must contain at least one URL',
  })
  @ArrayMaxSize(MAX_URLS_PER_JOB, {
    message: `urls must contain no more than ${MAX_URLS_PER_JOB} URLs`,
  })
  @IsString({
    each: true,
    message: 'each value in urls must be a string',
  })
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
    },
    {
      each: true,
      message:
        'each value in urls must be a valid HTTP or HTTPS URL with an explicit protocol',
    },
  )
  urls!: string[];
}
