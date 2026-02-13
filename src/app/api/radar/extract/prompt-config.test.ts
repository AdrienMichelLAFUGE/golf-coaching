import { resolveRadarPromptConfig } from "./route";

describe("resolveRadarPromptConfig", () => {
  it("uses graph-specific Smart2Move prompts when source is smart2move + fx", () => {
    const config = resolveRadarPromptConfig("smart2move", "fx");

    expect(config.mode).toBe("smart2move_graph");
    expect(config.extractSystemSection).toBe("radar_extract_smart2move_fx_system");
    expect(config.verifySystemSection).toBe("radar_extract_smart2move_verify_system");
    expect(config.sourceLabel).toBe("Smart2Move");
    expect(config.smart2MoveGraphType).toBe("fx");
  });

  it("uses graph-specific Smart2Move prompts when source is smart2move + fz", () => {
    const config = resolveRadarPromptConfig("smart2move", "fz");

    expect(config.mode).toBe("smart2move_graph");
    expect(config.extractSystemSection).toBe("radar_extract_smart2move_fz_system");
    expect(config.verifySystemSection).toBe("radar_extract_smart2move_verify_system");
    expect(config.sourceLabel).toBe("Smart2Move");
    expect(config.smart2MoveGraphType).toBe("fz");
  });

  it("uses dedicated Trackman prompts when source is trackman", () => {
    const config = resolveRadarPromptConfig("trackman");

    expect(config.mode).toBe("tabular");
    expect(config.extractSystemSection).toBe("radar_extract_trackman_system");
    expect(config.verifySystemSection).toBe("radar_extract_trackman_verify_system");
    expect(config.sourceLabel).toBe("Trackman");
  });

  it("falls back to Flightscope prompts for unknown sources", () => {
    const config = resolveRadarPromptConfig("unknown-tech");

    expect(config.mode).toBe("tabular");
    expect(config.extractSystemSection).toBe("radar_extract_system");
    expect(config.verifySystemSection).toBe("radar_extract_verify_system");
    expect(config.sourceLabel).toBe("Flightscope");
  });
});
