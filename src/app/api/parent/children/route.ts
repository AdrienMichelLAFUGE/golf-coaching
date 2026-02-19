import { NextResponse } from "next/server";
import { loadParentAuthContext } from "@/lib/parent/access";

type ParentChildRow = {
  student_id: string;
  students:
    | {
        id: string;
        first_name: string;
        last_name: string | null;
        email: string | null;
      }
    | {
        id: string;
        first_name: string;
        last_name: string | null;
        email: string | null;
      }[]
    | null;
};

const getStudent = (value: ParentChildRow["students"]) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

export async function GET(request: Request) {
  const authContext = await loadParentAuthContext(request);
  if (!authContext.context) {
    return NextResponse.json(
      { error: authContext.failure?.error ?? "Acces refuse." },
      { status: authContext.failure?.status ?? 403 }
    );
  }

  const { data, error } = await authContext.context.admin
    .from("parent_child_links")
    .select("student_id, students(id, first_name, last_name, email)")
    .eq("parent_user_id", authContext.context.parentUserId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Chargement des enfants impossible." },
      { status: 400 }
    );
  }

  const children = ((data ?? []) as ParentChildRow[])
    .map((row) => {
      const student = getStudent(row.students);
      if (!student) return null;
      return {
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        fullName: `${student.first_name} ${student.last_name ?? ""}`.trim(),
        email: student.email,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return NextResponse.json({ children });
}
