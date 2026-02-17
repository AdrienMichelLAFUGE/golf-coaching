export type SectionId =
  | "hero"
  | "add-student"
  | "student-dashboard"
  | "create-report"
  | "editor-ai"
  | "media-data"
  | "publish-read"
  | "coach-dashboard"
  | "season-calendar"
  | "structure-mode"
  | "final-cta";

export type AiAxisId = "axis-1" | "axis-2";
export type LayoutPresetId = "quick" | "standard" | "detail";
export type DataTechnology = "smart2move" | "trackman" | "flightscope";
export type TpiTone = "red" | "orange" | "green";
export type UiTone = "emerald" | "sky" | "amber";
export type CalendarEventType = "tournoi" | "compétition" | "entraînement";

export type ScenarioState = {
  createdStudent: boolean;
  importedTpi: boolean;
  layoutSelected: boolean;
  reportFilled: boolean;
  propagated: boolean;
  mediaReady: boolean;
  published: boolean;
  selectedIaAxisId: AiAxisId | null;
  layoutPresetId: LayoutPresetId | null;
  mediaImageReady: boolean;
  mediaVideoReady: boolean;
  dataImported: boolean;
  dataTechnology: DataTechnology | null;
  dataPreprocessed: boolean;
  dataAnalyzed: boolean;
};

export type DemoStudent = {
  firstName: string;
  lastName: string;
  email: string;
};

export type TpiSummaryCard = {
  label: string;
  value: string;
  hint: string;
  tone: UiTone;
};

export type TpiTest = {
  id: string;
  name: string;
  tone: TpiTone;
  summary: string;
  details: string;
};

export type TpiProfile = {
  sourceLabel: string;
  importedAt: string;
  summaryCards: TpiSummaryCard[];
  tests: TpiTest[];
  counts: {
    total: number;
    red: number;
    orange: number;
    green: number;
  };
  detailPanel: {
    title: string;
    description: string;
  };
};

export type DemoReport = {
  club: string;
  constat: string;
  axeTravail: string;
};

export type LayoutPreset = {
  id: LayoutPresetId;
  title: string;
  hint: string;
  info: string;
  sections: string[];
};

export type AiSuggestion = {
  id: AiAxisId;
  title: string;
  bullets: string[];
  readyText: string;
  sectionPayload: Array<{
    section: string;
    value: string;
  }>;
};

export type FzPoint = {
  x: number;
  y: number;
};

export type Smart2MoveFixture = {
  points: FzPoint[];
  impactIndex: number;
};

export type DemoMediaAsset = {
  src: string;
  alt: string;
  label: string;
};

export type DemoMediaFixture = {
  imageGallery: DemoMediaAsset[];
  videoScene: {
    thumb: DemoMediaAsset;
    mobilePreview: DemoMediaAsset;
  };
  dataScene: {
    importVisual: DemoMediaAsset;
  };
};

export type CoachDashboardFixture = {
  kpis: Array<{
    label: string;
    value: string;
    hint: string;
  }>;
  activityBars: Array<{
    day: string;
    value: number;
  }>;
  students: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
  }>;
  reports: Array<{
    id: string;
    title: string;
    studentName: string;
    dateLabel: string;
  }>;
  reminders: Array<{
    title: string;
    description: string;
    cta: string;
    tone: "primary" | "secondary";
  }>;
};

export type SeasonCalendarEvent = {
  id: string;
  day: number;
  type: CalendarEventType;
  title: string;
  time: string;
  studentName: string;
  participants: string[];
  resultPlace?: 1 | 2 | 3;
};

export type SeasonCalendarFixture = {
  year: number;
  month: number;
  referenceDay: number;
  monthLabel: string;
  weekdayLabels: string[];
  studentEvents: SeasonCalendarEvent[];
  coachEvents: SeasonCalendarEvent[];
};

export const DEMO_STUDENT: DemoStudent = {
  firstName: "Léo",
  lastName: "Martin",
  email: "leo.martin@exemple.com",
};

