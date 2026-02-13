import {
  SMART2MOVE_GRAPH_OPTIONS,
  isSmart2MoveGraphType,
  isSmart2MoveGraphCompatibleWithPlate,
  getSmart2MoveGraphMeta,
} from "./smart2move-graph-types";

describe("smart2move graph types", () => {
  it("accepts every supported graph type", () => {
    const ids = SMART2MOVE_GRAPH_OPTIONS.map((item) => item.id);
    ids.forEach((id) => {
      expect(isSmart2MoveGraphType(id)).toBe(true);
    });
  });

  it("rejects unknown graph types", () => {
    expect(isSmart2MoveGraphType("unknown")).toBe(false);
  });

  it("resolves metadata and prompt section", () => {
    const fxMeta = getSmart2MoveGraphMeta("fx");
    expect(fxMeta.label).toBe("Force antero-posterieure (Fx)");
    expect(fxMeta.extractPromptSection).toBe("radar_extract_smart2move_fx_system");

    const fzMeta = getSmart2MoveGraphMeta("fz");
    expect(fzMeta.label).toBe("Force verticale (Fz)");
    expect(fzMeta.extractPromptSection).toBe("radar_extract_smart2move_fz_system");
  });

  it("applies 1D/3D compatibility rules", () => {
    expect(isSmart2MoveGraphCompatibleWithPlate("fz", "1d")).toBe(true);
    expect(isSmart2MoveGraphCompatibleWithPlate("fz", "3d")).toBe(true);
    expect(isSmart2MoveGraphCompatibleWithPlate("fx", "1d")).toBe(false);
    expect(isSmart2MoveGraphCompatibleWithPlate("fx", "3d")).toBe(true);
  });
});
