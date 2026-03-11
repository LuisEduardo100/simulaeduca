import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import net from "net";
import { isRedisReady, redis } from "@/lib/cache/redis";

type ServiceStatus = "up" | "down";

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: { status: ServiceStatus; latencyMs: number };
    redis: { status: ServiceStatus | "not_configured"; latencyMs?: number; mode?: string };
    openai: { status: ServiceStatus; configured: boolean };
    vectorStore: { status: ServiceStatus; totalVectors: number };
    queue: { status: ServiceStatus | "not_configured"; stats?: QueueStats };
  };
  storage: {
    materialChunks: number;
    scrapedSources: number;
    questionBank: number;
    totalEmbeddings: number;
  };
}

function checkRedis(url: string): Promise<{ status: ServiceStatus; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = performance.now();
    try {
      const parsed = new URL(url);
      const port = parseInt(parsed.port || "6379", 10);
      const host = parsed.hostname || "127.0.0.1";

      const socket = net.createConnection({ host, port, timeout: 3000 }, () => {
        const latencyMs = Math.round(performance.now() - start);
        socket.destroy();
        resolve({ status: "up", latencyMs });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({ status: "down", latencyMs: Math.round(performance.now() - start) });
      });

      socket.on("error", () => {
        socket.destroy();
        resolve({ status: "down", latencyMs: Math.round(performance.now() - start) });
      });
    } catch {
      resolve({ status: "down", latencyMs: Math.round(performance.now() - start) });
    }
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // --- Database health ---
  let dbStatus: ServiceStatus = "down";
  let dbLatencyMs = 0;
  try {
    const dbStart = performance.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    dbLatencyMs = Math.round(performance.now() - dbStart);
    dbStatus = "up";
  } catch {
    dbLatencyMs = Math.round(performance.now());
    dbStatus = "down";
  }

  // --- Redis health (use actual ioredis client) ---
  let redisResult: HealthResponse["services"]["redis"];
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    if (isRedisReady()) {
      try {
        const redisStart = performance.now();
        await redis.ping();
        const redisLatency = Math.round(performance.now() - redisStart);
        redisResult = { status: "up", latencyMs: redisLatency, mode: "ioredis" };
      } catch {
        redisResult = { status: "down", mode: "ioredis" };
      }
    } else {
      // Fallback to TCP check
      const check = await checkRedis(redisUrl);
      redisResult = { status: check.status, latencyMs: check.latencyMs, mode: "tcp-fallback" };
    }
  } else {
    redisResult = { status: "not_configured" };
  }

  // --- BullMQ Queue health ---
  let queueResult: HealthResponse["services"]["queue"];
  if (isRedisReady()) {
    try {
      const { getGenerationQueue } = await import("@/lib/queue/generation-queue");
      const queue = getGenerationQueue();
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);
      queueResult = {
        status: "up",
        stats: { waiting, active, completed, failed },
      };
    } catch {
      queueResult = { status: "down" };
    }
  } else {
    queueResult = { status: "not_configured" };
  }

  // --- OpenAI health ---
  const openaiConfigured = !!process.env.OPENAI_API_KEY;
  const openaiStatus: ServiceStatus = openaiConfigured ? "up" : "down";

  // --- Vector store health ---
  let vectorStoreStatus: ServiceStatus = "down";
  let totalVectors = 0;
  try {
    const result = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int as count FROM material_chunks WHERE embedding IS NOT NULL`
    );
    totalVectors = result[0]?.count ?? 0;
    vectorStoreStatus = "up";
  } catch {
    vectorStoreStatus = "down";
  }

  // --- Storage counts ---
  let materialChunks = 0;
  let scrapedSources = 0;
  let questionBank = 0;
  try {
    [materialChunks, scrapedSources, questionBank] = await Promise.all([
      prisma.materialChunk.count(),
      prisma.scrapedSource.count(),
      prisma.questionBank.count(),
    ]);
  } catch {
    // counts remain 0 on failure
  }

  // --- Determine overall status ---
  const dbUp = dbStatus === "up";
  const optionalDown =
    (redisUrl && redisResult.status === "down") ||
    !openaiConfigured ||
    vectorStoreStatus === "down";

  let overallStatus: HealthResponse["status"];
  if (!dbUp) {
    overallStatus = "unhealthy";
  } else if (optionalDown) {
    overallStatus = "degraded";
  } else {
    overallStatus = "healthy";
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus, latencyMs: dbLatencyMs },
      redis: redisResult,
      openai: { status: openaiStatus, configured: openaiConfigured },
      vectorStore: { status: vectorStoreStatus, totalVectors },
      queue: queueResult,
    },
    storage: {
      materialChunks,
      scrapedSources,
      questionBank,
      totalEmbeddings: totalVectors,
    },
  };

  const httpStatus = overallStatus === "unhealthy" ? 503 : 200;
  return NextResponse.json(response, { status: httpStatus });
}
