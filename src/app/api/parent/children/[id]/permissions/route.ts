import { NextResponse } from "next/server";
import { z } from "zod";
import { loadParentLinkedStudentContext } from "@/lib/parent/access";
import { formatZodError } from "@/lib/validation";

type Params = { params: { id: string } | Promise<{ id: string }> };

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: Request, { params }: Params) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedParams.error) },
      { status: 422 }
    );
  }

  const loaded = await loadParentLinkedStudentContext(request, parsedParams.data.id);
  if (!loaded.context) {
    return NextResponse.json(
      { error: loaded.failure?.error ?? "Acces refuse." },
      { status: loaded.failure?.status ?? 403 }
    );
  }

  return NextResponse.json({
    studentId: loaded.context.studentId,
    permissions: loaded.context.parentPermissions,
  });
}

