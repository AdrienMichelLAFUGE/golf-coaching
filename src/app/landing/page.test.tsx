import { render } from "@testing-library/react";
import LandingPage from "./page";

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/components/hero/Hero", () => ({
  __esModule: true,
  default: () => <div data-testid="hero-placeholder">hero</div>,
}));

jest.mock("./landing-reveal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt?: string; src?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt ?? ""} src={props.src ?? ""} className={props.className} />
  ),
}));

type PricingRow = {
  id: string;
  slug: string;
  label: string;
  price_cents: number;
  currency: string;
  interval: "month" | "year";
  badge: string | null;
  cta_label: string | null;
  features: string[] | null;
  is_active: boolean;
  is_highlighted: boolean;
  sort_order: number;
};

describe("Landing page", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseAdminClient.mockReset();
  });

  it("renders key sections and JSON-LD blocks", async () => {
    const rows: PricingRow[] = [
      {
        id: "solo-month",
        slug: "solo",
        label: "Solo",
        price_cents: 2900,
        currency: "EUR",
        interval: "month",
        badge: null,
        cta_label: "Choisir Solo",
        features: ["Suivi eleves"],
        is_active: true,
        is_highlighted: false,
        sort_order: 1,
      },
      {
        id: "pro-month",
        slug: "pro",
        label: "Pro",
        price_cents: 5900,
        currency: "EUR",
        interval: "month",
        badge: "Populaire",
        cta_label: "Choisir Pro",
        features: ["Rapports IA"],
        is_active: true,
        is_highlighted: true,
        sort_order: 2,
      },
      {
        id: "structure-month",
        slug: "structure",
        label: "Structure",
        price_cents: 9900,
        currency: "EUR",
        interval: "month",
        badge: null,
        cta_label: "Choisir Structure",
        features: ["Mode multi-coachs"],
        is_active: true,
        is_highlighted: false,
        sort_order: 3,
      },
    ];

    const admin = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(async () => ({
              data: rows,
              error: null,
            })),
          })),
        })),
      })),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const ui = await LandingPage();
    const { container } = render(ui);

    expect(container.querySelector('[data-testid="hero-placeholder"]')).not.toBeNull();
    expect(container.querySelector("#pricing")).not.toBeNull();
    expect(container.querySelector("#faq")).not.toBeNull();

    const faqDetails = container.querySelectorAll("#faq details");
    expect(faqDetails).toHaveLength(8);

    const ldJsonScripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]')
    );
    expect(ldJsonScripts).toHaveLength(2);

    const parsedSchemas = ldJsonScripts.map((script) =>
      JSON.parse(script.textContent ?? "{}")
    ) as Array<Record<string, unknown>>;

    expect(parsedSchemas.some((schema) => schema["@type"] === "Organization")).toBe(true);
    expect(
      parsedSchemas.some((schema) => schema["@type"] === "SoftwareApplication")
    ).toBe(true);
  });
});