export const DEMO_TPI_PROFILE: TpiProfile = {
  sourceLabel: "Academy Lab Performance",
  importedAt: "14 février 2026",
  summaryCards: [
    {
      label: "Vitesse / Puissance",
      value: "76%",
      hint: "Bonne base athlétique",
      tone: "emerald",
    },
    {
      label: "Mobilité hanche/rachis",
      value: "64%",
      hint: "Travail prioritaire",
      tone: "sky",
    },
    {
      label: "Séquence cinématique",
      value: "71%",
      hint: "Stable sous contrôle",
      tone: "amber",
    },
  ],
  tests: [
    {
      id: "pelvic-rotation",
      name: "Pelvic Rotation",
      tone: "red",
      summary: "Amplitude insuffisante côté lead.",
      details:
        "Limitation de rotation du bassin à gauche. Impact direct sur la transition et le plan de swing.",
    },
    {
      id: "thoracic-rotation",
      name: "Torso Rotation",
      tone: "orange",
      summary: "Compensation en fin de mouvement.",
      details:
        "Le haut du corps finit la rotation mais avec perte de stabilité. À surveiller en fatigue.",
    },
    {
      id: "single-leg-balance",
      name: "Single Leg Balance",
      tone: "green",
      summary: "Contrôle moteur propre.",
      details: "Bonne stabilité monopodale, compatible avec le plan de travail technique.",
    },
    {
      id: "deep-squat",
      name: "Deep Squat",
      tone: "orange",
      summary: "Manque de profondeur active.",
      details: "Amplitude correcte mais déficit de contrôle sur la descente complète.",
    },
    {
      id: "bridge-with-leg-extension",
      name: "Bridge with Leg Extension",
      tone: "green",
      summary: "Chaîne postérieure efficace.",
      details: "Aucune compensation majeure observée sur l’extension unilatérale.",
    },
    {
      id: "lat-stretch",
      name: "Lat Stretch",
      tone: "red",
      summary: "Restriction marquée côté trail.",
      details: "La limitation du grand dorsal gêne la montée et favorise un plan extérieur-intérieur.",
    },
    {
      id: "ankle-mobility",
      name: "Ankle Mobility",
      tone: "orange",
      summary: "Cheville lead peu mobile en flexion.",
      details:
        "Le déficit de dorsiflexion limite la stabilité dynamique et réduit la qualité d'appui dans la transition.",
    },
    {
      id: "wrist-extension",
      name: "Wrist Extension",
      tone: "green",
      summary: "Amplitude fonctionnelle disponible.",
      details:
        "L'extension du poignet est exploitable, sans compensation notable sur la phase de release.",
    },
    {
      id: "core-endurance",
      name: "Core Endurance",
      tone: "orange",
      summary: "Endurance du gainage à renforcer.",
      details:
        "Le maintien du tronc se dégrade sur séries longues, impactant la répétabilité sous fatigue.",
    },
    {
      id: "shoulder-separation",
      name: "Shoulder Separation",
      tone: "red",
      summary: "Séparation hanche/épaules insuffisante.",
      details:
        "La dissociation reste limitée au sommet du backswing, ce qui pénalise la production de vitesse.",
    },
    {
      id: "hip-hinge",
      name: "Hip Hinge",
      tone: "green",
      summary: "Mécanique de charnière maîtrisée.",
      details:
        "La posture de charnière est stable et transférable sur les exercices de pattern moteur.",
    },
  ],
  counts: {
    total: 12,
    red: 3,
    orange: 4,
    green: 4,
  },
  detailPanel: {
    title: "Priorité de cycle",
    description:
      "Ouvrir la mobilité hanche/rachis et sécuriser la rotation du bassin avant d’augmenter l’intensité technique.",
  },
};

export const DEMO_REPORT: DemoReport = {
  club: "Fer 7",
  constat: "Balles coupées",
  axeTravail: "Travailler mon plan de swing pour être moins extérieur-intérieur.",
};

export const DEMO_LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "quick",
    title: "Rapide",
    hint: "3 sections essentielles",
    info: "Pour débriefer vite après séance.",
    sections: ["Résumé de séance", "Diagnostic swing", "Plan 7 jours"],
  },
  {
    id: "standard",
    title: "Standard",
    hint: "Structure équilibrée",
    info: "Le format recommandé pour un suivi premium.",
    sections: [
      "Résumé de séance",
      "Diagnostic swing",
      "Exercices recommandés",
      "Focus mental",
      "Plan 7 jours",
    ],
  },
  {
    id: "detail",
    title: "Détaillé",
    hint: "Version avancée",
    info: "Analyse complète avec données et routine.",
    sections: [
      "Résumé de séance",
      "Points forts",
      "Axes d’amélioration",
      "Diagnostic swing",
      "Données techniques",
      "Exercices recommandés",
      "Plan 7 jours",
      "Routine parcours",
    ],
  },
];

