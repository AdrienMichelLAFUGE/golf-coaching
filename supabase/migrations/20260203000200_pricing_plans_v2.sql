-- Pricing plans for Free / Standard / Pro / Entreprise
INSERT INTO public.pricing_plans (
  slug,
  label,
  price_cents,
  currency,
  "interval",
  badge,
  cta_label,
  features,
  is_active,
  is_highlighted,
  sort_order
) VALUES
  (
    'free',
    'Free',
    0,
    'EUR',
    'month',
    NULL,
    'Commencer',
    ARRAY[
      'Generation de rapports (sans IA)',
      '2 tests Pelz (Putting, Approches)',
      '- Assistant IA (auto-layout, auto-completion, relecture, resume, planif)',
      '- Profil TPI',
      '- Extraction Trackman / FlightScope / S2M',
      '- Creation d organisation'
    ],
    true,
    false,
    1
  ),
  (
    'standard',
    'Standard',
    0,
    'EUR',
    'month',
    NULL,
    'Choisir Standard',
    ARRAY[
      'Assistant IA (auto-layout, auto-completion, relecture, resume, planif)',
      'Extraction datas (Trackman, FlightScope, S2M)',
      'Profil TPI',
      'Tests catalogue complet',
      'Creation d organisation + edition en org',
      'Quotas 30 rapports / 10 TPI / 30 extractions (30 jours)'
    ],
    true,
    false,
    2
  ),
  (
    'standard-year',
    'Standard',
    0,
    'EUR',
    'year',
    'Annuel',
    'Choisir Standard',
    ARRAY[
      'Assistant IA (auto-layout, auto-completion, relecture, resume, planif)',
      'Extraction datas (Trackman, FlightScope, S2M)',
      'Profil TPI',
      'Tests catalogue complet',
      'Creation d organisation + edition en org',
      'Quotas 30 rapports / 10 TPI / 30 extractions (30 jours)'
    ],
    true,
    false,
    2
  ),
  (
    'pro',
    'Pro',
    0,
    'EUR',
    'month',
    'Populaire',
    'Choisir Pro',
    ARRAY[
      'Tout Standard',
      'Quotas 100 rapports / 30 TPI / 100 extractions (30 jours)',
      'Creation de nouveaux tests (validation admin)',
      'Acces complet IA'
    ],
    true,
    true,
    3
  ),
  (
    'pro-year',
    'Pro',
    0,
    'EUR',
    'year',
    'Populaire',
    'Choisir Pro',
    ARRAY[
      'Tout Standard',
      'Quotas 100 rapports / 30 TPI / 100 extractions (30 jours)',
      'Creation de nouveaux tests (validation admin)',
      'Acces complet IA'
    ],
    true,
    true,
    3
  ),
  (
    'enterprise',
    'Entreprise',
    0,
    'EUR',
    'year',
    'Sur mesure',
    'Contact',
    ARRAY[
      'Tout Pro',
      'Illimite (rapports, TPI, extractions)',
      '2+ sieges coach',
      'Facturation annuelle, sur devis'
    ],
    true,
    false,
    4
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  "interval" = EXCLUDED."interval",
  badge = EXCLUDED.badge,
  cta_label = EXCLUDED.cta_label,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  is_highlighted = EXCLUDED.is_highlighted,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
