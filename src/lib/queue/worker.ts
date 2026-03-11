import { Worker } from "bullmq";
import { redis } from "@/lib/cache/redis";
import { processGenerationJob } from "./generation-processor";
import {
  GENERATION_QUEUE_NAME,
  type GenerationJobData,
} from "./generation-queue";

const globalForWorker = globalThis as unknown as {
  __generationWorker?: Worker;
};

/**
 * Start the BullMQ worker for question generation.
 * Safe to call multiple times — returns existing worker if already running.
 */
export function startGenerationWorker(): Worker {
  if (globalForWorker.__generationWorker) {
    return globalForWorker.__generationWorker;
  }

  const worker = new Worker(
    GENERATION_QUEUE_NAME,
    async (job) => {
      const data = job.data as GenerationJobData;
      console.log(
        `[worker] Processing job ${job.id} — exam ${data.examId} (${data.totalExpected} questions)`
      );
      await processGenerationJob(job.id!, data);
    },
    {
      // Cast to avoid ioredis version mismatch between top-level and BullMQ's bundled version
      connection: redis as never,
      concurrency: 3, // Max 3 exams processed simultaneously per worker
      limiter: {
        max: 5, // Max 5 jobs per duration window
        duration: 60000, // Per minute — prevents burst overload
      },
      lockDuration: 600000, // 10 minutes lock (exams can take 5+ min)
      stalledInterval: 120000, // Check for stalled jobs every 2 min
    }
  );

  worker.on("completed", (job) => {
    const data = job.data as GenerationJobData;
    console.log(`[worker] Job ${job.id} completed — exam ${data.examId}`);
  });

  worker.on("failed", (job, err) => {
    const data = job?.data as GenerationJobData | undefined;
    console.error(
      `[worker] Job ${job?.id} failed — exam ${data?.examId}:`,
      err.message
    );
  });

  worker.on("error", (err) => {
    console.error("[worker] Worker error:", err.message);
  });

  globalForWorker.__generationWorker = worker;
  console.log("[worker] Generation worker started");
  return worker;
}

/**
 * Gracefully shut down the worker.
 */
export async function stopGenerationWorker(): Promise<void> {
  if (globalForWorker.__generationWorker) {
    await globalForWorker.__generationWorker.close();
    globalForWorker.__generationWorker = undefined;
    console.log("[worker] Generation worker stopped");
  }
}