export const DEMO_IA_SUGGESTIONS: AiSuggestion[] = [
  {
    id: "axis-1",
    title: "Axe 1 — Neutraliser le plan",
    bullets: [
      "Réduire la traversée extérieure en transition.",
      "Stabiliser la face neutre sur swings à 75%.",
      "Valider avec une dispersion latérale plus serrée.",
    ],
    readyText:
      "Objectif de semaine : neutraliser la transition sur trois micro-séances de 20 minutes, avec des repères visuels constants et une routine de validation simple avant chaque série.",
    sectionPayload: [
      {
        section: "Diagnostic swing",
        value:
          "Le pattern actuel montre une transition extérieure-intérieure trop marquée dès le démarrage du downswing. Cette dérive décale la direction initiale à droite et oblige une compensation tardive de la face. La priorité est de réorganiser l'entrée de club dans la zone d'impact pour retrouver un chemin plus neutre et plus reproductible.",
      },
      {
        section: "Exercices recommandés",
        value:
          "Mettre en place un bloc technique en trois temps : 1) drill baguette extérieure avec repère d'entrée, 2) swings à 60-70 % avec tempo 3:1 et pause au sommet, 3) séries de 6 balles avec feedback immédiat sur la ligne de départ. L'objectif est d'ancrer la sensation de descente plus interne sans perte de rythme ni de stabilité de posture.",
      },
      {
        section: "Plan 7 jours",
        value:
          "Jour 1-2 : deux blocs courts focalisés sur la transition et le chemin. Jour 3 : repos actif + mobilité hanche/rachis. Jour 4-5 : reprise technique avec cible intermédiaire et contrainte de dispersion. Jour 6 : session validation sur trajectoires. Jour 7 : débrief écrit avec trois points acquis, un point à corriger, et objectif de séance suivante.",
      },
    ],
  },
  {
    id: "axis-2",
    title: "Axe 2 — Contrôle de face",
    bullets: [
      "Régulariser grip + orientation face à l’adresse.",
      "Stabiliser l’impact sur la ligne de jeu.",
      "Créer une routine pré-coup reproductible.",
    ],
    readyText:
      "Objectif de semaine : fiabiliser la face de club à l'impact pour réduire les écarts à droite sous pression, en combinant routine d'adresse, contrôle de contact et feedback systématique.",
    sectionPayload: [
      {
        section: "Diagnostic swing",
        value:
          "La face de club présente une variabilité trop élevée sur les swings engagés, surtout quand le rythme monte. On observe des impacts ouverts qui créent des départs de balle incohérents, malgré un chemin parfois acceptable. L'enjeu principal est de stabiliser les paramètres d'adresse et d'impact pour gagner en constance directionnelle.",
      },
      {
        section: "Exercices recommandés",
        value:
          "Structurer la séance autour d'une routine grip-check systématique, suivie de séries de 6 balles avec cible de départ stricte. Ajouter un bloc contact/face avec feedback visuel (spray face ou impact tape) pour corréler sensation et résultat réel. Terminer par un mini-circuit pré-coup : respiration, alignement, intention de trajectoire, exécution.",
      },
      {
        section: "Plan 7 jours",
        value:
          "Deux sessions dédiées à la routine d'adresse, deux sessions orientées contact/face, puis une session parcours avec contrainte de mise en jeu. Entre les séances : 5 minutes de répétition à blanc sur la routine complète. En fin de semaine, bilan chiffré sur la qualité des départs de balle et la stabilité de dispersion.",
      },
    ],
  },
];

export const DEMO_MEDIA_FIXTURE: DemoMediaFixture = {
  imageGallery: [
    {
      src: "/demo/placeholders/demo-image-1.svg",
      alt: "Placeholder image demo 1",
      label: "Image d'illustration - demo 1",
    },
    {
      src: "/demo/placeholders/demo-image-2.svg",
      alt: "Placeholder image demo 2",
      label: "Image d'illustration - demo 2",
    },
  ],
  videoScene: {
    thumb: {
      src: "/demo/placeholders/demo-video.svg",
      alt: "Placeholder video demo",
      label: "Clip de demonstration",
    },
    mobilePreview: {
      src: "/demo/placeholders/demo-video.svg",
      alt: "Placeholder mobile preview demo",
      label: "Apercu mobile de la video",
    },
  },
  dataScene: {
    importVisual: {
      src: "/demo/placeholders/demo-smart2move-tech.svg",
      alt: "Placeholder Smart2Move technologie",
      label: "Sélection de technologie Smart2Move",
    },
  },
};

