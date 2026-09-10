import type { FindingsArtifact } from "../types/artifacts.js";
import type { PrecisionReviewArtifact, PrecisionReviewSummary } from "./precision-review.js";
import { collectPrecisionCode, findingForWorkbench } from "./precision-review-source.js";

export interface PrecisionWorkbenchModel {
  findings: Array<Record<string, unknown>>;
  review: PrecisionReviewArtifact;
  summary: PrecisionReviewSummary;
  binding: {
    run_id: string;
    findings_source: PrecisionReviewArtifact["findings_source"];
    repo: PrecisionReviewArtifact["repo"];
  };
}

export function createPrecisionWorkbenchModel(
  findings: FindingsArtifact,
  review: PrecisionReviewArtifact,
  summary: PrecisionReviewSummary,
  repoPath?: string,
): PrecisionWorkbenchModel {
  const snippets = collectPrecisionCode(findings, review, repoPath);
  const reviewById = new Map(review.findings.map((item) => [item.finding_id, item]));
  return {
    findings: findings.findings.map((finding) => {
      const reviewed = reviewById.get(finding.id);
      if (!reviewed) throw new Error(`review finding is missing: ${finding.id}`);
      return findingForWorkbench(finding, reviewed, snippets.get(finding.id) ?? []);
    }),
    review,
    summary,
    binding: { run_id: review.run_id, findings_source: review.findings_source, repo: review.repo },
  };
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function renderPrecisionReviewHtml(model: PrecisionWorkbenchModel): string {
  const payload = safeJson(model);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>精度レビュー</title><style>
body{font-family:system-ui,sans-serif;margin:0;color:#202124;background:#f7f8fa}header{padding:16px 22px;background:#263238;color:#fff}header .muted{color:#e8f0fe;overflow-wrap:anywhere}main{display:grid;grid-template-columns:minmax(280px,38%) 1fr;gap:16px;padding:16px}section{background:#fff;border:1px solid #d9dee3;border-radius:8px;padding:12px}.controls{display:grid;gap:7px}.list{display:grid;gap:6px;margin-top:10px}.item{padding:8px;border:1px solid #dde2e7;border-radius:6px;cursor:pointer}.item.selected{border-color:#1565c0;background:#eaf2ff}.detail{min-height:500px}.evidence,.snippet{white-space:pre-wrap;overflow:auto;background:#f1f3f4;padding:8px;border-radius:5px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button,select,input,textarea{font:inherit;padding:6px}button{cursor:pointer}.muted{color:#5f6368}#progress{margin-top:8px}
</style></head><body><header><strong>精度レビュー</strong><div id="binding" class="muted"></div></header><main><section><div class="controls"><input id="search" placeholder="検索（ID・rule・本文）"><select id="rule"><option value="">すべてのrule</option></select><select id="category"><option value="">すべてのcategory</option></select><select id="classification"><option value="">すべての分類</option><option>TP</option><option>FP</option><option>Uncertain</option><option>AcceptedDesign</option></select><div id="progress"></div><div class="row"><button id="prev">前へ</button><span id="page"></span><button id="next">次へ</button></div><div class="row"><button id="export">JSON保存</button><label>JSON読込<input id="import" type="file" accept="application/json"></label><input id="reviewer-name" placeholder="人手reviewer名"><button id="human-copy">新しい人手レビューを開始</button><div id="message" role="alert" aria-live="polite"></div><p class="muted">開始すると分類とコメントを全件Uncertain/空欄へ初期化します。</p></div></div><div id="items" class="list"></div></section><section class="detail"><div id="detail-empty" class="muted">一覧からfindingを選択してください。</div><div id="detail"></div></section></main>
<script type="application/json" id="precision-data">${payload}</script><script>${WORKBENCH_SCRIPT}</script></body></html>`;
}

const WORKBENCH_SCRIPT = `(() => {
const data=JSON.parse(document.getElementById("precision-data").textContent); const classes=["TP","FP","Uncertain","AcceptedDesign"]; let state={review:structuredClone(data.review),query:"",rule:"",category:"",classification:"",page:0,selected:null};
const $=id=>document.getElementById(id); const rows=()=>data.findings.filter(f=>(!state.query||JSON.stringify(f).toLowerCase().includes(state.query.toLowerCase()))&&(!state.rule||f.rule_id===state.rule)&&(!state.category||f.category===state.category)&&(!state.classification||state.review.findings.find(r=>r.finding_id===f.finding_id)?.classification===state.classification));
function text(parent,value){const n=document.createElement("span");n.textContent=String(value??"");parent.appendChild(n);return n} function message(value){$("message").textContent=String(value??"")} function canonical(v){if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";return JSON.stringify(v)}
function immutable(r){return {artifact:r.artifact,schema:r.schema,run_id:r.run_id,findings_source:r.findings_source,repo:r.repo,findings:(r.findings||[]).map(x=>({finding_id:x.finding_id,rule_id:x.rule_id,fingerprint:x.fingerprint,evidence_ref_hashes:x.evidence_ref_hashes})).sort((a,b)=>a.finding_id.localeCompare(b.finding_id))}}
function validImport(candidate){if(!candidate||!candidate.reviewer||!["human","ai"].includes(candidate.reviewer.kind)||typeof candidate.reviewer.id!=="string"||!candidate.reviewer.id.trim())throw Error("reviewer.kind/idが不正です");if(!Array.isArray(candidate.findings)||candidate.findings.length!==data.findings.length)throw Error("finding集合が不完全です");if(canonical(immutable(candidate))!==canonical(immutable(data.review)))throw Error("immutable bindingが一致しません");const ids=new Set();for(const x of candidate.findings){if(ids.has(x.finding_id)||!classes.includes(x.classification)|| (x.comment!==undefined&&typeof x.comment!=="string"))throw Error("finding分類、重複、comment型が不正です");ids.add(x.finding_id)}return candidate}
function render(){const all=rows(),size=50,max=Math.max(1,Math.ceil(all.length/size));const uncertain=state.review.findings.filter(r=>r.classification==="Uncertain").length;const confirmed=state.review.findings.length-uncertain;$("binding").textContent=\`reviewer=\${state.review.reviewer.kind}/\${state.review.reviewer.id} / run_id=\${data.binding.run_id} / source=\${data.binding.findings_source.sha256}\`;state.page=Math.min(state.page,max-1);$("items").replaceChildren();all.slice(state.page*size,(state.page+1)*size).forEach(f=>{const b=document.createElement("button");b.className="item"+(state.selected===f.finding_id?" selected":"");text(b,\`\${f.finding_id} · \${f.rule_id} · \${state.review.findings.find(r=>r.finding_id===f.finding_id)?.classification}\`);b.addEventListener("click",()=>{state.selected=f.finding_id;renderDetail();render()});$("items").appendChild(b)});$("page").textContent=\`\${state.page+1}/\${max}\`;$("progress").textContent=\`\${data.findings.length}件 / 表示\${all.length}件 / 確定\${confirmed}件 / Uncertain \${uncertain}件\`;$("prev").disabled=state.page===0;$("next").disabled=state.page>=max-1}
function renderDetail(){const f=data.findings.find(x=>x.finding_id===state.selected);const root=$("detail");root.replaceChildren();if(!f){$("detail-empty").hidden=false;return}$("detail-empty").hidden=true;text(root,f.title);text(root,\` (\${f.category} / \${f.severity})\`);root.appendChild(document.createElement("p"));text(root,f.summary);const sel=document.createElement("select");classes.forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;sel.appendChild(o)});const item=state.review.findings.find(r=>r.finding_id===f.finding_id);sel.value=item.classification;sel.addEventListener("change",()=>{item.classification=sel.value;render()});root.appendChild(document.createElement("p"));root.appendChild(sel);const area=document.createElement("textarea");area.rows=4;area.cols=60;area.placeholder="日本語コメント";area.value=item.comment||"";area.addEventListener("input",()=>{item.comment=area.value});root.appendChild(document.createElement("p"));root.appendChild(area);(f.evidence||[]).forEach(e=>{const pre=document.createElement("pre");pre.className="evidence";text(pre,\`\${e.path}:\${e.startLine||""}-\${e.endLine||""}\`);root.appendChild(pre)});(f.snippets||[]).forEach(s=>{const pre=document.createElement("pre");pre.className="snippet";text(pre,s.status==="available"?s.content:\`\${s.path||""}: \${s.reason||"取得不能"}\`);root.appendChild(pre)})}
["search","rule","category","classification"].forEach(id=>$(id).addEventListener("input",()=>{state[id==="search"?"query":id]=$(id).value;state.page=0;render()}));[...new Set(data.findings.map(f=>f.rule_id))].sort().forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;$("rule").appendChild(o)});[...new Set(data.findings.map(f=>f.category))].sort().forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;$("category").appendChild(o)});$("prev").addEventListener("click",()=>{state.page--;render()});$("next").addEventListener("click",()=>{state.page++;render()});$("export").addEventListener("click",()=>{const r={...state.review,humanReviewed:false,precision_reportable:false};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:"application/json"}));a.download="precision-review.json";a.click();URL.revokeObjectURL(a.href)});$("import").addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{state.review=validImport(JSON.parse(reader.result));message("");render();renderDetail()}catch(err){message(\`JSON読込失敗: \${err.message}\`)}};reader.readAsText(file)});$("human-copy").addEventListener("click",()=>{const name=$("reviewer-name").value;if(!name||!name.trim()){message("reviewer名が必要です");return}state.review={...state.review,reviewer:{kind:"human",id:name.trim()},findings:state.review.findings.map(x=>({...x,classification:"Uncertain",comment:""})),humanReviewed:false,precision_reportable:false};message("新しい人手レビューを開始しました");render();renderDetail()});render();renderDetail();})();`;

export { WORKBENCH_SCRIPT };
