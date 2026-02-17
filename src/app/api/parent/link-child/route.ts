import { NextResponse } from "next/server";
import { z } from "zod";
import { loadParentAuthContext } from "@/lib/parent/access";
import { verifyParentSecretCode } from "@/lib/parent/secret-code";
import { formatZodError, parseRequestJson } from "@/lib/validation";

const linkChildSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  secretCode: z.string().trim().min(1).max(32),
});

type StudentCandidate = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  parent_secret_code_plain: string | null;
  parent_secret_code_hash: string | null;
};

const GENERIC_LINK_ERROR =
  "Les informations fournies ne permettent pas de rattacher un enfant.";

const normalize = (value: string) => value.trim().toLowerCase();

export async function POST(request: Request) {
  const parsedBody = await parseRequestJson(request, linkChildSchema);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: formatZodError(parsedBody.error) },
      { status: 422 }
    );
  }

  const authContext = await loadParentAuthContext(request);
  if (!authContext.context) {
    return NextResponse.json(
      { error: authContext.failure?.error ?? "Acces refuse." },
      { status: authContext.failure?.status ?? 403 }
    );
  }

  const normalizedEmail = normalize(parsedBody.data.email);
  const normalizedFirstName = normalize(parsedBody.data.firstName);
  const normalizedLastName = normalize(parsedBody.data.lastName);
  const normalizedSecretCode = parsedBody.data.secretCode.trim().toUpperCase();

  const { data: rows } = await authContext.context.admin
    .from("students")
    .select(
      "id, first_name, last_name, email, parent_secret_code_plain, parent_secret_code_hash"
    )
    .ilike("email", normalizedEmail);

  const candidates = ((rows ?? []) as StudentCandidate[]).filter((candidate) => {
    const candidateFirst = normalize(candidate.first_name);
    const candidateLast = normalize(candidate.last_name ?? "");
    return candidateFirst === normalizedFirstName && candidateLast === normalizedLastName;
  });

  const matchedStudent = candidates.find((candidate) => {
    if (candidate.parent_secret_code_hash) {
      return verifyParentSecretCode(normalizedSecretCode, candidate.parent_secret_code_hash);
    }
    return (
      candidate.parent_secret_code_plain?.trim().toUpperCase() === normalizedSecretCode
    );
  });

  if (!matchedStudent) {
    return NextResponse.json({ error: GENERIC_LINK_ERROR }, { status: 400 });
  }

  const { error: upsertError } = await authContext.context.admin
    .from("parent_child_links")
    .upsert(
      {
        parent_user_id: authContext.context.parentUserId,
        student_id: matchedStudent.id,
        parent_email: authContext.context.parentEmail,
      },
      { onConflict: "parent_user_id,student_id" }
    );

  if (upsertError) {
    return NextResponse.json(
      { error: "Rattachement impossible." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
