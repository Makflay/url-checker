export interface HttpCheckSuccess {
  type: 'success';
  httpStatus: number;
}

export interface HttpCheckHttpError {
  type: 'http_error';
  httpStatus: number;
  errorMessage: string;
}

export interface HttpCheckTransportError {
  type: 'transport_error';
  errorMessage: string;
}

export type HttpCheckResult =
  HttpCheckSuccess | HttpCheckHttpError | HttpCheckTransportError;
