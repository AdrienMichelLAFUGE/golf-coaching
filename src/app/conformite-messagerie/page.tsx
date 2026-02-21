import Link from "next/link";
import {
  MESSAGE_CGU_ADDITIONAL_TEMPLATE,
  MESSAGE_CHARTER_TEMPLATE,
  MESSAGE_PRIVACY_NOTICE_TEMPLATE,
} from "@/lib/messages/compliance-copy";

const ORG_NAME = "SwingFlow";
const SUPPORT_EMAIL = "contact@swingflow.fr";

const resolveReturnTo = (value?: string | string[] | null) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/landing";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/landing";
  if (raw.includes("\\")) return "/landing";
  return raw;
};

const replaceCompliancePlaceholders = (value: string) =>
  value
    .replaceAll(MESSAGE_CHARTER_TEMPLATE.orgNamePlaceholder, ORG_NAME)
    .replaceAll(MESSAGE_CHARTER_TEMPLATE.supportEmailPlaceholder, SUPPORT_EMAIL);

type ComplianceBlock =
  | { type: "paragraph"; content: string }
  | { type: "list"; items: string[] };

const parseComplianceText = (value: string): ComplianceBlock[] => {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: ComplianceBlock[] = [];
  let currentItems: string[] = [];

  const flushList = () => {
    if (currentItems.length === 0) return;
    blocks.push({ type: "list", items: currentItems });
    currentItems = [];
  };

  for (const line of lines) {
    if (line.startsWith("- ")) {
      currentItems.push(line.slice(2).trim());
      continue;
    }

    flushList();
    blocks.push({ type: "paragraph", content: line });
  }

  flushList();
  return blocks;
};

function ComplianceSection({
  title,
  accentClassName,
  text,
}: {
  title: string;
  accentClassName: string;
  text: string;
}) {
  const blocks = parseComplianceText(text);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className={`h-1 w-full ${accentClassName}`} />
      <div className="space-y-4 px-5 py-5">
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        <div className="space-y-3 text-sm leading-relaxed text-[var(--muted)]">
          {blocks.map((block, index) =>
            block.type === "paragraph" ? (
              <p key={`${title}-p-${index}`}>{block.content}</p>
            ) : (
              <ul
                key={`${title}-l-${index}`}
                className="list-disc space-y-1.5 pl-5 marker:text-[var(--text)]"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${title}-li-${index}-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </section>
  );
}

export default async function ConformiteMessageriePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const returnTo = resolveReturnTo(resolvedSearchParams?.returnTo ?? null);
  const privacyNotice = replaceCompliancePlaceholders(MESSAGE_PRIVACY_NOTICE_TEMPLATE);
  const charter = replaceCompliancePlaceholders(MESSAGE_CHARTER_TEMPLATE.body);
  const cguAdditional = replaceCompliancePlaceholders(MESSAGE_CGU_ADDITIONAL_TEMPLATE);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-14 text-[var(--text)]">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/[0.04] to-transparent px-6 py-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">SwingFlow</p>
        <h1 className="mt-2 text-3xl font-semibold">Conformite messagerie</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Textes de reference juridiques et produit pour la messagerie interne.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[var(--text)]">
            Organisation: {ORG_NAME}
          </span>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[var(--text)] transition hover:bg-white/20"
          >
            Contact: {SUPPORT_EMAIL}
          </a>
        </div>
      </header>

      <article className="space-y-4">
        <ComplianceSection
          title="Notice RGPD messagerie"
          accentClassName="bg-gradient-to-r from-emerald-300/90 to-emerald-100/80"
          text={privacyNotice}
        />
        <ComplianceSection
          title="Charte d usage"
          accentClassName="bg-gradient-to-r from-sky-300/90 to-cyan-100/80"
          text={charter}
        />
        <ComplianceSection
          title="Addendum CGU"
          accentClassName="bg-gradient-to-r from-amber-300/90 to-yellow-100/80"
          text={cguAdditional}
        />
      </article>

      <div>
        <Link
          href={returnTo}
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)] transition hover:bg-white/10 hover:text-[var(--text)]"
        >
          Retour
        </Link>
      </div>
    </main>
  );
}
