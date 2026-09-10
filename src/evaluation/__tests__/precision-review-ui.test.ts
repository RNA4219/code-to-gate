import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createPrecisionWorkbenchModel, renderPrecisionReviewHtml } from "../precision-review-html.js";
import { createPrecisionReview, summarizePrecisionReview } from "../precision-review.js";
import { createPrecisionWorkbenchFixture } from "./precision-review-fixture.js";

class FakeElement {
  children: FakeElement[] = []; textContent = ""; value = ""; hidden = false; disabled = false; files: unknown[] = []; className = ""; rows = 0; cols = 0; placeholder = "";
  private listeners = new Map<string, (event: { target: FakeElement }) => void>();
  constructor(public tagName = "div", public id = "") {}
  appendChild(child: FakeElement): FakeElement { this.children.push(child); return child; }
  replaceChildren(...children: FakeElement[]): void { this.children = children; }
  addEventListener(type: string, listener: (event: { target: FakeElement }) => void): void { this.listeners.set(type, listener); }
  dispatch(type: string): void { this.listeners.get(type)?.({ target: this }); }
  click(): void { this.dispatch("click"); }
  find(tag: string): FakeElement | undefined { return this.tagName === tag ? this : this.children.map((child) => child.find(tag)).find(Boolean); }
}
function flatten(element: FakeElement): FakeElement[] { return [element, ...element.children.flatMap(flatten)]; }

describe("precision review browser UI", () => {
  it("supports filters, editing, strict import, human reset, and summarize roundtrip", async () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      const summary = summarizePrecisionReview(fixture.findings, fixture.review, fixture.findingsBytes);
      const html = renderPrecisionReviewHtml(createPrecisionWorkbenchModel(fixture.findings, fixture.review, summary, fixture.repoPath));
      const dataText = html.match(/<script type="application\/json" id="precision-data">([\s\S]*?)<\/script>/)?.[1];
      const script = html.match(/<script>([\s\S]*)<\/script><\/body>/)?.[1]; if (!dataText || !script) throw new Error("workbench scripts not found");
      const ids = ["precision-data", "binding", "search", "rule", "category", "classification", "progress", "prev", "page", "next", "export", "import", "reviewer-name", "human-copy", "message", "items", "detail-empty", "detail"];
      const elements = new Map(ids.map((id) => [id, new FakeElement("div", id)])); elements.get("precision-data")!.textContent = dataText;
      const document = { getElementById: (id: string) => elements.get(id)!, createElement: (tag: string) => new FakeElement(tag) };
      const downloads: Blob[] = []; let nextImport = JSON.stringify({ ...fixture.review, findings: fixture.review.findings.slice(0, 1) });
      const context = { document, structuredClone, JSON, Set, Blob, FileReader: class { result = ""; onload?: () => void; readAsText() { this.result = nextImport; this.onload?.(); } }, URL: { createObjectURL: (blob: Blob) => { downloads.push(blob); return "blob:test"; }, revokeObjectURL: () => {} }, console };
      vm.runInNewContext(script, context);
      const search = elements.get("search")!; search.value = "DEBT_MARKER"; search.dispatch("input"); expect(elements.get("progress")!.textContent).toContain("表示1件"); search.value = ""; search.dispatch("input");
      const category = elements.get("category")!; category.value = "testing"; category.dispatch("input"); expect(elements.get("progress")!.textContent).toContain("表示1件"); category.value = ""; category.dispatch("input");
      const rule = elements.get("rule")!; rule.value = "DEBT_MARKER"; rule.dispatch("input"); expect(elements.get("progress")!.textContent).toContain("表示1件"); rule.value = ""; rule.dispatch("input");
      const classification = elements.get("classification")!; classification.value = "Uncertain"; classification.dispatch("input"); expect(elements.get("progress")!.textContent).toContain("表示3件"); classification.value = ""; classification.dispatch("input");
      elements.get("items")!.children[0].click(); const detailNodes = flatten(elements.get("detail")!); const select = detailNodes.find((node) => node.tagName === "select")!; const area = detailNodes.find((node) => node.tagName === "textarea")!; select.value = "FP"; select.dispatch("change"); area.value = "日本語コメント"; area.dispatch("input");
      elements.get("import")!.files = [new FakeElement("file")]; elements.get("import")!.dispatch("change"); expect(elements.get("message")!.textContent).toContain("JSON読込失敗");
      nextImport = JSON.stringify({ ...fixture.review, reviewer: { kind: "human", id: "再開reviewer" }, findings: fixture.review.findings.map((x) => ({ ...x, comment: "復元コメント" })) }); elements.get("import")!.dispatch("change"); expect(elements.get("message")!.textContent).toBe("");
      nextImport = JSON.stringify({ ...fixture.review, findings: fixture.review.findings.map((x) => ({ ...x, comment: {} })) }); elements.get("import")!.dispatch("change"); expect(elements.get("message")!.textContent).toContain("comment型");
      elements.get("reviewer-name")!.value = ""; elements.get("human-copy")!.click(); expect(elements.get("message")!.textContent).toContain("reviewer名");
      elements.get("reviewer-name")!.value = "人手reviewer"; elements.get("human-copy")!.click(); expect(elements.get("binding")!.textContent).toContain("reviewer=human/人手reviewer"); elements.get("export")!.click();
      const saved = JSON.parse(await downloads.at(-1)!.text()); expect(saved.findings.every((item: { classification: string; comment?: string; humanReviewed?: unknown }) => item.classification === "Uncertain" && !item.comment && item.humanReviewed === undefined)).toBe(true);
      expect(() => summarizePrecisionReview(fixture.findings, saved, fixture.findingsBytes)).not.toThrow();
    } finally { fixture.cleanup(); }
  });

  it("pages a large finding collection without drawing all cards", () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      const many = { ...fixture.findings, findings: Array.from({ length: 101 }, (_, i) => ({ ...fixture.findings.findings[0], id: `fixture-${i}`, title: `finding-${i}` })) };
      const manyBytes = Buffer.from(JSON.stringify(many), "utf8");
      const review = createPrecisionReview(many, { reviewer: { kind: "ai", id: "page-ai" }, findingsBytes: manyBytes, repoPath: fixture.repoPath, fullSha: fixture.review.repo.full_sha });
      const summary = summarizePrecisionReview(many, review, manyBytes);
      const html = renderPrecisionReviewHtml(createPrecisionWorkbenchModel(many, review, summary));
      expect(html).toContain("size=50");
    } finally { fixture.cleanup(); }
  });
});
