type TestimonialProps = {
  quote: string;
  name: string;
  role: string;
  organization: string;
  result: string;
  tone?: "emerald" | "sky" | "amber";
  className?: string;
};

export default function Testimonial({
  quote,
  name,
  role,
  organization,
  result,
  tone = "emerald",
  className = "",
}: TestimonialProps) {
  const toneClass =
    tone === "sky"
      ? "from-sky-100/65 via-white/60 to-cyan-100/55 border-sky-300/35"
      : tone === "amber"
        ? "from-amber-100/65 via-white/60 to-orange-100/55 border-amber-300/35"
        : "from-emerald-100/65 via-white/60 to-lime-100/55 border-emerald-300/35";

  return (
    <figure
      className={`group relative overflow-hidden rounded-[28px] border bg-gradient-to-br p-6 shadow-[0_18px_38px_rgba(0,0,0,0.14)] transition hover:-translate-y-1 ${toneClass} ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-2 text-6xl font-semibold text-slate-900/10 transition group-hover:text-slate-900/15"
      >
        &quot;
      </span>
      <blockquote className="relative text-sm leading-relaxed text-slate-800">
        &quot;{quote}&quot;
      </blockquote>
      <figcaption className="relative mt-5 border-t border-slate-900/10 pt-4">
        <p className="text-sm font-semibold text-slate-900">{name}</p>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-600">
          {role} - {organization}
        </p>
        <p className="mt-2 text-xs font-medium text-slate-700">{result}</p>
      </figcaption>
    </figure>
  );
}
