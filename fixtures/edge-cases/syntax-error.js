// File with syntax error for testing error handling
const broken = {
  function missing() {
    return "this has syntax errors"
  }
  // Missing closing brace and other issues
const x = function() {
  return {
    nested: {
      another: {
        // Missing closing braces