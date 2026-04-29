export type UserInput = {
  id: string;
  email?: string;
};

export function normalizeUser(input: UserInput) {
  if (!input.email) {
    return { id: input.id, email: null };
  }

  const email: string = input.email;
  return { id: input.id, email: email.toLowerCase() };
}

export function unsafeName(value) {
  return String(value).trim();
}

