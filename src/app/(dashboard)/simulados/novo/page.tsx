import { auth } from "@/lib/utils/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { SimuladoForm } from "@/components/simulado/SimuladoForm";

export default async function NovoSimuladoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Buscar dados do perfil para pre-preencher campos
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, school: true },
  });

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Criar Novo Simulado</h1>
      <p className="text-muted-foreground mb-6">
        Configure o simulado, selecione os descritores e a IA gerara 26 questoes automaticamente.
      </p>
      <SimuladoForm
        userProfile={{
          name: user?.name ?? undefined,
          school: user?.school ?? undefined,
        }}
      />
    </main>
  );
}
