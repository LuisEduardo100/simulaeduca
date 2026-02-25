import { SimuladoForm } from "@/components/simulado/SimuladoForm";

export default function NovoSimuladoPage() {
  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Criar Novo Simulado</h1>
      <p className="text-muted-foreground mb-6">
        Configure o simulado e selecione os descritores para cada questão. A IA irá gerar as questões automaticamente.
      </p>
      <SimuladoForm />
    </main>
  );
}
