import { prisma } from "@/lib/db/prisma";
import { NextRequest } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";

const DESCRIPTOR_TTL = 7200; // 2 hours

// GET /api/descritores?evaluationSlug=spaece&subjectSlug=matematica&gradeLevelSlug=9_ano
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const evaluationSlug = searchParams.get("evaluationSlug") ?? "spaece";
  const subjectSlug = searchParams.get("subjectSlug") ?? "matematica";
  const gradeLevelSlug = searchParams.get("gradeLevelSlug") ?? "9_ano";

  // Try cache first
  const cacheKey = `descriptors:${evaluationSlug}:${subjectSlug}:${gradeLevelSlug}`;
  const cached = await cacheGet<unknown[]>(cacheKey);
  if (cached) {
    return Response.json(cached);
  }

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

  // Cache result
  await cacheSet(cacheKey, descriptors, DESCRIPTOR_TTL);

  return Response.json(descriptors);
}
