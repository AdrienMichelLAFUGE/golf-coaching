import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { PELZ_APPROCHES_SLUG, PELZ_APPROCHES_TEST } from "@/lib/normalized-tests/pelz-approches";
import { PELZ_PUTTING_SLUG, PELZ_PUTTING_TEST } from "@/lib/normalized-tests/pelz-putting";
import {
  WEDGING_DRAPEAU_COURT_SLUG,
  WEDGING_DRAPEAU_COURT_TEST,
} from "@/lib/normalized-tests/wedging-drapeau-court";
import {
  WEDGING_DRAPEAU_LONG_SLUG,
  WEDGING_DRAPEAU_LONG_TEST,
} from "@/lib/normalized-tests/wedging-drapeau-long";
import { type GlobalSearchItem, GlobalSearchResponseSchema } from "@/lib/search/global";
import { createSupabaseServerClientFromRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 80;

const querySchema = z.object({
  q: z.string().trim().min(2).max(MAX_QUERY_LENGTH),
  limit: z.coerce.number().int().min(6).max(36).default(18),
});

const roleSchema = z.enum(["owner", "coach", "staff", "student", "parent"]);

type SearchProfile = {
  id: string;
  org_id: string | null;
  active_workspace_id: string | null;
  role: z.infer<typeof roleSchema>;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
};

type ReportRow = {
  id: string;
  title: string;
  student_id: string | null;
  report_date: string | null;
  created_at: string;
  sent_at: string | null;
  students:
    | {
        first_name: string;
        last_name: string | null;
      }
    | {
        first_name: string;
        last_name: string | null;
      }[]
    | null;
};

type AssignmentRow = {
  id: string;
  test_slug: string;
  status: "assigned" | "in_progress" | "finalized";
  assigned_at: string;
  student_id: string | null;
  archived_at?: string | null;
  students:
    | {
        first_name: string;
        last_name: string | null;
        email: string | null;
      }
    | {
        first_name: string;
        last_name: string | null;
        email: string | null;
      }[]
    | null;
};

type RankedItem = GlobalSearchItem & { rank: number };

type QuickAction = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  keywords: string[];
};

const TEST_TITLE_BY_SLUG: Record<string, string> = {
  [PELZ_PUTTING_SLUG]: PELZ_PUTTING_TEST.title,
  [PELZ_APPROCHES_SLUG]: PELZ_APPROCHES_TEST.title,
  [WEDGING_DRAPEAU_LONG_SLUG]: WEDGING_DRAPEAU_LONG_TEST.title,
  [WEDGING_DRAPEAU_COURT_SLUG]: WEDGING_DRAPEAU_COURT_TEST.title,
};

const TEST_STATUS_LABELS: Record<AssignmentRow["status"], string> = {
  assigned: "Assigne",
  in_progress: "En cours",
  finalized: "Finalise",
};

const isCoachLikeRole = (role: SearchProfile["role"]) =>
  role === "owner" || role === "coach" || role === "staff";

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const scoreText = (query: string, candidate: string) => {
  const normalizedQuery = normalizeText(query);
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return Number.POSITIVE_INFINITY;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 0;
  if (normalizedCandidate.includes(normalizedQuery)) return 1;
  return Number.POSITIVE_INFINITY;
};

const asStudent = (
  value:
    | StudentRow
    | {
        first_name: string;
        last_name: string | null;
        email?: string | null;
      }
    | null
    | undefined
) => {
  if (!value) return null;
  return value;
};

const getStudentFromRelation = <
  T extends
    | {
        first_name: string;
        last_name: string | null;
        email?: string | null;
      }
    | null
    | undefined,
>(
  value: T | T[]
) => {
  if (!value) return null;
  if (Array.isArray(value)) return asStudent(value[0] ?? null);
  return asStudent(value);
};

const getStudentName = (
  student:
    | {
        first_name: string;
        last_name: string | null;
      }
    | null
    | undefined
) =>
  [student?.first_name?.trim(), student?.last_name?.trim()].filter(Boolean).join(" ").trim() ||
  "Eleve";

const toLikePattern = (value: string) => {
  const sanitized = value.replace(/[,_%]/g, " ").replace(/\s+/g, " ").trim();
  return `%${sanitized}%`;
};

const makeCoachTestHref = (slug: string, assignmentId: string) => {
  if (slug === PELZ_PUTTING_SLUG) return `/app/coach/tests/${assignmentId}`;
  if (slug === WEDGING_DRAPEAU_LONG_SLUG) {
    return `/app/coach/tests-wedging-drapeau-long/${assignmentId}`;
  }
  if (slug === WEDGING_DRAPEAU_COURT_SLUG) {
    return `/app/coach/tests-wedging-drapeau-court/${assignmentId}`;
  }
  return `/app/coach/tests-approches/${assignmentId}`;
};

