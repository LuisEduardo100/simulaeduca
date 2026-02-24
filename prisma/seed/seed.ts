/**
 * SimulaEduca — Script de Seed do Banco de Dados
 *
 * Popula o banco com:
 * - Avaliações (SPAECE, SAEB)
 * - Disciplinas (Matemática, Língua Portuguesa)
 * - Séries (5º ano, 9º ano)
 * - Temas e Descritores (SPAECE Matemática 9º ano — Seção 8.1 do plano)
 * - Planos de assinatura
 *
 * Uso: npm run db:seed
 */

import spaeceMat9Descriptors from "./data/descriptors-spaece-mat-9ano.json";
import plansData from "./data/plans.json";
import { prisma } from "../../src/lib/db/prisma";

async function main() {
  console.log("🌱 Iniciando seed do banco de dados SimulaEduca...\n");

  // ─── Avaliações ────────────────────────────────────────────────────────────
  console.log("📋 Criando avaliações...");
  const spaece = await prisma.evaluation.upsert({
    where: { slug: "spaece" },
    update: {},
    create: { name: "SPAECE", slug: "spaece" },
  });

  const saeb = await prisma.evaluation.upsert({
    where: { slug: "saeb" },
    update: {},
    create: { name: "SAEB", slug: "saeb" },
  });

  console.log(`  ✅ SPAECE (id: ${spaece.id})`);
  console.log(`  ✅ SAEB (id: ${saeb.id})`);

  // ─── Disciplinas ───────────────────────────────────────────────────────────
  console.log("\n📚 Criando disciplinas...");
  const matematica = await prisma.subject.upsert({
    where: { slug: "matematica" },
    update: {},
    create: { name: "Matemática", slug: "matematica" },
  });

  const portugues = await prisma.subject.upsert({
    where: { slug: "portugues" },
    update: {},
    create: { name: "Língua Portuguesa", slug: "portugues" },
  });

  console.log(`  ✅ Matemática (id: ${matematica.id})`);
  console.log(`  ✅ Língua Portuguesa (id: ${portugues.id})`);

  // ─── Séries ────────────────────────────────────────────────────────────────
  console.log("\n🎓 Criando séries...");
  const quinto = await prisma.gradeLevel.upsert({
    where: { slug: "5_ano" },
    update: {},
    create: { name: "5º ano", slug: "5_ano", level: "fundamental" },
  });

  const nono = await prisma.gradeLevel.upsert({
    where: { slug: "9_ano" },
    update: {},
    create: { name: "9º ano", slug: "9_ano", level: "fundamental" },
  });

  console.log(`  ✅ 5º ano (id: ${quinto.id})`);
  console.log(`  ✅ 9º ano (id: ${nono.id})`);

  // ─── Descritores SPAECE Matemática 9º ano ─────────────────────────────────
  console.log("\n🔢 Criando descritores SPAECE — Matemática — 9º ano...");

  let totalDescriptors = 0;

  for (const themeData of spaeceMat9Descriptors.themes) {
    // Upsert do tema
    const theme = await prisma.theme.upsert({
      where: {
        // Prisma não suporta upsert com múltiplos campos sem unique index — usamos findFirst + create
        id: (
          await prisma.theme.findFirst({
            where: {
              name: themeData.name,
              evaluationId: spaece.id,
              subjectId: matematica.id,
              gradeLevelId: nono.id,
            },
          })
        )?.id ?? -1,
      },
      update: {},
      create: {
        name: themeData.name,
        romanNumeral: themeData.romanNumeral,
        evaluationId: spaece.id,
        subjectId: matematica.id,
        gradeLevelId: nono.id,
      },
    });

    console.log(`\n  📌 Tema ${themeData.romanNumeral}: ${themeData.name}`);

    for (const desc of themeData.descriptors) {
      await prisma.descriptor.upsert({
        where: {
          code_evaluationId_subjectId_gradeLevelId: {
            code: desc.code,
            evaluationId: spaece.id,
            subjectId: matematica.id,
            gradeLevelId: nono.id,
          },
        },
        update: { description: desc.description },
        create: {
          code: desc.code,
          description: desc.description,
          themeId: theme.id,
          evaluationId: spaece.id,
          subjectId: matematica.id,
          gradeLevelId: nono.id,
        },
      });
      console.log(`     ✅ ${desc.code} — ${desc.description}`);
      totalDescriptors++;
    }
  }

  // ─── Planos de Assinatura ─────────────────────────────────────────────────
  console.log("\n💳 Criando planos de assinatura...");

  for (const plan of plansData) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        creditsMonthly: plan.creditsMonthly,
        maxQuestionsPerExam: plan.maxQuestionsPerExam,
        features: plan.features,
      },
      create: {
        name: plan.name,
        slug: plan.slug,
        priceMonthly: plan.priceMonthly,
        creditsMonthly: plan.creditsMonthly,
        maxQuestionsPerExam: plan.maxQuestionsPerExam,
        features: plan.features,
      },
    });
    const price = plan.priceMonthly ? `R$ ${plan.priceMonthly}/mês` : "Gratuito";
    console.log(`  ✅ ${plan.name} (${plan.slug}) — ${price} — ${plan.creditsMonthly} créditos/mês`);
  }

  // ─── Resumo ────────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("✨ Seed concluído com sucesso!\n");
  console.log("📊 Resumo:");
  console.log(`   • Avaliações: 2 (SPAECE, SAEB)`);
  console.log(`   • Disciplinas: 2 (Matemática, Língua Portuguesa)`);
  console.log(`   • Séries: 2 (5º ano, 9º ano)`);
  console.log(`   • Temas: ${spaeceMat9Descriptors.themes.length} (SPAECE Mat 9º ano)`);
  console.log(`   • Descritores: ${totalDescriptors} (SPAECE Mat 9º ano)`);
  console.log(`   • Planos: ${plansData.length}`);
  console.log("\n🚀 Banco pronto para desenvolvimento!");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
