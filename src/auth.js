const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_JWKS_TTL_MS = 60 * 60 * 1000;
const SESSION_PREFIX = "ctr_";

let appleJwksCache = { expiresAt: 0, keys: [] };

export class AuthError extends Error {
  constructor(message, status = 401, code = "invalid_authentication") {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeJsonSegment(segment, label) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
  } catch {
    throw new AuthError(`Invalid JWT ${label}.`);
  }
}

export function parseJwt(token) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new AuthError("Invalid JWT format.");
  }

  return {
    header: decodeJsonSegment(parts[0], "header"),
    payload: decodeJsonSegment(parts[1], "payload"),
    signingInput: new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    signature: decodeBase64Url(parts[2]),
  };
}

function normalizeAudience(audience) {
  if (Array.isArray(audience)) return audience.filter((value) => typeof value === "string");
  return typeof audience === "string" ? [audience] : [];
}

export async function verifyJwtWithJwks(
  token,
  { issuer, audiences, jwks, nowSeconds = Math.floor(Date.now() / 1000), clockSkewSeconds = 60 },
) {
  const parsed = parseJwt(token);
  const { header, payload } = parsed;

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new AuthError("Unsupported JWT signing algorithm or key.");
  }

  const jwk = (jwks?.keys ?? []).find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) throw new AuthError("JWT signing key was not found.");

  let key;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new AuthError("JWT signing key is invalid.");
  }

  const signatureValid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    parsed.signature,
    parsed.signingInput,
  );
  if (!signatureValid) throw new AuthError("JWT signature is invalid.");

  if (payload.iss !== issuer) throw new AuthError("JWT issuer is invalid.");

  const allowedAudiences = new Set(audiences);
  const tokenAudiences = normalizeAudience(payload.aud);
  if (!tokenAudiences.some((audience) => allowedAudiences.has(audience))) {
    throw new AuthError("JWT audience is invalid.");
  }

  if (!Number.isFinite(payload.exp) || payload.exp < nowSeconds - clockSkewSeconds) {
    throw new AuthError("JWT has expired.");
  }
  if (Number.isFinite(payload.nbf) && payload.nbf > nowSeconds + clockSkewSeconds) {
    throw new AuthError("JWT is not valid yet.");
  }
  if (Number.isFinite(payload.iat) && payload.iat > nowSeconds + clockSkewSeconds) {
    throw new AuthError("JWT issued-at time is invalid.");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new AuthError("JWT subject is missing.");
  }

  return payload;
}

function configuredAppleClientIds(env) {
  return String(env.APPLE_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function loadAppleJwks(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && appleJwksCache.keys.length && appleJwksCache.expiresAt > now) {
    return { keys: appleJwksCache.keys };
  }

  const response = await fetch(APPLE_JWKS_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new AuthError("Apple authentication keys are unavailable.", 503, "auth_provider_unavailable");
  }

  const payload = await response.json();
  if (!Array.isArray(payload.keys) || !payload.keys.length) {
    throw new AuthError("Apple authentication keys are invalid.", 503, "auth_provider_unavailable");
  }

  appleJwksCache = { keys: payload.keys, expiresAt: now + APPLE_JWKS_TTL_MS };
  return payload;
}

export async function verifyAppleIdentityToken(identityToken, env) {
  const audiences = configuredAppleClientIds(env);
  if (!audiences.length) {
    throw new AuthError("Apple authentication is not configured.", 503, "authentication_not_configured");
  }

  let jwks = await loadAppleJwks();
  try {
    return await verifyJwtWithJwks(identityToken, {
      issuer: APPLE_ISSUER,
      audiences,
      jwks,
    });
  } catch (error) {
    if (!(error instanceof AuthError) || !String(error.message).includes("signing key")) throw error;
    jwks = await loadAppleJwks(true);
    return verifyJwtWithJwks(identityToken, {
      issuer: APPLE_ISSUER,
      audiences,
      jwks,
    });
  }
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

function randomSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${SESSION_PREFIX}${encodeBase64Url(bytes)}`;
}

function sessionTtlDays(env) {
  const configured = Number(env.SESSION_TTL_DAYS ?? 30);
  if (!Number.isFinite(configured)) return 30;
  return Math.min(Math.max(Math.trunc(configured), 1), 90);
}

function bearerToken(request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function findSessionUser(db, rawToken) {
  if (!rawToken.startsWith(SESSION_PREFIX)) return null;
  const tokenHash = await sha256Base64Url(rawToken);
  const now = new Date().toISOString();
  const row = await db
    .prepare(`
      SELECT s.user_id, s.expires_at
      FROM auth_sessions s
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
      LIMIT 1
    `)
    .bind(tokenHash, now)
    .first();

  if (!row) return null;
  return { id: row.user_id, authMode: "session", sessionTokenHash: tokenHash };
}

export async function resolveUser(request, env) {
  const token = bearerToken(request);
  if (token) {
    const sessionUser = await findSessionUser(env.DB, token);
    if (!sessionUser) throw new AuthError("Session is invalid or expired.");
    return sessionUser;
  }

  if (String(env.DEMO_MODE).toLowerCase() === "true") {
    return { id: "demo-user", authMode: "demo", sessionTokenHash: null };
  }

  throw new AuthError("Authentication is required.");
}

export async function exchangeAppleIdentityToken(identityToken, env) {
  if (typeof identityToken !== "string" || !identityToken.trim()) {
    throw new AuthError("Apple identity token is required.", 400, "invalid_request");
  }

  const claims = await verifyAppleIdentityToken(identityToken.trim(), env);
  const userId = `apple:${claims.sub}`;
  const now = new Date();
  const nowIso = now.toISOString();
  const email = typeof claims.email === "string" ? claims.email : null;

  await env.DB
    .prepare(`
      INSERT INTO users (id, provider, provider_subject, email, created_at, updated_at)
      VALUES (?, 'apple', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = COALESCE(excluded.email, users.email),
        updated_at = excluded.updated_at
    `)
    .bind(userId, claims.sub, email, nowIso, nowIso)
    .run();

  const rawToken = randomSessionToken();
  const tokenHash = await sha256Base64Url(rawToken);
  const expires = new Date(now.getTime() + sessionTtlDays(env) * 24 * 60 * 60 * 1000);

  await env.DB
    .prepare(`
      INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, NULL)
    `)
    .bind(tokenHash, userId, nowIso, expires.toISOString())
    .run();

  return {
    token: rawToken,
    expiresAt: expires.toISOString(),
  };
}

export async function revokeCurrentSession(user, env) {
  if (!user.sessionTokenHash) return;
  await env.DB
    .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`)
    .bind(new Date().toISOString(), user.sessionTokenHash)
    .run();
}

export async function deleteUserAccount(user, env) {
  if (user.authMode === "demo") {
    throw new AuthError("The shared demo account cannot be deleted.", 400, "demo_account");
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM counter_entries WHERE user_id = ?`).bind(user.id),
    env.DB.prepare(`DELETE FROM counters WHERE user_id = ?`).bind(user.id),
    env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?`).bind(user.id),
    env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.id),
  ]);
}
