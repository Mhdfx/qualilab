import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/roles";

/**
 * Origins allowed to call the auth endpoints (CSRF protection).
 *
 * Production origins come from BETTER_AUTH_TRUSTED_ORIGINS (comma-separated).
 * In development any localhost port is accepted, so the app can be served on
 * whichever port is free without breaking sign-in.
 */
function trustedOrigins(request?: Request): string[] {
  const configured = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production") return configured;

  // Development: accept whichever localhost port the app is served on.
  const origin = request?.headers?.get("origin");
  const isLocal =
    !!origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  return isLocal ? [...configured, origin] : configured;
}

/**
 * Better Auth server instance.
 *
 * Authentication (accounts, sessions, passwords) is handled here; the 7-role
 * *authorization* lives in `@/lib/auth` (`requireRole`) on top of it.
 *
 * Lab staff sign in with a username — Better Auth still stores an email per
 * user, so accounts created by the admin get a synthetic internal address
 * (see `internalEmailFor`). No mail is ever sent to it.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  secret: process.env.AUTH_SECRET,
  // Set BETTER_AUTH_URL to the public origin in production (e.g.
  // https://app.qualilab.ma). Left unset, the origin is derived from the
  // request, which is what we want on the VPS behind a reverse proxy.
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    // Internal tool: accounts are provisioned by the admin, not self-service.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "PRELEVEUR",
        input: false,
      },
      // PORTAIL.md §1: the client a CLIENT (portal) account belongs to. Set
      // by the administrator only (POST /api/admin/users passes it to
      // createUser, so the account and its client are written in one
      // insert); `input: false` keeps it out of the self-service
      // update-user endpoint. The portal reads it again from the database
      // on every request (src/lib/portal-server.ts), never from the cookie.
      clientId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  // Accounts are disabled, never deleted: every signature in the circuit
  // (validatedById, approvedById, audit actors…) points at a user row, and
  // the admin plugin's hard delete would null them all. 404 on that path.
  //
  // Self-service endpoints no screen uses are closed over HTTP too — every
  // account, a client's portal account included (PORTAIL.md §3), changes
  // only what the application's own audited routes let it change:
  // - /update-user: would let any account rename itself or change its
  //   identifier, which the administrator manages (/admin/utilisateurs);
  // - /update-session: no session field is meant to be written;
  // - /change-password: the portal's « Mon compte » goes through
  //   POST /api/portail/compte/mot-de-passe (journal USER_PASSWORD_CHANGED,
  //   French messages), which calls `auth.api.changePassword` server-side —
  //   `disabledPaths` only applies to HTTP requests, not to `auth.api.*`;
  // - /is-username-available: an anonymous oracle of who has an account.
  disabledPaths: [
    "/admin/remove-user",
    "/update-user",
    "/update-session",
    "/change-password",
    "/is-username-available",
  ],
  advanced: {
    cookiePrefix: "qualilab",
    useSecureCookies:
      process.env.AUTH_COOKIE_SECURE === "false"
        ? false
        : process.env.NODE_ENV === "production",
  },
  plugins: [
    username({
      // The same rule as the administration screen (3–30 characters, letters,
      // digits, « . _ - »): the plugin's default refuses a hyphen, and the
      // account creation would die with a 500 instead of a message.
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => /^[a-z0-9._-]{3,30}$/i.test(value),
    }),
    admin({
      adminRoles: ["ADMIN"],
      defaultRole: "PRELEVEUR",
    }),
  ],
});

/** Synthetic address for username-only lab accounts. Never receives mail. */
export function internalEmailFor(userName: string) {
  return `${userName.trim().toLowerCase()}@qualilab.local`;
}

export const APP_ROLES = ROLES;
