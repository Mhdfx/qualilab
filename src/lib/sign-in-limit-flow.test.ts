import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { admin, username } from "better-auth/plugins";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_ADDRESS_LIMIT_CODE, SIGN_IN_LOCKED_CODE, retryAfterFromHeaders, signInErrorMessage } from "./sign-in-errors";
import {
  SIGN_IN_ACCOUNT_MAX_FAILURES,
  SIGN_IN_ADDRESS_MAX,
  SIGN_IN_MAX_FAILURES,
  createSignInLimiters,
} from "./sign-in-limit";
import { signInLimitPlugin } from "./sign-in-limit-server";

/**
 * The sign-in limits through a real Better Auth (the version the application
 * runs), over HTTP, on an in-memory database — the same options as
 * auth-server.ts (pinned at the end of this file): Better Auth's own sign-in
 * rule off, the plugin's three limits, /sign-in/email closed. An upgrade that
 * changes how the hooks see the request or the answer fails here, not in
 * production. The clock is faked (Date only) to space requests out.
 */

const SECRET = "secret-de-test-qui-ne-sert-qu-ici-0123456789";
const ORIGIN = "http://localhost:3210";
const PASSWORD = "mot-de-passe-de-test";
const T0 = Date.UTC(2026, 10, 25, 8, 0);

type Row = Record<string, unknown>;
const emptyDb = (): Record<string, Row[]> => ({ user: [], session: [], account: [], verification: [], rateLimit: [] });
const db = emptyDb();
const limiters = createSignInLimiters();

const auth = betterAuth({
  database: memoryAdapter(db),
  secret: SECRET,
  baseURL: ORIGIN,
  emailAndPassword: { enabled: true },
  disabledPaths: ["/sign-in/email"],
  // Enabled here (Better Auth enables it in production only), in memory.
  rateLimit: { enabled: true, storage: "memory", customRules: { "/sign-in/username": false } },
  advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] } },
  plugins: [username(), admin(), signInLimitPlugin(limiters)],
  logger: { disabled: true },
});

let ipCounter = 0;
/** A fresh address per scenario: the per-address counters never mix. */
const nextIp = () => {
  const n = ipCounter++;
  return `10.0.${Math.floor(n / 250)}.${(n % 250) + 1}`;
};

type Handler = { handler: (request: Request) => Promise<Response> };

function post(target: Handler, path: string, body: unknown, ip: string) {
  return target.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": ip },
      body: JSON.stringify(body),
    })
  );
}

function signIn(user: string, password: string, ip: string, path = "/sign-in/username") {
  const body = path === "/sign-in/email" ? { email: `${user}@qualilab.local`, password } : { username: user, password };
  return post(auth, path, body, ip);
}

async function errorOf(response: Response) {
  const json = (await response.json()) as { code?: string; message?: string };
  return { status: response.status, code: json.code, message: json.message };
}

/** Moves the faked clock forward. */
function wait(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

const COLLEAGUES = ["tech1", "tech2", "valid1", "magasin1"];

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  for (const name of [...COLLEAGUES, "recep1", "banni"]) {
    await auth.api.signUpEmail({
      body: { email: `${name}@qualilab.local`, password: PASSWORD, name, username: name },
    });
  }
  const banned = db.user.find((row) => row.username === "banni");
  if (banned) banned.banned = true;
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  db.session.length = 0;
});

