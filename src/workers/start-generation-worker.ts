/**
 * Standalone worker process for production deployments.
 * Run with: npx tsx src/workers/start-generation-worker.ts
 *
 * This allows scaling workers independently from the web server.
 * In production, run multiple instances for higher throughput.
 */
import { ensureRedisConnected } from "@/lib/cache/redis";
import { startGenerationWorker, stopGenerationWorker } from "@/lib/queue/worker";

async function main() {
  console.log("[standalone-worker] Starting generation worker...");

  const connected = await ensureRedisConnected();
  if (!connected) {
    console.error("[standalone-worker] Redis connection failed. Exiting.");
    process.exit(1);
  }

  startGenerationWorker();
  console.log("[standalone-worker] Worker running. Press Ctrl+C to stop.");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[standalone-worker] Shutting down...");
    await stopGenerationWorker();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[standalone-worker] Fatal error:", err);
  process.exit(1);
});
