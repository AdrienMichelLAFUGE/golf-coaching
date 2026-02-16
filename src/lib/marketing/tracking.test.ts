import {
  MARKETING_TRACK_EVENT_NAME,
  trackCtaClick,
  trackDemoSubmit,
} from "./tracking";

describe("marketing tracking", () => {
  afterEach(() => {
    delete window.__SWINGFLOW_TRACK__;
  });

  it("dispatches cta_click events to window", () => {
    const handler = jest.fn();
    window.addEventListener(MARKETING_TRACK_EVENT_NAME, handler as EventListener);

    trackCtaClick({
      id: "landing_solution_signup",
      location: "solution",
      target: "/login?mode=signup",
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.name).toBe("cta_click");
    expect(event.detail.payload).toEqual({
      id: "landing_solution_signup",
      location: "solution",
      target: "/login?mode=signup",
    });

    window.removeEventListener(MARKETING_TRACK_EVENT_NAME, handler as EventListener);
  });

  it("dispatches demo_submit events and calls optional hook", () => {
    const hook = jest.fn();
    window.__SWINGFLOW_TRACK__ = hook;

    trackDemoSubmit({
      formId: "landing_demo",
      type: "coach",
      studentCountBucket: "1-20",
    });

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "demo_submit",
        payload: {
          formId: "landing_demo",
          type: "coach",
          studentCountBucket: "1-20",
        },
      })
    );
  });

  it("does not crash when window is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(() => {
      trackCtaClick({
        id: "server_guard",
        location: "test",
      });
    }).not.toThrow();

    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor);
    }
  });
});

