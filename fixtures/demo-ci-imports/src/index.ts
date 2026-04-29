import { loadConfig } from "./config";
import { normalizeUser } from "./user";

export function start() {
  const config = loadConfig();
  return normalizeUser({ id: "synthetic-user", email: config.ownerEmail });
}