const makeStudentTestHref = (slug: string, assignmentId: string) => {
  if (slug === PELZ_PUTTING_SLUG) return `/app/eleve/tests/${assignmentId}`;
  if (slug === WEDGING_DRAPEAU_LONG_SLUG) {
    return `/app/eleve/tests-wedging-drapeau-long/${assignmentId}`;
  }
  if (slug === WEDGING_DRAPEAU_COURT_SLUG) {
    return `/app/eleve/tests-wedging-drapeau-court/${assignmentId}`;
  }
  return `/app/eleve/tests-approches/${assignmentId}`;
};

const getRoleQuickActions = (role: SearchProfile["role"], email: string | null): QuickAction[] => {
  const actions: QuickAction[] = [];

  if (isCoachLikeRole(role)) {
    actions.push(
      {
        id: "coach-dashboard",
        title: "Dashboard coach",
        subtitle: "Vue globale du workspace",
        href: "/app/coach",
        keywords: ["dashboard", "accueil", "coach", "home"],
      },
      {
        id: "coach-students",
        title: "Eleves",
        subtitle: "Liste complete des eleves",
        href: "/app/coach/eleves",
        keywords: ["eleves", "joueurs", "students"],
      },
      {
        id: "coach-reports",
        title: "Rapports",
        subtitle: "Historique des rapports",
        href: "/app/coach/rapports",
        keywords: ["rapports", "report", "comptes rendus"],
      },
      {
        id: "coach-report-new",
        title: "Nouveau rapport",
        subtitle: "Demarrer une redaction",
        href: "/app/coach/rapports/nouveau",
        keywords: ["nouveau", "rapport", "rediger"],
      },
      {
        id: "coach-tests",
        title: "Tests",
        subtitle: "Suivi des tests normalises",
        href: "/app/coach/tests",
        keywords: ["tests", "pelz", "wedging"],
      },
      {
        id: "coach-messages",
        title: "Messages",
        subtitle: "Boite de reception",
        href: "/app/coach/messages",
        keywords: ["messages", "inbox", "discussion"],
      }
    );
  } else if (role === "student") {
    actions.push(
      {
        id: "student-dashboard",
        title: "Dashboard eleve",
        subtitle: "Vue principale",
        href: "/app/eleve",
        keywords: ["dashboard", "eleve", "accueil"],
      },
      {
        id: "student-reports",
        title: "Mes rapports",
        subtitle: "Historique des rapports publies",
        href: "/app/eleve/rapports",
        keywords: ["rapports", "report", "historique"],
      },
      {
        id: "student-tests",
        title: "Mes tests",
        subtitle: "Tests assignes",
        href: "/app/eleve/tests",
        keywords: ["tests", "pelz", "wedging"],
      },
      {
        id: "student-messages",
        title: "Messages",
        subtitle: "Conversations",
        href: "/app/eleve/messages",
        keywords: ["messages", "discussion", "inbox"],
      }
    );
  }

  if (isAdminEmail(email)) {
    actions.push(
      {
        id: "admin-dashboard",
        title: "Backoffice",
        subtitle: "Dashboard administrateur",
        href: "/app/admin",
        keywords: ["admin", "backoffice", "supervision"],
      },
      {
        id: "admin-coaches",
        title: "Backoffice coachs",
        subtitle: "Gestion des coachs",
        href: "/app/admin/coaches",
        keywords: ["coachs", "comptes", "admin"],
      },
      {
        id: "admin-bugs",
        title: "Backoffice support",
        subtitle: "Tickets et retours bug",
        href: "/app/admin/bugs",
        keywords: ["support", "bugs", "tickets"],
      }
    );
  }

  return actions;
};

