import { readFileSync } from "node:fs";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { admin, username } from "better-auth/plugins";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AttemptLimiter } from "./attempt-limiter";
import { SIGN_IN_LOCKED_CODE, retryAfterFromHeaders, signInErrorMessage } from "./sign-in-errors";
import { SIGN_IN_IP_RULE, SIGN_IN_MAX_FAILURES, SIGN_IN_WINDOW_MS } from "./sign-in-limit";
import { signInLimitPlugin } from "./sign-in-limit-server";

/**
 * The sign-in limits through a real Better Auth (the version the application
 * runs), over HTTP, on an in-memory database — the same options as
 * auth-server.ts (pinned at the end of this file): the per-address rule, the
 * per-account plugin, /sign-in/email closed. An upgrade that changes how the
 * hooks see the request or the answer fails here, not in production.
 */

const SECRET = "secret-de-test-qui-ne-sert-qu-ici-0123456789";
const ORIGIN = "http://localhost:3210";
const PASSWORD = "mot-de-passe-de-test";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { user: [], session: [], account: [], verification: [], rateLimit: [] };
const limiter = new AttemptLimiter({ maxFailures: SIGN_IN_MAX_FAILURES, windowMs: SIGN_IN_WINDOW_MS });

const auth = betterAuth({
  database: memoryAdapter(db),
  secret: SECRET,
  baseURL: ORIGIN,
  emailAndPassword: { enabled: true },
  disabledPaths: ["/sign-in/email"],
  // Enabled here (Better Auth enables it in production only), in memory.
  rateLimit: { enabled: true, storage: "memory", customRules: { "/sign-in/username": { ...SIGN_IN_IP_RULE } } },
  advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] } },
  plugins: [username(), admin(), signInLimitPlugin(limiter)],
  logger: { disabled: true },
});

let ipCounter = 0;
/** A fresh address per scenario: the per-address buckets never mix. */
const nextIp = () => `10.0.0.${++ipCounter}`;

function signIn(user: string, password: string, ip: string, path = "/sign-in/username") {
  const body = path === "/sign-in/email" ? { email: `${user}@qualilab.local`, password } : { username: user, password };
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": ip },
      body: JSON.stringify(body),
    })
  );
}

async function errorOf(response: Response) {
  const json = (await response.json()) as { code?: string; message?: string };
  return { status: response.status, code: json.code, message: json.message };
}

beforeAll(async () => {
  for (const name of ["tech1", "tech2", "valid1", "magasin1", "banni"]) {
    await auth.api.signUpEmail({
      body: { email: `${name}@qualilab.local`, password: PASSWORD, name, username: name },
    });
  }
  const banned = db.user.find((row) => row.username === "banni");
  if (banned) banned.banned = true;
});

beforeEach(() => {
  db.session.length = 0;
});

describe("per address: colleagues behind one NAT address sign in within the same 10 seconds", () => {
  it("lets 10 sign-ins from one address through, refuses the 11th with X-Retry-After", async () => {
    const ip = nextIp();
    const users = ["tech1", "tech2", "valid1", "magasin1"];
    for (let i = 0; i < SIGN_IN_IP_RULE.max; i += 1) {
      const response = await signIn(users[i % users.length], PASSWORD, ip);
      expect(response.status, `connexion ${i + 1}`).toBe(200);
    }
    const refused = await signIn("tech1", PASSWORD, ip);
    expect(refused.status).toBe(429);
    const wait = retryAfterFromHeaders(refused.headers);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(SIGN_IN_IP_RULE.window);
    // The form says it is the network, not the password.
    expect(signInErrorMessage(await errorOf(refused), wait)).toMatch(
      /^Trop de tentatives de connexion depuis ce réseau\. Réessayez dans \d+ secondes?\.$/
    );
    // Another address is not affected.
    expect((await signIn("tech1", PASSWORD, nextIp())).status).toBe(200);
  });
});

