import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-primary">SimulaEduca</span>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Criar conta grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-4 text-center bg-gradient-to-b from-primary/5 to-background">
        <div className="max-w-3xl mx-auto">
          <div className="inline-block bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full mb-6">
            10 créditos gratuitos para começar
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Gere simulados SPAECE e SAEB{" "}
            <span className="text-primary">em minutos com IA</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
            Crie provas personalizadas alinhadas à BNCC, com questões de múltipla escolha
            geradas por inteligência artificial, organizadas por descritor, série e disciplina.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="px-8">Começar grátis</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="px-8">Já tenho conta</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Como funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-primary font-bold text-lg">1</span>
                </div>
                <CardTitle className="text-lg">Escolha a avaliação</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                Selecione SPAECE ou SAEB, a série (5º ou 9º ano) e a disciplina (Matemática ou Língua Portuguesa).
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-primary font-bold text-lg">2</span>
                </div>
                <CardTitle className="text-lg">Selecione os descritores</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                Escolha os descritores da matriz de referência que deseja avaliar e defina o nível de dificuldade de cada questão.
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-primary font-bold text-lg">3</span>
                </div>
                <CardTitle className="text-lg">IA gera o simulado</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                Nossa IA gera questões de múltipla escolha originais, com gabarito comentado e resolução, prontas para imprimir em PDF.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Tudo que você precisa</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Alinhado à BNCC",
                desc: "Questões baseadas nas matrizes de referência oficiais do SPAECE e SAEB.",
              },
              {
                title: "PDF pronto para imprimir",
                desc: "Baixe a prova e o gabarito em PDF formatado, pronto para aplicar em sala.",
              },
              {
                title: "10 créditos grátis",
                desc: "Comece a usar agora mesmo sem precisar de cartão de crédito.",
              },
              {
                title: "Questões originais",
                desc: "A IA gera questões únicas a cada simulado, evitando repetições.",
              },
              {
                title: "Gabarito comentado",
                desc: "Cada questão vem com resolução detalhada para o professor.",
              },
              {
                title: "Múltiplos descritores",
                desc: "Crie simulados com até 30 questões cobrindo diferentes habilidades.",
              },
            ].map((item) => (
              <Card key={item.title} className="p-5">
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-4 bg-primary text-primary-foreground text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            Pronto para criar seu primeiro simulado?
          </h2>
          <p className="text-primary-foreground/80 mb-8 text-lg">
            Cadastre-se gratuitamente e ganhe 10 créditos para começar.
            Sem cartão de crédito necessário.
          </p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="px-10">
              Criar conta grátis
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 text-center text-sm text-muted-foreground">
        <p>© 2026 SimulaEduca. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
