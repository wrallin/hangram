/** An error whose message is safe and meaningful to show to the user as-is. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string = 'error'
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error
