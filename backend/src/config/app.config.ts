import { registerAs } from '@nestjs/config';

import { DEFAULT_FRONTEND_ORIGIN, DEFAULT_PORT } from './environment.constants';
import type { AppConfig } from './environment.types';

export const appConfig = registerAs('app', (): AppConfig => ({
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? DEFAULT_FRONTEND_ORIGIN,
}));
