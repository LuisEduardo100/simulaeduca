import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const hash = await bcrypt.hash("admin123", 12);

  try {
    const user = await prisma.user.create({
      data: {
        name: "Admin",
        email: "admin@email.com",
        passwordHash: hash,
        role: "admin",
      },
      select: { id: true, email: true, role: true },
    });
    console.log("Usuario criado:", JSON.stringify(user));
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      const user = await prisma.user.update({
        where: { email: "admin@email.com" },
        data: { role: "admin", passwordHash: hash },
        select: { id: true, email: true, role: true },
      });
      console.log("Usuario atualizado para admin:", JSON.stringify(user));
    } else {
      throw e;
    }
  }

  process.exit(0);
}

main();
