// Malformed but potentially parseable JavaScript

// Missing semicolons (still valid but unusual style)
const a = 1
const b = 2
const c = a + b

// Unusual but valid syntax
export default class {
  constructor() {
    this.value = 1
  }
  method() { return this.value }
}

// Multiple declarations on one line
let x = 1, y = 2, z = 3;

// Nested template literals
const nested = `outer ${`inner ${'deepest'}`} end`

// Comma operator in unusual places
let result = (x++, y++, z++, x + y + z)

// Valid but confusing arrow function
const fn = x => y => z => x + y + z

// Object with computed properties
const key = 'dynamic'
const obj = {
  [key]: 'value',
  [`${key}Suffix`]: 'another',
  get [key + 'Getter']() { return 'getter' }
}

// Export at bottom
export { a, b, c, fn, obj }