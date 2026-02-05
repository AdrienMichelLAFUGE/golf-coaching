-- Org groups + assignments

CREATE TABLE public.org_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_groups_pkey PRIMARY KEY (id),
  CONSTRAINT org_groups_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX org_groups_org_idx ON public.org_groups (org_id);

CREATE TRIGGER set_org_groups_updated_at
BEFORE UPDATE ON public.org_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.org_group_students (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  group_id uuid NOT NULL,
  student_id uuid NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_group_students_pkey PRIMARY KEY (id),
  CONSTRAINT org_group_students_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_group_students_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.org_groups(id) ON DELETE CASCADE,
  CONSTRAINT org_group_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT org_group_students_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT org_group_students_unique_student UNIQUE (student_id)
);

CREATE INDEX org_group_students_org_idx ON public.org_group_students (org_id);
CREATE INDEX org_group_students_group_idx ON public.org_group_students (group_id);

CREATE TABLE public.org_group_coaches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  group_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_group_coaches_pkey PRIMARY KEY (id),
  CONSTRAINT org_group_coaches_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_group_coaches_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.org_groups(id) ON DELETE CASCADE,
  CONSTRAINT org_group_coaches_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT org_group_coaches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT org_group_coaches_unique UNIQUE (group_id, coach_id)
);

CREATE INDEX org_group_coaches_org_idx ON public.org_group_coaches (org_id);
CREATE INDEX org_group_coaches_group_idx ON public.org_group_coaches (group_id);

ALTER TABLE public.org_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_group_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_group_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_groups_read ON public.org_groups
  FOR SELECT TO authenticated
  USING (public.is_current_workspace(org_id) AND public.is_org_member(org_id));

CREATE POLICY org_groups_write ON public.org_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_groups_update ON public.org_groups
  FOR UPDATE TO authenticated
  USING (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  )
  WITH CHECK (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_groups_delete ON public.org_groups
  FOR DELETE TO authenticated
  USING (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_group_students_read ON public.org_group_students
  FOR SELECT TO authenticated
  USING (public.is_current_workspace(org_id) AND public.is_org_member(org_id));

CREATE POLICY org_group_students_write ON public.org_group_students
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_group_students_update ON public.org_group_students
  FOR UPDATE TO authenticated
  USING (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  )
  WITH CHECK (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_group_students_delete ON public.org_group_students
  FOR DELETE TO authenticated
  USING (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_group_coaches_read ON public.org_group_coaches
  FOR SELECT TO authenticated
  USING (public.is_current_workspace(org_id) AND public.is_org_member(org_id));

CREATE POLICY org_group_coaches_write ON public.org_group_coaches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_group_coaches_update ON public.org_group_coaches
  FOR UPDATE TO authenticated
  USING (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  )
  WITH CHECK (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );

CREATE POLICY org_group_coaches_delete ON public.org_group_coaches
  FOR DELETE TO authenticated
  USING (
    public.is_current_workspace(org_id)
    AND (public.is_org_admin(org_id) OR public.is_org_premium_member(org_id))
  );
