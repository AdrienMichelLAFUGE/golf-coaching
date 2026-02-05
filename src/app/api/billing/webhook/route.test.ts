import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/stripe", () => {
  const stripeMocks = {
    webhooks: { constructEvent: jest.fn() },
    customers: { update: jest.fn() },
    subscriptions: { retrieve: jest.fn() },
  };
  return { stripe: stripeMocks };
});

const stripeMocks = (
  jest.requireMock("@/lib/stripe") as {
    stripe: {
      webhooks: { constructEvent: jest.Mock };
      customers: { update: jest.Mock };
      subscriptions: { retrieve: jest.Mock };
    };
  }
).stripe;

const buildRequest = (body: string) =>
  ({
    headers: new Headers({ "stripe-signature": "sig" }),
    text: async () => body,
  }) as Request;

describe("POST /api/billing/webhook", () => {
  const serverMocks = jest.requireMock("@/lib/supabase/server") as {
    createSupabaseAdminClient: jest.Mock;
  };

  beforeEach(() => {
    serverMocks.createSupabaseAdminClient.mockReset();
    stripeMocks.webhooks.constructEvent.mockReset();
    stripeMocks.customers.update.mockReset();
    stripeMocks.subscriptions.retrieve.mockReset();
  });

  it("returns early when event already processed", async () => {
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      created: 1700000000,
      data: { object: {} },
    };
    stripeMocks.webhooks.constructEvent.mockReturnValue(event);

    const stripeEventsSelect = jest.fn(async () => ({
      data: { event_id: "evt_1" },
      error: null,
    }));
    const stripeEventsInsert = jest.fn();

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "stripe_events") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: stripeEventsSelect,
              }),
            }),
            insert: stripeEventsInsert,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest("{}"));

    expect(response.status).toBe(200);
    expect(stripeEventsInsert).not.toHaveBeenCalled();
  });

  it("syncs subscription updates to organization", async () => {
    const subscription = {
      id: "sub_1",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 3600,
      cancel_at_period_end: false,
      customer: "cus_123",
      items: {
        data: [{ price: { id: "price_month_test" } }],
      },
      metadata: {},
    };

    const event = {
      id: "evt_2",
      type: "customer.subscription.updated",
      created: 1700000000,
      data: { object: subscription },
    };
    stripeMocks.webhooks.constructEvent.mockReturnValue(event);

    const stripeEventsSelect = jest.fn(async () => ({ data: null, error: null }));
    const stripeEventsInsert = jest.fn(async () => ({ error: null }));
    const orgUpdateEq = jest.fn(async () => ({ error: null }));
    const orgUpdate = jest.fn(() => ({ eq: orgUpdateEq }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "stripe_events") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: stripeEventsSelect,
              }),
            }),
            insert: stripeEventsInsert,
            delete: () => ({ eq: jest.fn() }),
          };
        }
        if (table === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "org-1",
                    plan_tier: "free",
                    workspace_type: "personal",
                    owner_profile_id: "owner-1",
                    stripe_customer_id: "cus_123",
                    stripe_subscription_id: null,
                    stripe_price_id: null,
                    stripe_status: null,
                    stripe_current_period_end: null,
                    stripe_cancel_at_period_end: false,
                  },
                  error: null,
                }),
              }),
            }),
            update: orgUpdate,
          };
        }
        return {};
      }),
    };

    serverMocks.createSupabaseAdminClient.mockReturnValue(admin);

    const response = await POST(buildRequest("{}"));

    expect(response.status).toBe(200);
    expect(orgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: "sub_1",
        stripe_price_id: "price_month_test",
        stripe_status: "active",
        stripe_cancel_at_period_end: false,
        plan_tier: "pro",
      })
    );
    expect(orgUpdateEq).toHaveBeenCalledWith("id", "org-1");
  });
});
