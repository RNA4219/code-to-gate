/**
 * Plugin YAML Parser - Simple YAML parsing for plugin manifests
 */

/**
 * Parse YAML content into object
 */
export function parseYamlContent(content: string): Record<string, unknown> {
  const lines = content.split("\n");
  const result: Record<string, unknown> = {};
  let currentKey = "";
  let currentArray: unknown[] | null = null;
  let currentObject: Record<string, unknown> | null = null;
  let inNestedObject = false;

  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (indent === 0) {
        currentKey = key;
        inNestedObject = false;
        currentArray = null;
        currentObject = null;

        if (value === "") {
          result[key] = {};
          currentObject = result[key] as Record<string, unknown>;
          inNestedObject = true;
        } else if (value.startsWith("[")) {
          result[key] = parseYamlArray(value);
        } else if (value.startsWith('"') || value.startsWith("'")) {
          result[key] = value.slice(1, -1);
        } else if (value === "true" || value === "false") {
          result[key] = value === "true";
        } else if (!isNaN(Number(value))) {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      } else if (inNestedObject && currentObject) {
        if (value === "") {
          currentObject[key] = {};
          currentObject = currentObject[key] as Record<string, unknown>;
        } else if (value.startsWith("[")) {
          currentObject[key] = parseYamlArray(value);
        } else if (value.startsWith('"') || value.startsWith("'")) {
          currentObject[key] = value.slice(1, -1);
        } else if (value === "true" || value === "false") {
          currentObject[key] = value === "true";
        } else if (!isNaN(Number(value))) {
          currentObject[key] = Number(value);
        } else {
          currentObject[key] = value;
        }
      }
    } else if (trimmed.startsWith("- ")) {
      const value = trimmed.substring(2).trim();
      if (currentKey && !currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
        inNestedObject = false;
      }
      if (currentArray) {
        if (value.startsWith('"') || value.startsWith("'")) {
          currentArray.push(value.slice(1, -1));
        } else if (value === "true" || value === "false") {
          currentArray.push(value === "true");
        } else if (!isNaN(Number(value))) {
          currentArray.push(Number(value));
        } else {
          currentArray.push(value);
        }
      }
    }
  }

  return result;
}

/**
 * Parse inline YAML array
 */
export function parseYamlArray(value: string): unknown[] {
  const inner = value.slice(1, -1).trim();
  if (inner === "") {
    return [];
  }

  return inner.split(",").map(item => {
    const trimmed = item.trim();
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
      return trimmed.slice(1, -1);
    }
    if (trimmed === "true" || trimmed === "false") {
      return trimmed === "true";
    }
    if (!isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
    return trimmed;
  });
}