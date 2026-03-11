import { Queue } from "bullmq";
import { redis } from "@/lib/cache/redis";
import type { Difficulty } from "@/types";

export const GENERATION_QUEUE_NAME = "question-generation";
export const GENERATION_PROGRESS_PREFIX = "gen:progress:";

export interface DescriptorRequest {
  descriptorId: number;
  questionCount: number;
  difficulty?: Difficulty;
}

export interface GenerationJobData {
  examId: string;
  userId: string;
  descriptors: DescriptorRequest[];
  globalDifficulty?: Difficulty | "misto";
  reuseRatio: number;
  resume: boolean;
  // Pre-fetched data to avoid DB lookups in worker
  examData: {
    evaluationSlug: string;
    evaluationName: string;
    subjectSlug: string;
    subjectName: string;
    gradeLevelSlug: string;
    gradeLevelName: string;
  };
  existingNumbers: number[];
  totalExpected: number;
}

export interface GenerationProgressEvent {
  type:
    | "init"
    | "question"
    | "questionError"
    | "complete"
    | "partial"
    | "error";
  data: Record<string, unknown>;
}

// Singleton queue instance
const globalForQueue = globalThis as unknown as {
  __generationQueue?: Queue;
};

export function getGenerationQueue(): Queue {
  if (!globalForQueue.__generationQueue) {
    globalForQueue.__generationQueue = new Queue(
      GENERATION_QUEUE_NAME,
      {
        // Cast to avoid ioredis version mismatch between top-level and BullMQ's bundled version
        connection: redis as never,
        defaultJobOptions: {
          attempts: 1, // No auto-retry — generation is complex, better to mark partial
          removeOnComplete: { age: 3600, count: 100 }, // Keep last 100 or 1h
          removeOnFail: { age: 86400, count: 200 }, // Keep failed 24h
        },
      }
    );
  }
  return globalForQueue.__generationQueue!;
}

/**
 * Publish a progress event to Redis pub/sub for SSE consumers.
 */
export async function publishProgress(
  jobId: string,
  event: GenerationProgressEvent
): Promise<void> {
  const channel = `${GENERATION_PROGRESS_PREFIX}${jobId}`;
  await redis.publish(channel, JSON.stringify(event));
}
