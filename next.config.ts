import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário para que Prisma funcione corretamente no servidor
  serverExternalPackages: ["@prisma/client", "prisma"],

  // Configurações de imagem — adicionar domínios conforme necessário
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.googleusercontent.com", // Google OAuth avatars
      },
    ],
  },
};

export default nextConfig;
