import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { createMockFinding, createMockFindingsArtifact } from "../../test-utils/index.js";
import { createPrecisionWorkbenchModel, renderPrecisionReviewHtml } from "../precision-review-html.js";
import { createPrecisionReview, summarizePrecisionReview, type PrecisionReviewArtifact } from "../precision-review.js";

class Element {
  children: Element[] = [];
  textContent = "";
  value = "";
  disabled = false;
  files: object[] = [];
  listeners = new Map<string, (event: { target: Element }) => void>();
  constructor(public tag = "div") {}
  appendChild(child: Element) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  addEventListener(name: string, callback: (event: { target: Element }) => void) { this.listeners.set(name, callback); }
  dispatch(name: string) { this.listeners.get(name)?.({ target: this }); }
  click() { this.dispatch("click"); }
  find(tag: string): Element | undefined {
    return this.tag === tag ? this : this.children.map(child => child.find(tag)).find(Boolean);
  }
}

function mount(count = 3) {
  const findings = createMockFindingsArtifact({
    repo: { root: "synthetic-ui", revision: "a".repeat(40), dirty: false },
    findings: Array.from({ length: count }, (_, i) => createMockFinding("low", "testing", {
      id: `f-${i}`, ruleId: "TEST_ONLY", title: i === 0 ? "表示 </script> & \u2028 \u2029" : `finding ${i}`,
    })),
  });
  const bytes = Buffer.from(JSON.stringify(findings));
  const review = createPrecisionReview(findings, {
    reviewer: { kind: "ai", id: "synthetic-ui" }, findingsBytes: bytes, findingsPath: "findings.json", fullSha: "a".repeat(40),
  });
  const html = renderPrecisionReviewHtml(createPrecisionWorkbenchModel(findings, review, summarizePrecisionReview(findings, review, bytes)));
  const payload = html.match(/id="precision-data">([\s\S]*?)<\/script>/)![1];
  const script = html.match(/<script>([\s\S]*)<\/script><\/body>/)![1];
  const elements = new Map<string, Element>();
  const el = (id: string) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id)!; };
  el("precision-data").textContent = payload;
  const downloads: Blob[] = [];
  let imported = "";
  vm.runInNewContext(script, {
    document: { getElementById: el, createElement: (tag: string) => new Element(tag) },
    structuredClone, JSON, Set, Blob,
    URL: { createObjectURL: (blob: Blob) => { downloads.push(blob); return "blob:synthetic"; }, revokeObjectURL() {} },
    FileReader: class { result = ""; onload?: () => void; readAsText() { this.result = imported; this.onload?.(); } },
  });
  return {
    el, review, html, findings, bytes,
    importReview(value: unknown) { imported = JSON.stringify(value); el("import").files = [{}]; el("import").dispatch("change"); },
    async save(): Promise<PrecisionReviewArtifact> { el("export").click(); return JSON.parse(await downloads.at(-1)!.text()); },
    edit(classification = "FP", comment = "日本語 | <b>\n2行目") {
      el("items").children[0].click();
      const select = el("detail").find("select")!;
      select.value = classification; select.dispatch("change");
      const area = el("detail").find("textarea")!;
      area.value = comment; area.dispatch("input");
    },
  };
}

describe("precision review interaction regressions", () => {
  it("preserves edited AI classifications/comments through export, summarize, and import", async () => {
    const app = mount(); app.edit();
    const saved = await app.save();
    expect(saved.reviewer.kind).toBe("ai");
    expect(saved.findings[0]).toMatchObject({ classification: "FP", comment: "日本語 | <b>\n2行目" });
    expect(summarizePrecisionReview(app.findings, saved, app.bytes)).toMatchObject({ precision_reportable: false, humanReviewed: false, counts: { fp: 1, uncertain: 2 } });
    app.edit("TP", "上書き前"); app.importReview(saved);
    expect((await app.save()).findings).toEqual(saved.findings);
  });

  it.each(["run", "source", "repo", "sha", "duplicate", "missing", "unknown", "rule", "fingerprint", "evidence"])("rejects %s binding changes without losing edits", async (field) => {
    const app = mount(); app.edit(); const before = await app.save();
    const changed = structuredClone(before);
    switch (field) {
      case "run": changed.run_id += "-other"; break;
      case "source": changed.findings_source.sha256 = "b".repeat(64); break;
      case "repo": changed.repo.root += "-other"; break;
      case "sha": changed.repo.full_sha = "b".repeat(40); break;
      case "duplicate": changed.findings[1] = structuredClone(changed.findings[0]); break;
      case "missing": changed.findings.pop(); break;
      case "unknown": changed.findings[0].finding_id = "unknown"; break;
      case "rule": changed.findings[0].rule_id += "-other"; break;
      case "fingerprint": changed.findings[0].fingerprint = "other"; break;
      case "evidence": changed.findings[0].evidence_ref_hashes.push("other"); break;
    }
    app.importReview(changed);
    expect(app.el("message").textContent).toContain("JSON読込失敗");
    expect((await app.save()).findings).toEqual(before.findings);
  });

  it("resumes a named human review while rejecting malformed reviewer/comment values", async () => {
    const app = mount(); const human = structuredClone(app.review);
    human.reviewer = { kind: "human", id: "synthetic-human" };
    human.findings[0].classification = "AcceptedDesign";
    human.findings[0].comment = "保存済みの根拠";
    app.importReview(human);
    expect(await app.save()).toMatchObject({ reviewer: human.reviewer, findings: human.findings });
    for (const invalid of [ { ...human, reviewer: { kind: "human", id: " " } }, { ...human, findings: human.findings.map(f => ({ ...f, comment: null })) } ]) {
      app.importReview(invalid);
      expect(app.el("message").textContent).toContain("JSON読込失敗");
      expect((await app.save()).reviewer).toEqual(human.reviewer);
    }
  });

  it("pages only 50 rows and edits the last row without touching the first page", async () => {
    const app = mount(101);
    expect(app.el("items").children).toHaveLength(50);
    expect(app.el("prev").disabled).toBe(true);
    app.el("next").click(); expect(app.el("page").textContent).toBe("2/3");
    app.el("next").click(); expect(app.el("items").children).toHaveLength(1);
    expect(app.el("next").disabled).toBe(true);
    app.edit("TP", "最終ページ"); const saved = await app.save();
    expect(saved.findings[100]).toMatchObject({ classification: "TP", comment: "最終ページ" });
    expect(saved.findings[0].classification).toBe("Uncertain");
    app.el("prev").click(); expect(app.el("page").textContent).toBe("2/3");
  });

  it("renders an empty review and safely embeds script-like text", async () => {
    const empty = mount(0);
    expect(empty.el("items").children).toHaveLength(0);
    expect(empty.el("next").disabled).toBe(true);
    expect((await empty.save()).findings).toEqual([]);
    const app = mount();
    expect(app.html).toContain("\\u003c/script\\u003e");
    app.el("items").children[0].click();
    expect(app.el("detail").children[0].textContent).toContain("</script>");
  });
});
