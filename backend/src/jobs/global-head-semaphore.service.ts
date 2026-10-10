import { Inject, Injectable } from '@nestjs/common';

import { jobsConfig } from '../config';
import type { JobsConfig } from '../config';

export type ReleaseGlobalHeadPermit = () => void;

type WaitingPermitResolver = (release: ReleaseGlobalHeadPermit) => void;

@Injectable()
export class GlobalHeadSemaphore {
  private activePermits = 0;

  private readonly waitingResolvers: WaitingPermitResolver[] = [];

  constructor(
    @Inject(jobsConfig.KEY)
    private readonly config: JobsConfig,
  ) {}

  acquire(): Promise<ReleaseGlobalHeadPermit> {
    if (this.activePermits < this.config.maxGlobalHeadConcurrency) {
      this.activePermits += 1;

      return Promise.resolve(this.createRelease());
    }

    return new Promise<ReleaseGlobalHeadPermit>((resolve) => {
      this.waitingResolvers.push(resolve);
    });
  }

  private createRelease(): ReleaseGlobalHeadPermit {
    let released = false;

    return (): void => {
      if (released) {
        return;
      }

      released = true;

      const nextResolver = this.waitingResolvers.shift();

      if (nextResolver !== undefined) {
        nextResolver(this.createRelease());

        return;
      }

      this.activePermits -= 1;
    };
  }
}
