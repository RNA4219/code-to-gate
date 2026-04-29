// Partially parseable - syntax errors but recoverable

function validFunction() {
  return 'This is valid';
}

// Syntax error: missing closing brace
function incompleteFunction() {
  const x = {
    value: 1
  // Missing closing brace

// Another valid function
function anotherValid() {
  return 'Also valid';
}

// Syntax error: invalid token
const invalid = 123abc;

// Valid export
export { validFunction, anotherValid };