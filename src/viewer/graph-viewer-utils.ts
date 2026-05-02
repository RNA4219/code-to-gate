/**
 * Graph Viewer Utility Functions
 * Helper functions for Mermaid diagram generation
 */

/**
 * Escape text for Mermaid diagram
 */
export function escapeMermaidText(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/\n/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim();
}

/**
 * Generate a safe node ID for Mermaid
 */
export function sanitizeNodeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "n_");
}

/**
 * Get node shape based on symbol kind
 */
export function getNodeShape(kind: string): string {
  switch (kind) {
    case "function":
      return "([%s])";
    case "class":
      return "[[%s]]";
    case "method":
      return "[%s]";
    case "interface":
      return "[[%s]]";
    case "route":
      return ">%s]";
    case "test":
      return "((%s))";
    default:
      return "[%s]";
  }
}

/**
 * Get edge style based on relation kind
 */
export function getEdgeStyle(kind: string): string {
  switch (kind) {
    case "calls":
      return "-->";
    case "imports":
      return "-.->";
    case "tests":
      return "-..->";
    case "depends_on":
      return "==>";
    default:
      return "-->";
  }
}