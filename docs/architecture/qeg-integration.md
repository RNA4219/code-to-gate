# QEG Integration

code-to-gateは証拠のproducerであり、`qeg-code-to-gate.json`に判定を含めない。最終判断のownerはquality-evidence-graphである。

`qeg-connector.ts`は証拠構築だけを行う純粋ロジックとする。artifactの読込、SHA-256 hash生成、書込、path操作は`qeg-artifact-io.ts`が既存サービス契約を通じて行い、Node実装はCLIが注入する。
