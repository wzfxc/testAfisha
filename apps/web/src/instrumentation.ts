export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    try {
      const { getInternalSecret } = await import('@/lib/secret');
      getInternalSecret();
    } catch (err: unknown) {
      console.error(
        '[fatal] Web startup aborted:',
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    }
  }
}
