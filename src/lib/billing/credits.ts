import { prisma } from "@/lib/db/prisma";

export async function getUserCredits(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true },
  });
  return user?.creditsBalance ?? 0;
}

export async function hasEnoughCredits(userId: string, amount: number): Promise<boolean> {
  const balance = await getUserCredits(userId);
  return balance >= amount;
}

// Transação atômica: verifica saldo E deduz no mesmo lock (previne race condition)
export async function deductCredits(
  userId: string,
  amount: number,
  examId: string,
  description: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditsBalance: true },
    });

    if (user.creditsBalance < amount) {
      throw new Error(`Créditos insuficientes. Saldo: ${user.creditsBalance}, necessário: ${amount}.`);
    }

    await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: { decrement: amount } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        type: "usage",
        description,
        examId,
      },
    });
  });
}

export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  description: string
): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount,
        type,
        description,
      },
    }),
  ]);
}
