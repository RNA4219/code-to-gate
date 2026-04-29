// TypeScript with type errors but valid syntax

interface User {
  id: number;
  name: string;
  email: string;
}

// Type error: missing properties
const incompleteUser: User = {
  id: 1,
  // Missing name and email
};

// Type error: wrong type
const wrongType: User = {
  id: "not a number",  // Should be number
  name: "John",
  email: 123  // Should be string
};

// Valid usage
const validUser: User = {
  id: 1,
  name: "John Doe",
  email: "john@example.com"
};

// Generic with constraint
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Usage
const userName = getProperty(validUser, 'name');

export { User, validUser, getProperty };