export class AxProError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'AxProError';
    this.code = code;
    this.status = status;
  }
}

