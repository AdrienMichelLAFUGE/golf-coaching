export const MARKETING_TRACK_EVENT_NAME = "swingflow:marketing:event";

export type CtaClickPayload = {
  id: string;
  location: string;
  target?: string;
};

export type DemoSubmitPayload = {
  formId: string;
  type: "coach" | "structure";
  studentCountBucket: string;
};

export type MarketingTrackingEvent =
  | {
      name: "cta_click";
      timestamp: string;
      payload: CtaClickPayload;
    }
  | {
      name: "demo_submit";
      timestamp: string;
      payload: DemoSubmitPayload;
    };

declare global {
  interface Window {
    __SWINGFLOW_TRACK__?: (event: MarketingTrackingEvent) => void;
  }
}

const dispatchMarketingEvent = (event: MarketingTrackingEvent) => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<MarketingTrackingEvent>(MARKETING_TRACK_EVENT_NAME, {
      detail: event,
    })
  );

  const hook = window.__SWINGFLOW_TRACK__;
  if (typeof hook === "function") {
    hook(event);
  }
};

export const trackCtaClick = (payload: CtaClickPayload) => {
  dispatchMarketingEvent({
    name: "cta_click",
    timestamp: new Date().toISOString(),
    payload,
  });
};

export const trackDemoSubmit = (payload: DemoSubmitPayload) => {
  dispatchMarketingEvent({
    name: "demo_submit",
    timestamp: new Date().toISOString(),
    payload,
  });
};

