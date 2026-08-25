/**
 * Retries a write whose only likely failure is a unique-constraint clash.
 *
 * Sequential numbers (invoices, reports, samples) are read-then-incremented, so
 * two people creating at the same instant can pick the same one. The database's
 * unique constraint is what actually prevents a duplicate; this turns that
 * collision into a second attempt rather than an error the user sees.
 */
export async function retryOnDuplicate<T>(
  attempt: () => Promise<T>,
  tries = 3
): Promise<T> {
  let last: unknown;

  for (let i = 0; i < tries; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      last = error;
    }
  }

  throw last;
}
