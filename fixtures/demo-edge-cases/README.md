# Demo Edge Cases

This fixture contains various edge case files for testing parser robustness.

## Structure

```
demo-edge-cases/
├── empty.*              # Empty files (js, ts, py, json)
├── large-file.js        # Large file near size limits
├── special-chars/       # Files with special characters in names
│   ├── file with spaces.js
│   ├── file-with-dash.js
│   ├── _underscore-prefix.js
│   ├── .hidden-file.js
│   └── file(test).js
├── unicode/             # Unicode content files
│   ├── unicode-content.js
│   ├── unicode-markdown.md
│   └── unicode-data.json
├── binary-like/         # Binary-like content
│   ├── image.svg
│   ├── page.html
│   └── data-like.txt
├── malformed/           # Malformed but parseable code
│   ├── unusual-syntax.js
│   ├── partial-parse.js
│   └── type-errors.ts
└── nested/             # Deeply nested directory structure
    ├── index.js
    ├── level1.js
    └── deep/
        ├── level2.js
        └── structure/
            └── level3.js
```

## Test Scenarios

### Empty File Handling
- Test that empty files don't cause parser errors
- Verify graceful handling of zero-byte files

### Large File Handling
- Test parsing of files near typical size limits
- Verify performance with large data structures

### Special Character Paths
- Spaces in filenames
- Dots, dashes, underscores
- Parentheses and special characters

### Unicode Handling
- Japanese, Chinese, Korean characters
- Right-to-left text (Arabic, Hebrew)
- Emojis and symbols
- Mixed direction text

### Binary-like Content
- SVG with embedded JavaScript
- HTML with embedded code
- Base64-encoded data

### Partial Parse
- Files with syntax errors but recoverable content
- Type errors in TypeScript
- Unusual but valid syntax

### Nested Directories
- Deep directory traversal
- Relative import resolution
- Circular reference detection