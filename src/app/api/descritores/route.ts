import { prisma } from "@/lib/db/prisma";
import { NextRequest } from "next/server";

// GET /api/descritores?evaluationSlug=spaece&subjectSlug=matematica&gradeLevelSlug=9_ano
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const evaluationSlug = searchParams.get("evaluationSlug") ?? "spaece";
  const subjectSlug = searchParams.get("subjectSlug") ?? "matematica";
  const gradeLevelSlug = searchParams.get("gradeLevelSlug") ?? "9_ano";

  const descriptors = await prisma.descriptor.findMany({
    where: {
      evaluation: { slug: evaluationSlug },
      subject: { slug: subjectSlug },
      gradeLevel: { slug: gradeLevelSlug },
    },
    include: {
      theme: { select: { name: true, romanNumeral: true } },
    },
    orderBy: { code: "asc" },
  });

  return Response.json(descriptors);
}