describe("per address: colleagues behind one NAT address", () => {
  it("a steady trickle — one sign-in every 2.5 s for 100 s from one address — all sign in", async () => {
    const ip = nextIp();
    for (let i = 0; i < 40; i += 1) {
      const response = await signIn(COLLEAGUES[i % COLLEAGUES.length], PASSWORD, ip);
      expect(response.status, `connexion ${i + 1}`).toBe(200);
      wait(2500);
    }
  }, 120_000);

  it("Better Auth's own rule, which this replaces, refuses that trickle: its count restarts only after a pause", async () => {
    // The production 429s of 25/11 (one sign-in every ~6 s under « 3 per
    // 10 s ») — the reason its sign-in rule is off. Its limiter counts every
    // request, so malformed bodies (422, no password check) do.
    const own = betterAuth({
      database: memoryAdapter(emptyDb()),
      secret: SECRET,
      baseURL: ORIGIN,
      emailAndPassword: { enabled: true },
      rateLimit: { enabled: true, storage: "memory", customRules: { "/sign-in/username": { window: 10, max: 10 } } },
      advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
      plugins: [username()],
      logger: { disabled: true },
    });
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await post(own, "/sign-in/username", { username: "x", password: "y" }, ip)).status);
      wait(2500);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });

  it("counts every request for one minute: the 31st within a minute is refused with the network's message, then the window slides", async () => {
    const ip = nextIp();
    // Cheap requests (refused 422 before any password check) count the same.
    for (let i = 0; i < SIGN_IN_ADDRESS_MAX - 1; i += 1) {
      const response = await post(auth, "/sign-in/username", { username: "x", password: "y" }, ip);
      expect(response.status, `requête ${i + 1}`).toBe(422);
      wait(1000);
    }
    expect((await signIn("tech1", PASSWORD, ip)).status).toBe(200);
    const refused = await signIn("tech2", PASSWORD, ip);
    expect(refused.status).toBe(429);
    const seconds = retryAfterFromHeaders(refused.headers);
    // The oldest request (29 s ago) leaves the window in 31 s.
    expect(seconds).toBe(31);
    const error = await errorOf(refused);
    expect(error.code).toBe(SIGN_IN_ADDRESS_LIMIT_CODE);
    expect(error.message).toBe("Trop de tentatives de connexion depuis ce réseau. Réessayez dans 31 secondes.");
    // The form says it is the network, not the password.
    expect(signInErrorMessage(error, seconds)).toBe(error.message);
    // Another address is not affected.
    expect((await signIn("tech2", PASSWORD, nextIp())).status).toBe(200);
    // Once the oldest request has left the window, the address signs in again.
    wait(seconds * 1000);
    expect((await signIn("tech2", PASSWORD, ip)).status).toBe(200);
  }, 60_000);
});

describe("per account and address: 10 wrong passwords per 15 minutes", () => {
  it("refuses the guessing address — even the right password — and lets the colleague in from the laboratory", async () => {
    const attacker = nextIp();
    const lab = nextIp();
    for (let i = 0; i < SIGN_IN_MAX_FAILURES; i += 1) {
      const response = await signIn("valid1", "mauvais", attacker);
      expect(response.status, `essai ${i + 1}`).toBe(401);
      expect((await errorOf(response)).code).toBe("INVALID_USERNAME_OR_PASSWORD");
    }
    const refused = await signIn("valid1", PASSWORD, attacker);
    expect(refused.status).toBe(429);
    const error = await errorOf(refused);
    expect(error.code).toBe(SIGN_IN_LOCKED_CODE);
    expect(error.message).toBe("Trop de mots de passe erronés pour ce compte. Réessayez dans 15 minutes.");
    const seconds = retryAfterFromHeaders(refused.headers);
    expect(seconds).toBeGreaterThan(14 * 60);
    expect(seconds).toBeLessThanOrEqual(15 * 60);
    expect(signInErrorMessage(error, seconds)).toBe(
      "Trop de mots de passe erronés pour ce compte. Réessayez dans 15 minutes."
    );
    // The same account written differently is the same account.
    expect((await signIn("VALID1", PASSWORD, attacker)).status).toBe(429);
    // The account is not modified, no session was opened.
    expect(db.user.find((user) => user.username === "valid1")?.banned).toBeFalsy();
    expect(db.session).toHaveLength(0);
    // Its owner, from the laboratory's address, signs in.
    expect((await signIn("valid1", PASSWORD, lab)).status).toBe(200);
    // Other accounts sign in from the guessing address too.
    expect((await signIn("tech2", PASSWORD, attacker)).status).toBe(200);
  }, 60_000);

  it("a sign-in clears the count", async () => {
    const ip = nextIp();
    for (let i = 0; i < SIGN_IN_MAX_FAILURES - 1; i += 1) {
      expect((await signIn("magasin1", "mauvais", ip)).status).toBe(401);
    }
    expect((await signIn("magasin1", PASSWORD, ip)).status).toBe(200);
    for (let i = 0; i < SIGN_IN_MAX_FAILURES - 1; i += 1) {
      expect((await signIn("magasin1", "mauvais", ip)).status).toBe(401);
    }
    expect((await signIn("magasin1", PASSWORD, ip)).status).toBe(200);
  }, 60_000);

  it("counts an unknown username the same way: the refusal tells nobody which accounts exist", async () => {
    const ip = nextIp();
    for (let i = 0; i < SIGN_IN_MAX_FAILURES; i += 1) {
      expect((await signIn("personne", "mauvais", ip)).status).toBe(401);
    }
    const refused = await signIn("personne", "mauvais", ip);
    expect(refused.status).toBe(429);
    expect((await errorOf(refused)).code).toBe(SIGN_IN_LOCKED_CODE);
  }, 60_000);

  it("a disabled account answers BANNED_USER — « Ce compte est désactivé » — and is not counted as a wrong password", async () => {
    const before = [limiters.pair.size, limiters.account.size];
    const response = await signIn("banni", PASSWORD, nextIp());
    expect(response.status).toBe(403);
    const error = await errorOf(response);
    expect(error.code).toBe("BANNED_USER");
    expect(signInErrorMessage(error)).toBe("Ce compte est désactivé. Contactez l'administrateur.");
    expect([limiters.pair.size, limiters.account.size]).toEqual(before);
  });

  it("a wrong password says « Identifiants incorrects. »", async () => {
    const ip = nextIp();
    const response = await signIn("tech2", "mauvais", ip);
    expect(signInErrorMessage(await errorOf(response))).toBe("Identifiants incorrects.");
    expect((await signIn("tech2", PASSWORD, ip)).status).toBe(200);
  });
});