describe("per account: 10 wrong passwords per 15 minutes", () => {
  it("refuses the 11th attempt — even the right password — from any address, without touching the account", async () => {
    for (let i = 0; i < SIGN_IN_MAX_FAILURES; i += 1) {
      const response = await signIn("valid1", "mauvais", nextIp());
      expect(response.status, `essai ${i + 1}`).toBe(401);
      expect((await errorOf(response)).code).toBe("INVALID_USERNAME_OR_PASSWORD");
    }
    const refused = await signIn("valid1", PASSWORD, nextIp());
    expect(refused.status).toBe(429);
    const error = await errorOf(refused);
    expect(error.code).toBe(SIGN_IN_LOCKED_CODE);
    expect(error.message).toBe("Trop de mots de passe erronés pour ce compte. Réessayez dans 15 minutes.");
    const wait = retryAfterFromHeaders(refused.headers);
    expect(wait).toBeGreaterThan(14 * 60);
    expect(wait).toBeLessThanOrEqual(15 * 60);
    expect(signInErrorMessage(error, wait)).toBe(
      "Trop de mots de passe erronés pour ce compte. Réessayez dans 15 minutes."
    );
    // The same account written differently is the same account.
    expect((await signIn("VALID1", PASSWORD, nextIp())).status).toBe(429);
    // The account is not modified, no session was opened.
    const row = db.user.find((user) => user.username === "valid1");
    expect(row?.banned).toBeFalsy();
    expect(db.session).toHaveLength(0);
    // Other accounts sign in.
    expect((await signIn("tech2", PASSWORD, nextIp())).status).toBe(200);
  });

  it("a sign-in clears the count", async () => {
    for (let i = 0; i < SIGN_IN_MAX_FAILURES - 1; i += 1) {
      expect((await signIn("magasin1", "mauvais", nextIp())).status).toBe(401);
    }
    expect((await signIn("magasin1", PASSWORD, nextIp())).status).toBe(200);
    for (let i = 0; i < SIGN_IN_MAX_FAILURES - 1; i += 1) {
      expect((await signIn("magasin1", "mauvais", nextIp())).status).toBe(401);
    }
    expect((await signIn("magasin1", PASSWORD, nextIp())).status).toBe(200);
  });

  it("counts an unknown username the same way: the refusal tells nobody which accounts exist", async () => {
    for (let i = 0; i < SIGN_IN_MAX_FAILURES; i += 1) {
      expect((await signIn("personne", "mauvais", nextIp())).status).toBe(401);
    }
    const refused = await signIn("personne", "mauvais", nextIp());
    expect(refused.status).toBe(429);
    expect((await errorOf(refused)).code).toBe(SIGN_IN_LOCKED_CODE);
  });

  it("a disabled account answers BANNED_USER — « Ce compte est désactivé » — and is not counted as a wrong password", async () => {
    const before = limiter.size;
    const response = await signIn("banni", PASSWORD, nextIp());
    expect(response.status).toBe(403);
    const error = await errorOf(response);
    expect(error.code).toBe("BANNED_USER");
    expect(signInErrorMessage(error)).toBe("Ce compte est désactivé. Contactez l'administrateur.");
    expect(limiter.size).toBe(before);
  });

  it("a wrong password says « Identifiants incorrects. »", async () => {
    const response = await signIn("tech2", "mauvais", nextIp());
    expect(signInErrorMessage(await errorOf(response))).toBe("Identifiants incorrects.");
    expect((await signIn("tech2", PASSWORD, nextIp())).status).toBe(200);
  });
});

describe("one sign-in door", () => {
  it("/sign-in/email answers 404", async () => {
    const response = await signIn("tech1", PASSWORD, nextIp(), "/sign-in/email");
    expect(response.status).toBe(404);
  });
});

describe("auth-server.ts uses these options (source pin)", () => {
  const root = join(__dirname, "..", "..");
  const config = readFileSync(join(root, "src/lib/auth-server.ts"), "utf8");

  it("widens the per-address sign-in rule, keeps the address headers", () => {
    expect(config).toMatch(/rateLimit:\s*\{\s*customRules:\s*\{\s*"\/sign-in\/username":\s*\{\s*\.\.\.SIGN_IN_IP_RULE\s*\}/);
    expect(config).toMatch(/ipAddressHeaders:\s*\["x-real-ip",\s*"x-forwarded-for"\]/);
    // Not turned off: Better Auth's default (production only) stands.
    expect(config).not.toMatch(/enabled:\s*false/);
  });

  it("installs the per-account limit and closes /sign-in/email", () => {
    expect(config).toMatch(/signInLimitPlugin\(\),/);
    const start = config.indexOf("disabledPaths: [");
    const disabled = config.slice(start, config.indexOf("],", start));
    expect(disabled).toContain('"/sign-in/email"');
  });

  it("nothing signs in over HTTP through /sign-in/email (the form and the demo panel use /sign-in/username)", () => {
    const login = readFileSync(join(root, "src/components/LoginForm.tsx"), "utf8");
    expect(login).toMatch(/authClient\.signIn\.username\(/);
    expect(login).not.toMatch(/signIn\.email/);
  });
});
