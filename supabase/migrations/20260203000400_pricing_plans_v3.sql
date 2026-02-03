-- Pricing plans copy v3 (Free / Standard / Pro)

UPDATE public.pricing_plans
SET features = ARRAY[
  'Generation modulaire de rapports',
  'Coaching dynamique',
  '- Assistant IA',
  '- Catalogue complet de tests',
  '- Profil TPI connecte a l IA',
  '- IA connecte aux donnees (extraction Flightscope)',
  '- Gestion et participation dans une structure'
]
WHERE slug = 'free';

UPDATE public.pricing_plans
SET features = ARRAY[
  'Generation modulaire de rapports',
  'Coaching dynamique',
  'Assistant IA',
  'Catalogue complet de tests',
  '- Profil TPI connecte a l IA',
  '- IA connecte aux donnees (extraction Flightscope)',
  '- Gestion et participation dans une structure'
]
WHERE slug IN ('standard', 'standard-year');

UPDATE public.pricing_plans
SET features = ARRAY[
  'Generation modulaire de rapports',
  'Coaching dynamique',
  'Assistant IA',
  'Catalogue complet de tests',
  'Profil TPI connecte a l IA',
  'IA connecte aux donnees (extraction Flightscope)',
  'Gestion et participation dans une structure'
]
WHERE slug IN ('pro', 'pro-year');
