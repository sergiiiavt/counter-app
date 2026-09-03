import assert from "node:assert/strict";
import test from "node:test";
import { parseJwt, verifyJwtWithJwks, AuthError } from "../src/auth.js";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function signedJwt({ audience = "com.sergiiiavt.counterapp", issuer = "https://appleid.apple.com", expOffset = 300 } = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: "test-key", typ: "JWT" };
  const payload = { iss: issuer, aud: audience, sub: "apple-subject", iat: now, exp: now + expOffset };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    pair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return {
    token: `${signingInput}.${base64Url(new Uint8Array(signature))}`,
    jwks: { keys: [publicJwk] },
    now,
  };
}

test("parseJwt rejects malformed values", () => {
  assert.throws(() => parseJwt("not-a-jwt"), AuthError);
});

test("verifyJwtWithJwks accepts a correctly signed token", async () => {
  const fixture = await signedJwt();
  const payload = await verifyJwtWithJwks(fixture.token, {
    issuer: "https://appleid.apple.com",
    audiences: ["com.sergiiiavt.counterapp"],
    jwks: fixture.jwks,
    nowSeconds: fixture.now,
  });
  assert.equal(payload.sub, "apple-subject");
});

test("verifyJwtWithJwks rejects a wrong audience", async () => {
  const fixture = await signedJwt();
  await assert.rejects(
    verifyJwtWithJwks(fixture.token, {
      issuer: "https://appleid.apple.com",
      audiences: ["wrong.client"],
      jwks: fixture.jwks,
      nowSeconds: fixture.now,
    }),
    /audience/i,
  );
});

test("verifyJwtWithJwks rejects an expired token", async () => {
  const fixture = await signedJwt({ expOffset: -300 });
  await assert.rejects(
    verifyJwtWithJwks(fixture.token, {
      issuer: "https://appleid.apple.com",
      audiences: ["com.sergiiiavt.counterapp"],
      jwks: fixture.jwks,
      nowSeconds: fixture.now,
      clockSkewSeconds: 0,
    }),
    /expired/i,
  );
});
