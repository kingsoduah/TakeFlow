export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return `Too many requests. Try again in ${err.retryAfter ?? 30} seconds.`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
