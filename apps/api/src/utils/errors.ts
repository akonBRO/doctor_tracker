export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const unauthorized = () =>
  new AppError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
export const invalidChallenge = () =>
  new AppError(
    401,
    'CHALLENGE_EXPIRED',
    'Your verification session expired. Please sign in again.',
  );