const pushRankedItem = (
  target: RankedItem[],
  item: GlobalSearchItem,
  query: string,
  baseRank: number,
  matchFields: string[]
) => {
  const bestFieldRank = matchFields.reduce((best, field) => {
    const fieldScore = scoreText(query, field);
    return fieldScore < best ? fieldScore : best;
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(bestFieldRank)) return;
  target.push({ ...item, rank: baseRank + bestFieldRank });
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get("q") ?? "").trim();

  if (rawQuery.length < 2) {
    return NextResponse.json({ query: rawQuery, items: [] });
  }

  const parsedQuery = querySchema.safeParse({
    q: rawQuery,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Parametres de recherche invalides." }, { status: 422 });
  }

  const query = parsedQuery.data.q;
  const limit = parsedQuery.data.limit;
  const likeQuery = toLikePattern(query);

  const supabase = createSupabaseServerClientFromRequest(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = userData.user.id;
  const email = userData.user.email?.trim().toLowerCase() ?? null;

  const { data: profileRaw, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, org_id, active_workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profileRaw) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
  }

  const parsedRole = roleSchema.safeParse(profileRaw.role);
  if (!parsedRole.success) {
    return NextResponse.json({ query, items: [] });
  }

  const profile: SearchProfile = {
    id: profileRaw.id,
    org_id: profileRaw.org_id ?? null,
    active_workspace_id: profileRaw.active_workspace_id ?? null,
    role: parsedRole.data,
  };

  const workspaceId = profile.active_workspace_id ?? profile.org_id;
  const rankedItems: RankedItem[] = [];

  const quickActions = getRoleQuickActions(profile.role, email);
  quickActions.forEach((action) => {
    pushRankedItem(
      rankedItems,
      {
        id: action.id,
        kind: "page",
        title: action.title,
        subtitle: action.subtitle,
        href: action.href,
      },
      query,
      20,
      [action.title, action.subtitle, action.href, action.keywords.join(" ")]
    );
  });

  if (profile.role === "student") {
    const { data: studentAccounts } = await supabase
      .from("student_accounts")
      .select("student_id")
      .eq("user_id", userId);

    const studentIds = Array.from(
      new Set(
        (studentAccounts ?? [])
          .map((row) => row.student_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    if (studentIds.length > 0) {
      const [{ data: reportsRows }, { data: assignmentRows }] = await Promise.all([
        supabase
          .from("reports")
          .select("id, title, report_date, created_at, sent_at, student_id")
          .in("student_id", studentIds)
          .not("sent_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("normalized_test_assignments")
          .select("id, test_slug, status, assigned_at, student_id, archived_at")
          .in("student_id", studentIds)
          .is("archived_at", null)
          .order("assigned_at", { ascending: false })
          .limit(24),
      ]);

      (reportsRows ?? []).forEach((row) => {
        const report = row as {
          id: string;
          title: string | null;
          report_date: string | null;
          created_at: string;
          sent_at: string | null;
        };
        const reportTitle = report.title?.trim() || "Rapport";
        pushRankedItem(
          rankedItems,
          {
            id: report.id,
            kind: "report",
            title: reportTitle,
            subtitle: "Rapport publie",
            href: `/app/eleve/rapports/${report.id}`,
          },
          query,
          4,
          [reportTitle, report.sent_at ? "publie" : "brouillon"]
        );
      });

      (assignmentRows ?? []).forEach((row) => {
        const assignment = row as {
          id: string;
          test_slug: string;
          status: AssignmentRow["status"];
        };
        const testTitle = TEST_TITLE_BY_SLUG[assignment.test_slug] ?? assignment.test_slug;
        pushRankedItem(
          rankedItems,
          {
            id: assignment.id,
            kind: "test",
            title: testTitle,
            subtitle: TEST_STATUS_LABELS[assignment.status],
            href: makeStudentTestHref(assignment.test_slug, assignment.id),
          },
          query,
          8,
          [testTitle, assignment.test_slug, TEST_STATUS_LABELS[assignment.status]]
        );
      });
    }
  } else if (isCoachLikeRole(profile.role) && workspaceId) {
    const [workspaceStudentsResponse, reportsByTitleResponse, testsBySlugResponse, shareRows] =
      await Promise.all([
        supabase
          .from("students")
          .select("id, first_name, last_name, email")
          .eq("org_id", workspaceId)
          .or(`first_name.ilike.${likeQuery},last_name.ilike.${likeQuery},email.ilike.${likeQuery}`)
          .limit(8),
        supabase
          .from("reports")
          .select(
            "id, title, student_id, report_date, created_at, sent_at, students(first_name, last_name)"
          )
          .ilike("title", likeQuery)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("normalized_test_assignments")
          .select(
            "id, test_slug, status, assigned_at, student_id, archived_at, students(first_name, last_name, email)"
          )
          .ilike("test_slug", likeQuery)
          .is("archived_at", null)
          .order("assigned_at", { ascending: false })
          .limit(8),
        email
          ? supabase
              .from("student_shares")
              .select("student_id")
              .eq("status", "active")
              .ilike("viewer_email", email)
          : Promise.resolve({ data: [] as Array<{ student_id: string }>, error: null }),
      ]);

    const sharedIds = Array.from(
      new Set(
        (shareRows.data ?? [])
          .map((row) => row.student_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    const sharedStudentsResponse =
      sharedIds.length > 0
        ? await supabase
            .from("students")
            .select("id, first_name, last_name, email")
            .in("id", sharedIds)
            .or(`first_name.ilike.${likeQuery},last_name.ilike.${likeQuery},email.ilike.${likeQuery}`)
            .limit(6)
        : { data: [] as StudentRow[], error: null };

    const studentById = new Map<string, StudentRow>();
    ((workspaceStudentsResponse.data ?? []) as StudentRow[]).forEach((row) =>
      studentById.set(row.id, row)
    );
    ((sharedStudentsResponse.data ?? []) as StudentRow[]).forEach((row) =>
      studentById.set(row.id, row)
    );

    const matchedStudentIds = Array.from(studentById.keys());

    const [reportsByStudentResponse, testsByStudentResponse] = await Promise.all([
      matchedStudentIds.length > 0
        ? supabase
            .from("reports")
            .select(
              "id, title, student_id, report_date, created_at, sent_at, students(first_name, last_name)"
            )
            .in("student_id", matchedStudentIds)
            .order("created_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] as ReportRow[], error: null }),
      matchedStudentIds.length > 0
        ? supabase
            .from("normalized_test_assignments")
            .select(
              "id, test_slug, status, assigned_at, student_id, archived_at, students(first_name, last_name, email)"
            )
            .in("student_id", matchedStudentIds)
            .is("archived_at", null)
            .order("assigned_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] as AssignmentRow[], error: null }),
    ]);

    studentById.forEach((student) => {
      const studentName = getStudentName(student);
      pushRankedItem(
        rankedItems,
        {
          id: student.id,
          kind: "student",
          title: studentName,
          subtitle: student.email ?? "Fiche eleve",
          href: `/app/coach/eleves/${student.id}`,
        },
        query,
        0,
        [studentName, student.email ?? ""]
      );
    });

    const reportById = new Map<string, ReportRow>();
    ((reportsByTitleResponse.data ?? []) as ReportRow[]).forEach((row) => reportById.set(row.id, row));
    ((reportsByStudentResponse.data ?? []) as ReportRow[]).forEach((row) =>
      reportById.set(row.id, row)
    );

    reportById.forEach((report) => {
      const student = getStudentFromRelation(report.students);
      const studentName = getStudentName(student);
      const reportTitle = report.title?.trim() || "Rapport";
      const statusLabel = report.sent_at ? "Publie" : "Brouillon";
      pushRankedItem(
        rankedItems,
        {
          id: report.id,
          kind: "report",
          title: reportTitle,
          subtitle: `${studentName} - ${statusLabel}`,
          href: `/app/coach/rapports/${report.id}`,
        },
        query,
        4,
        [reportTitle, studentName, statusLabel]
      );
    });

    const testById = new Map<string, AssignmentRow>();
    ((testsBySlugResponse.data ?? []) as AssignmentRow[]).forEach((row) => testById.set(row.id, row));
    ((testsByStudentResponse.data ?? []) as AssignmentRow[]).forEach((row) =>
      testById.set(row.id, row)
    );

    testById.forEach((assignment) => {
      const testTitle = TEST_TITLE_BY_SLUG[assignment.test_slug] ?? assignment.test_slug;
      const student = getStudentFromRelation(assignment.students);
      const studentName = getStudentName(student);
      const statusLabel = TEST_STATUS_LABELS[assignment.status];
      pushRankedItem(
        rankedItems,
        {
          id: assignment.id,
          kind: "test",
          title: testTitle,
          subtitle: `${studentName} - ${statusLabel}`,
          href: makeCoachTestHref(assignment.test_slug, assignment.id),
        },
        query,
        8,
        [testTitle, assignment.test_slug, studentName, statusLabel]
      );
    });
  }

  const dedupedByHref = new Map<string, RankedItem>();
  rankedItems.forEach((item) => {
    const existing = dedupedByHref.get(item.href);
    if (!existing || item.rank < existing.rank) {
      dedupedByHref.set(item.href, item);
    }
  });

  const sorted = Array.from(dedupedByHref.values())
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.title.localeCompare(b.title, "fr");
    })
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      href: item.href,
    }));

  const payload = {
    query,
    items: sorted,
  };

  const parsedPayload = GlobalSearchResponseSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Reponse de recherche invalide." }, { status: 500 });
  }

  return NextResponse.json(parsedPayload.data);
}
