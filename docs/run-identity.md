# 実行IDと再現性

独立した解析・補助artifactの実行IDは、UTC時刻とランダムなUUIDを組み合わせて生成する。
同じrepoを同じ時刻に解析しても別のrun IDになり、解析cacheの再利用時もrun IDは更新される。
sourceのhash、finding fingerprint、cacheされた解析内容は、この実行識別とは別に維持する。

入力artifactを引き継ぐ処理は元の`run_id`を保持する。
readinessは入力を別policyで評価する新しい実行として一意のIDを生成し、同じ実行のself-analysis-debtと共有する。元のfindingsのIDは変更しない。
agent APIのrequest/fingerprintによるrun IDと冪等再利用は従来どおりで、同じrequestを独立実行へ変換しない。

`run_id`は不透明な文字列として扱う。repoやcommitは`repo`フィールドを参照し、IDの末尾から推測しない。
過去artifactの時刻形式IDも引き続き読み込める。
既存のpure helper `generateRunId(timestamp)`は互換性のため旧出力を維持するが、独立実行には`src/utils/run-id.ts`の`createUniqueRunId`を使う。

run IDの一意性は、同じ出力directoryへの並列書込みを制御するものではない。
独立したCLI実行では別の出力directoryを使い、agent APIでは既存のrequest/lock契約を使う。

検証記録: [Task 20260910-08](tasks/20260910-08-run-identity.md)。