export const DEMO_SMART2MOVE: Smart2MoveFixture = {
  points: [
    { x: 11, y: 76 },
    { x: 18, y: 67 },
    { x: 24, y: 61 },
    { x: 32, y: 55 },
    { x: 40, y: 49 },
    { x: 49, y: 46 },
    { x: 58, y: 43 },
    { x: 66, y: 41 },
    { x: 74, y: 43 },
    { x: 82, y: 48 },
    { x: 89, y: 54 },
  ],
  impactIndex: 7,
};

export const DEMO_COACH_DASHBOARD: CoachDashboardFixture = {
  kpis: [
    { label: "Élèves", value: "24", hint: "Mise à jour automatique" },
    { label: "Rapports", value: "18", hint: "Semaine en cours" },
    { label: "Brouillons", value: "6", hint: "À publier" },
    { label: "Tests actifs", value: "12", hint: "Assignés ou en cours" },
  ],
  activityBars: [
    { day: "L", value: 3 },
    { day: "M", value: 2 },
    { day: "M", value: 4 },
    { day: "J", value: 1 },
    { day: "V", value: 5 },
    { day: "S", value: 2 },
    { day: "D", value: 4 },
  ],
  students: [
    {
      id: "st-1",
      name: "Léo Martin",
      email: "leo.martin@exemple.com",
      status: "Actif",
    },
    {
      id: "st-2",
      name: "Camille Renoir",
      email: "camille.renoir@exemple.com",
      status: "Invitation en attente",
    },
    {
      id: "st-3",
      name: "Nathan Soler",
      email: "nathan.soler@exemple.com",
      status: "Actif",
    },
  ],
  reports: [
    {
      id: "rp-1",
      title: "F7 — Stabiliser le plan en transition",
      studentName: "Léo Martin",
      dateLabel: "14 fév. 2026",
    },
    {
      id: "rp-2",
      title: "Petit jeu — contrôle trajectoire basse",
      studentName: "Camille Renoir",
      dateLabel: "12 fév. 2026",
    },
  ],
  reminders: [
    {
      title: "Relancer 2 invitations élève",
      description: "Deux invitations n’ont pas encore été ouvertes.",
      cta: "Voir les élèves",
      tone: "primary",
    },
    {
      title: "3 brouillons à publier",
      description: "Finaliser et publier pour garder la continuité de suivi.",
      cta: "Ouvrir les brouillons",
      tone: "secondary",
    },
  ],
};

