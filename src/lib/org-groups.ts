export const ORG_GROUP_COLOR_TOKENS = [
  "mint",
  "sky",
  "peach",
  "lavender",
  "lemon",
  "rose",
] as const;

export type OrgGroupColorToken = (typeof ORG_GROUP_COLOR_TOKENS)[number];

export const ORG_GROUP_COLOR_LABELS: Record<OrgGroupColorToken, string> = {
  mint: "Menthe",
  sky: "Azur",
  peach: "Peche",
  lavender: "Lavande",
  lemon: "Citron",
  rose: "Rose",
};

export const ORG_GROUP_DEFAULT_COLOR: OrgGroupColorToken = "mint";

export const ORG_GROUP_COLOR_THEME: Record<
  OrgGroupColorToken,
  {
    cardClass: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  mint: {
    cardClass:
      "border-emerald-200/60 bg-gradient-to-br from-emerald-100/30 via-transparent to-emerald-200/20 dark:border-emerald-400/25 dark:from-emerald-400/12 dark:to-emerald-500/5",
    badgeClass:
      "border-emerald-300/70 bg-emerald-100 text-emerald-900 dark:border-emerald-300/40 dark:bg-emerald-400/10 dark:text-emerald-100",
    dotClass: "bg-emerald-300 dark:bg-emerald-300",
  },
  sky: {
    cardClass:
      "border-sky-200/70 bg-gradient-to-br from-sky-100/35 via-transparent to-blue-200/20 dark:border-sky-400/25 dark:from-sky-400/12 dark:to-blue-500/6",
    badgeClass:
      "border-sky-300/70 bg-sky-100 text-sky-900 dark:border-sky-300/40 dark:bg-sky-400/10 dark:text-sky-100",
    dotClass: "bg-sky-300 dark:bg-sky-300",
  },
  peach: {
    cardClass:
      "border-orange-200/70 bg-gradient-to-br from-orange-100/40 via-transparent to-amber-200/20 dark:border-orange-400/25 dark:from-orange-400/12 dark:to-amber-400/8",
    badgeClass:
      "border-orange-300/70 bg-orange-100 text-orange-900 dark:border-orange-300/40 dark:bg-orange-400/10 dark:text-orange-100",
    dotClass: "bg-orange-300 dark:bg-orange-300",
  },
  lavender: {
    cardClass:
      "border-violet-200/70 bg-gradient-to-br from-violet-100/40 via-transparent to-fuchsia-200/15 dark:border-violet-400/25 dark:from-violet-400/12 dark:to-fuchsia-400/6",
    badgeClass:
      "border-violet-300/70 bg-violet-100 text-violet-900 dark:border-violet-300/40 dark:bg-violet-400/10 dark:text-violet-100",
    dotClass: "bg-violet-300 dark:bg-violet-300",
  },
  lemon: {
    cardClass:
      "border-yellow-200/70 bg-gradient-to-br from-yellow-100/45 via-transparent to-amber-200/20 dark:border-yellow-300/25 dark:from-yellow-400/12 dark:to-amber-400/8",
    badgeClass:
      "border-yellow-300/70 bg-yellow-100 text-yellow-900 dark:border-yellow-300/40 dark:bg-yellow-400/10 dark:text-yellow-100",
    dotClass: "bg-yellow-300 dark:bg-yellow-300",
  },
  rose: {
    cardClass:
      "border-rose-200/70 bg-gradient-to-br from-rose-100/40 via-transparent to-pink-200/20 dark:border-rose-400/25 dark:from-rose-400/12 dark:to-pink-400/6",
    badgeClass:
      "border-rose-300/70 bg-rose-100 text-rose-900 dark:border-rose-300/40 dark:bg-rose-400/10 dark:text-rose-100",
    dotClass: "bg-rose-300 dark:bg-rose-300",
  },
};

export const getOrgGroupColorTheme = (
  token?: OrgGroupColorToken | string | null
) => {
  if (!token) return ORG_GROUP_COLOR_THEME[ORG_GROUP_DEFAULT_COLOR];
  if (token in ORG_GROUP_COLOR_THEME) {
    return ORG_GROUP_COLOR_THEME[token as OrgGroupColorToken];
  }
  return ORG_GROUP_COLOR_THEME[ORG_GROUP_DEFAULT_COLOR];
};

