export function loadConfig() {
  console.log("loading synthetic config");
  return {
    ownerEmail: "owner@example.test",
    redirectUrl: "https://example.test/callback"
  };
}

export function redirectTo(nextUrl: string) {
  return { status: 302, headers: { location: nextUrl } };
}

