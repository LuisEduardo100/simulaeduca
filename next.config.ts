import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes server-only que devem ser tratados como externos (não bundled pelo Webpack/Turbopack)
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    // @react-pdf/renderer usa canvas nativo — precisa ser external no servidor
    "@react-pdf/renderer",
    // LangChain e dependências com módulos Node nativos
    "langchain",
    "@langchain/openai",
    "@langchain/core",
    "@langchain/textsplitters",
    // pdf-parse usa fs diretamente
    "pdf-parse",
    // mammoth usa XMLParser
    "mammoth",
  ],

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
