import "server-only";

import {
  generateParentSecretCode,
  hashParentSecretCode,
} from "@/lib/parent/secret-code";

type AdminClient = ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

type StudentSecretRow = {
  id: string;
  parent_secret_code_hash: string | null;
  parent_secret_code_rotated_at: string | null;
};

export type StudentSecretMetadata = {
  studentId: string;
  rotatedAt: string | null;
  hasSecretCode: boolean;
};

export type StudentSecretRegenerateResult = {
  studentId: string;
  secretCode: string;
  rotatedAt: string | null;
};

const loadStudentSecretRow = async (admin: AdminClient, studentId: string) => {
  const { data, error } = await admin
    .from("students")
    .select("id, parent_secret_code_hash, parent_secret_code_rotated_at")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !data) return null;
  return data as StudentSecretRow;
};

export const loadStudentParentSecretCodeMetadata = async (
  admin: AdminClient,
  studentId: string
): Promise<StudentSecretMetadata | null> => {
  const row = await loadStudentSecretRow(admin, studentId);
  if (!row) return null;

  return {
    studentId: row.id,
    rotatedAt: row.parent_secret_code_rotated_at,
    hasSecretCode: Boolean(row.parent_secret_code_hash),
  };
};

export const regenerateStudentParentSecretCode = async (
  admin: AdminClient,
  studentId: string
): Promise<StudentSecretRegenerateResult | null> => {
  const nextCode = generateParentSecretCode();
  const nextHash = hashParentSecretCode(nextCode);
  const rotatedAt = new Date().toISOString();

  const { data, error } = await admin
    .from("students")
    .update({
      parent_secret_code_plain: null,
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

