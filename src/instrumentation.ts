/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to initialize Redis connection and BullMQ worker.
 */
export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureRedisConnected } = await import("@/lib/cache/redis");
      const connected = await ensureRedisConnected();

      if (connected) {
        const { startGenerationWorker } = await import("@/lib/queue/worker");
        startGenerationWorker();
        console.log("[instrumentation] Redis connected, worker started");
      } else {
        console.warn(
          "[instrumentation] Redis not available — queue disabled, using direct generation"
        );
      }
    } catch (err) {
      console.warn(
        "[instrumentation] Failed to initialize queue:",
        err instanceof Error ? err.message : err
      );
    }
  }
}
