export async function withRetry<T>(
  action: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  onRetry: (attempt: number, error: unknown) => void
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      attempt += 1;
      onRetry(attempt, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