export const DEMO_SEASON_CALENDAR: SeasonCalendarFixture = {
  year: 2026,
  month: 3,
  referenceDay: 22,
  monthLabel: "Mars 2026",
  weekdayLabels: ["L", "M", "M", "J", "V", "S", "D"],
  studentEvents: [
    {
      id: "ev-s-1",
      day: 2,
      type: "entraînement",
      title: "Bloc technique transition",
      time: "09:30",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
    },
    {
      id: "ev-s-1b",
      day: 7,
      type: "entraînement",
      title: "Routine pré-tournoi",
      time: "17:30",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
    },
    {
      id: "ev-s-2",
      day: 8,
      type: "tournoi",
      title: "Grand Prix régional",
      time: "08:15",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
      resultPlace: 2,
    },
    {
      id: "ev-s-3",
      day: 14,
      type: "compétition",
      title: "Qualification interclubs",
      time: "10:00",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
      resultPlace: 3,
    },
    {
      id: "ev-s-3b",
      day: 15,
      type: "entraînement",
      title: "Récupération active",
      time: "18:00",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
    },
    {
      id: "ev-s-4",
      day: 21,
      type: "entraînement",
      title: "Validation routine parcours",
      time: "15:30",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
    },
    {
      id: "ev-s-5",
      day: 22,
      type: "tournoi",
      title: "Open de Printemps",
      time: "08:45",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
    },
    {
      id: "ev-s-6",
      day: 28,
      type: "compétition",
      title: "Interclub J2",
      time: "09:10",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
    },
    {
      id: "ev-s-7",
      day: 29,
      type: "entraînement",
      title: "Débrief week-end",
      time: "16:20",
      studentName: "Léo Martin",
      participants: ["Léo Martin"],
    },
  ],
  coachEvents: [
    {
      id: "ev-c-1",
      day: 6,
      type: "entraînement",
      title: "Atelier technique collectif",
      time: "08:30",
      studentName: "Camille Renoir",
      participants: ["Camille Renoir", "Léo Martin", "Nathan Soler"],
    },
    {
      id: "ev-c-1b",
      day: 7,
      type: "entraînement",
      title: "Prépa tournoi week-end",
      time: "14:00",
      studentName: "Nathan Soler",
      participants: ["Nathan Soler", "Léo Martin"],
    },
    {
      id: "ev-c-2",
      day: 8,
      type: "tournoi",
      title: "Grand Prix régional",
      time: "08:15",
      studentName: "Léo Martin",
      participants: ["Léo Martin", "Nathan Soler"],
    },
    {
      id: "ev-c-3",
      day: 14,
      type: "compétition",
      title: "Qualification interclubs",
      time: "10:00",
      studentName: "Camille Renoir",
      participants: ["Camille Renoir", "Léo Martin"],
    },
    {
      id: "ev-c-3b",
      day: 15,
      type: "tournoi",
      title: "Classic de Ligue",
      time: "08:40",
      studentName: "Camille Renoir",
      participants: ["Camille Renoir", "Léo Martin", "Nathan Soler"],
    },
    {
      id: "ev-c-4",
      day: 18,
      type: "entraînement",
      title: "Contrôle face/impact",
      time: "11:00",
      studentName: "Nathan Soler",
      participants: ["Nathan Soler", "Léo Martin"],
    },
    {
      id: "ev-c-5",
      day: 22,
      type: "tournoi",
      title: "Tournoi club élite",
      time: "09:00",
      studentName: "Nathan Soler",
      participants: ["Nathan Soler", "Camille Renoir"],
    },
    {
      id: "ev-c-6",
      day: 28,
      type: "compétition",
      title: "Interclubs équipe A",
      time: "09:20",
      studentName: "Léo Martin",
      participants: ["Léo Martin", "Camille Renoir", "Nathan Soler"],
    },
    {
      id: "ev-c-7",
      day: 29,
      type: "entraînement",
      title: "Debrief collectif",
      time: "17:00",
      studentName: "Nathan Soler",
      participants: ["Nathan Soler", "Léo Martin", "Camille Renoir"],
    },
  ],
};

export const SECTION_ORDER: SectionId[] = [
  "hero",
  "add-student",
  "student-dashboard",
  "create-report",
  "editor-ai",
  "media-data",
  "publish-read",
  "coach-dashboard",
  "season-calendar",
  "structure-mode",
  "final-cta",
];

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Hero",
  "add-student": "Ajouter un élève",
  "student-dashboard": "Dashboard élève",
  "create-report": "Créer rapport",
  "editor-ai": "Éditeur + IA",
  "media-data": "Média + Data",
  "publish-read": "Publier",
  "coach-dashboard": "Dashboard coach",
  "season-calendar": "Suivi saison",
  "structure-mode": "Mode structure",
  "final-cta": "CTA final",
};

export const SECTION_SLIDE_COUNT: Record<SectionId, number> = {
  hero: 1,
  "add-student": 3,
  "student-dashboard": 2,
  "create-report": 3,
  "editor-ai": 4,
  "media-data": 3,
  "publish-read": 2,
  "coach-dashboard": 2,
  "season-calendar": 2,
  "structure-mode": 1,
  "final-cta": 1,
};

export const INITIAL_SCENARIO_STATE: ScenarioState = {
  createdStudent: false,
  importedTpi: false,
  layoutSelected: false,
  reportFilled: false,
  propagated: false,
  mediaReady: false,
  published: false,
  selectedIaAxisId: null,
  layoutPresetId: null,
  mediaImageReady: false,
  mediaVideoReady: false,
  dataImported: false,
  dataTechnology: null,
  dataPreprocessed: false,
  dataAnalyzed: false,
};
