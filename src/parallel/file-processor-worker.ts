/**
 * Worker script for parallel file processing
 *
 * This worker receives batches of files to process and returns results.
 * Run via Node.js worker_threads module.
 */

import { parentPort } from "node:worker_threads";
import { FileProcessor, FileProcessorResult } from "./file-processor.js";

interface ProcessBatchMessage {
  type: "process-batch";
  files: Array<{ path: string; content: string; fileId: string }>;
  repoRoot: string;
}

interface ProcessBatchResultMessage {
  type: "batch-result";
  batchId: number;
  results: FileProcessorResult[];
}

// Listen for messages from main thread
parentPort?.on("message", (message: ProcessBatchMessage) => {
  if (message.type === "process-batch") {
    const results = FileProcessor.processBatch(message.files, message.repoRoot);

    const response: ProcessBatchResultMessage = {
      type: "batch-result",
      batchId: 0,
      results,
    };

    parentPort?.postMessage(response);
  }
});