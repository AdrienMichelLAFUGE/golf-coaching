import "server-only";

import {
  generateParentSecretCode,
  hashParentSecretCode,
  normalizeParentSecretCode,
  PARENT_SECRET_CODE_PATTERN,
} from "@/lib/parent/secret-code";

type AdminClient = ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

type StudentSecretRow = {
  id: string;
  parent_secret_code_plain: string | null;
  parent_secret_code_hash: string | null;
  parent_secret_code_rotated_at: string | null;
};

type StudentSecretResult = {
  studentId: string;
  secretCode: string;
  rotatedAt: string | null;
};

const isValidPlainSecretCode = (value: string | null | undefined): value is string =>
  Boolean(value && PARENT_SECRET_CODE_PATTERN.test(normalizeParentSecretCode(value)));

const loadStudentSecretRow = async (admin: AdminClient, studentId: string) => {
  const { data, error } = await admin
    .from("students")
    .select("id, parent_secret_code_plain, parent_secret_code_hash, parent_secret_code_rotated_at")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !data) return null;
  return data as StudentSecretRow;
};

export const ensureStudentParentSecretCode = async (
  admin: AdminClient,
  studentId: string
): Promise<StudentSecretResult | null> => {
  const row = await loadStudentSecretRow(admin, studentId);
  if (!row) return null;

  if (isValidPlainSecretCode(row.parent_secret_code_plain) && row.parent_secret_code_hash) {
    return {
      studentId: row.id,
      secretCode: normalizeParentSecretCode(row.parent_secret_code_plain),
      rotatedAt: row.parent_secret_code_rotated_at,
    };
  }

  const nextCode = generateParentSecretCode();
  const nextHash = hashParentSecretCode(nextCode);
  const rotatedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await admin
    .from("students")
    .update({
      parent_secret_code_plain: nextCode,
      parent_secret_code_hash: nextHash,
      parent_secret_code_rotated_at: rotatedAt,
    })
    .eq("id", studentId)
    .select("id, parent_secret_code_plain, parent_secret_code_rotated_at")
    .maybeSingle();

  if (updateError || !updated) return null;

  return {
    studentId: (updated as { id: string }).id,
    secretCode: nextCode,
    rotatedAt: (updated as { parent_secret_code_rotated_at: string | null })
      .parent_secret_code_rotated_at,
  };
};

export const regenerateStudentParentSecretCode = async (
  admin: AdminClient,
  studentId: string
): Promise<StudentSecretResult | null> => {
  const nextCode = generateParentSecretCode();
  const nextHash = hashParentSecretCode(nextCode);
  const rotatedAt = new Date().toISOString();

  const { data, error } = await admin
    .from("students")
    .update({
      parent_secret_code_plain: nextCode,
      parent_secret_code_hash: nextHash,
      parent_secret_code_rotated_at: rotatedAt,
    })
    .eq("id", studentId)
    .select("id, parent_secret_code_rotated_at")
    .maybeSingle();

  if (error || !data) return null;

  return {
    studentId: (data as { id: string }).id,
    secretCode: nextCode,
    rotatedAt: (data as { parent_secret_code_rotated_at: string | null })
      .parent_secret_code_rotated_at,
  };
};
