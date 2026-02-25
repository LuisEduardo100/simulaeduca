"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

interface CreditsData {
  balance: number;
  planType: string;
  transactions: Transaction[];
}

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuito",
  basic: "Básico",
  pro: "Pro",
  school: "Escola",
  secretaria: "Secretaria",
};

const TYPE_LABELS: Record<string, string> = {
  purchase: "Compra",
  subscription: "Assinatura",
  usage: "Uso",
  bonus: "Bônus",
};

const TYPE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  purchase: "default",
  subscription: "default",
  usage: "destructive",
  bonus: "secondary",
};

export default function CreditosPage() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/creditos")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setData(d);
        }
      })
      .catch(() => setError("Erro ao carregar créditos."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Créditos</h1>
      <p className="text-muted-foreground mb-8">
        Gerencie seu saldo de créditos e visualize o histórico de uso.
      </p>

      {/* Cards de saldo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Créditos disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <>
                <div className="text-4xl font-bold">{data?.balance ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  1 crédito = 1 questão gerada por IA
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Plano atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold capitalize">
                  {PLAN_LABELS[data?.planType ?? "free"] ?? data?.planType}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data?.planType === "free"
                    ? "10 créditos incluídos no cadastro"
                    : "Créditos mensais recorrentes"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Informação sobre planos */}
      <Card className="mb-8 border-dashed">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Precisa de mais créditos?</h3>
          <p className="text-sm text-muted-foreground">
            Planos com mais créditos estarão disponíveis em breve. Entre em contato pelo e-mail{" "}
            <span className="font-medium text-foreground">contato@simulaeduca.com.br</span> para
            mais informações ou para adquirir créditos adicionais.
          </p>
        </CardContent>
      </Card>

      {/* Histórico de transações */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Histórico de transações</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <Card className="p-6 text-center text-destructive text-sm">{error}</Card>
        ) : data?.transactions.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma transação registrada ainda.
          </Card>
        ) : (
          <Card>
            <div className="divide-y">
              {data?.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Badge variant={TYPE_VARIANTS[t.type] ?? "secondary"} className="shrink-0">
                      {TYPE_LABELS[t.type] ?? t.type}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        {t.description ?? "Transação de créditos"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      t.amount > 0 ? "text-green-600" : "text-destructive"
                    }`}
                  >
                    {t.amount > 0 ? "+" : ""}
                    {t.amount}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
