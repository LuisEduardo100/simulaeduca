"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Database,
  Server,
  Brain,
  Layers,
  RefreshCw,
  Activity,
} from "lucide-react";

interface HealthData {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: { status: string; latencyMs: number };
    redis: { status: string; latencyMs?: number };
    openai: { status: string; configured: boolean };
    vectorStore: { status: string; totalVectors: number };
  };
  storage: {
    materialChunks: number;
    scrapedSources: number;
    questionBank: number;
    totalEmbeddings: number;
  };
}

const statusIcon: Record<string, string> = {
  healthy: "🟢",
  degraded: "🟡",
  unhealthy: "🔴",
  up: "🟢",
  down: "🔴",
  not_configured: "⚪",
};

const statusLabel: Record<string, string> = {
  healthy: "Saudavel",
  degraded: "Degradado",
  unhealthy: "Critico",
  up: "Online",
  down: "Offline",
  not_configured: "Nao configurado",
};

export default function AdminSaudePage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok && res.status !== 503) throw new Error("Erro ao verificar saude");
      setHealth(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading && !health) return <HealthSkeleton />;
  if (error && !health)
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={fetchHealth}>Tentar novamente</Button>
      </div>
    );
  if (!health) return null;

  return (
    <main className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Saude do Sistema</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento em tempo real (atualiza a cada 30s)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={
              health.status === "healthy"
                ? "default"
                : health.status === "degraded"
                  ? "outline"
                  : "destructive"
            }
            className="text-sm py-1 px-3"
          >
            {statusIcon[health.status]} {statusLabel[health.status]}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealth}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Services */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ServiceCard
          icon={Database}
          name="PostgreSQL"
          status={health.services.database.status}
          details={[
            `Latencia: ${health.services.database.latencyMs}ms`,
          ]}
        />
        <ServiceCard
          icon={Server}
          name="Redis"
          status={health.services.redis.status}
          details={
            health.services.redis.latencyMs != null
              ? [`Latencia: ${health.services.redis.latencyMs}ms`]
              : []
          }
        />
        <ServiceCard
          icon={Brain}
          name="OpenAI API"
          status={health.services.openai.status}
          details={[
            health.services.openai.configured
              ? "API Key configurada"
              : "API Key ausente",
          ]}
        />
        <ServiceCard
          icon={Layers}
          name="Vector Store (pgvector)"
          status={health.services.vectorStore.status}
          details={[
            `${health.services.vectorStore.totalVectors.toLocaleString("pt-BR")} vetores indexados`,
          ]}
        />
      </div>

      <Separator />

      {/* Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Armazenamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StorageStat
              label="Chunks de Material"
              value={health.storage.materialChunks}
            />
            <StorageStat
              label="Fontes Scraped"
              value={health.storage.scrapedSources}
            />
            <StorageStat
              label="Banco de Questoes"
              value={health.storage.questionBank}
            />
            <StorageStat
              label="Embeddings Ativos"
              value={health.storage.totalEmbeddings}
            />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Ultima verificacao:{" "}
        {new Date(health.timestamp).toLocaleString("pt-BR")}
      </p>
    </main>
  );
}

function ServiceCard({
  icon: Icon,
  name,
  status,
  details,
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  status: string;
  details: string[];
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{name}</p>
            <span className="text-sm">
              {statusIcon[status] ?? "⚪"}{" "}
              <span className="text-xs text-muted-foreground">
                {statusLabel[status] ?? status}
              </span>
            </span>
          </div>
          {details.map((d, i) => (
            <p key={i} className="text-xs text-muted-foreground mt-0.5">
              {d}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StorageStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-32" />
    </div>
  );
}
