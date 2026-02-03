-- Update pricing plan features copy for clear upsell messaging

UPDATE public.pricing_plans
SET features = ARRAY[
  'Rapports complets (sans IA)',
  '2 tests Pelz inclus (Putting, Approches)',
  'Acces orga en lecture seule',
  '- Assistant IA (auto-layout, auto-completion, relecture, resume, planif)',
  '- Profil TPI',
  '- Extraction Trackman / FlightScope / S2M',
  '- Creation d organisation'
]
WHERE slug = 'free';

UPDATE public.pricing_plans
SET features = ARRAY[
  'Assistant IA sur tout le rapport',
  'Profil TPI + extraction Trackman / FlightScope / S2M',
  'Catalogue complet de tests',
  'Creation + edition d organisation',
  'Quotas : 30 rapports / 10 TPI / 30 extractions (30 j glissants)'
]
WHERE slug IN ('standard', 'standard-year');

UPDATE public.pricing_plans
SET features = ARRAY[
  'Tout Standard',
  'Acces IA complet',
  'Quotas eleves : 100 rapports / 30 TPI / 100 extractions (30 j glissants)',
  'Creation de nouveaux tests (validation admin)'
]
WHERE slug IN ('pro', 'pro-year');

UPDATE public.pricing_plans
SET features = ARRAY[
  'Tout Pro',
  'Illimite : rapports / TPI / extractions',
  '2+ sieges coach',
  'Facturation annuelle, sur devis'
]
WHERE slug = 'enterprise';