describe("per account, every address: 100 wrong passwords per 15 minutes", () => {
  it("guessing spread over ten addresses refuses the account everywhere; other accounts are untouched", async () => {
    const addresses = SIGN_IN_ACCOUNT_MAX_FAILURES / SIGN_IN_MAX_FAILURES;
    for (let a = 0; a < addresses; a += 1) {
      const ip = nextIp();
      for (let i = 0; i < SIGN_IN_MAX_FAILURES; i += 1) {
        expect((await signIn("recep1", "mauvais", ip)).status, `adresse ${a + 1}, essai ${i + 1}`).toBe(401);
      }
    }
    const refused = await signIn("recep1", PASSWORD, nextIp());
    expect(refused.status).toBe(429);
    expect((await errorOf(refused)).code).toBe(SIGN_IN_LOCKED_CODE);
    expect((await signIn("tech1", PASSWORD, nextIp())).status).toBe(200);
    // The window ends: the account signs in again.
    wait(15 * 60 * 1000 + 1);
    expect((await signIn("recep1", PASSWORD, nextIp())).status).toBe(200);
  }, 300_000);
});

describe("server-side calls (auth.api, no HTTP request) skip the per-address limit", () => {
  it("never counts towards an address", async () => {
    const before = limiters.address.size;
    await auth.api.signInUsername({ body: { username: "tech1", password: PASSWORD } });
    expect(limiters.address.size).toBe(before);
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

  it("turns Better Auth's own sign-in rule off (the plugin limits it), keeps its limit elsewhere and the address headers", () => {
    expect(config).toMatch(/rateLimit:\s*\{\s*customRules:\s*\{\s*"\/sign-in\/username":\s*false,?\s*\}/);
    expect(config).toMatch(/ipAddressHeaders:\s*\["x-real-ip",\s*"x-forwarded-for"\]/);
    // Not turned off as a whole: Better Auth's default (production only) stands.
    expect(config).not.toMatch(/enabled:\s*false/);
  });

  it("installs the sign-in limits and closes /sign-in/email", () => {
    expect(config).toMatch(/signInLimitPlugin\(\),/);
    const start = config.indexOf("disabledPaths: [");
    const disabled = config.slice(start, config.indexOf("],", start));
    expect(disabled).toContain('"/sign-in/email"');
  });

  it("@better-auth/core (the plugin's request state) is a declared dependency, one copy shared with better-auth", () => {
    // Two copies would give the plugin a request state Better Auth never opens.
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@better-auth/core"]).toBe(pkg.dependencies["better-auth"]);
    const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const betterAuthPackage = readJson(join(root, "node_modules/better-auth/package.json")) as {
      dependencies: Record<string, string>;
    };
    // No copy of its own under better-auth: it uses the application's.
    expect(existsSync(join(root, "node_modules/better-auth/node_modules/@better-auth/core"))).toBe(false);
    expect(readJson(join(root, "node_modules/@better-auth/core/package.json")).version).toBe(
      betterAuthPackage.dependencies["@better-auth/core"]
    );
  });

  it("nothing signs in over HTTP through /sign-in/email (the form and the demo panel use /sign-in/username)", () => {
    const login = readFileSync(join(root, "src/components/LoginForm.tsx"), "utf8");
    expect(login).toMatch(/authClient\.signIn\.username\(/);
    expect(login).not.toMatch(/signIn\.email/);
  });
});
