import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthUser } from '../env.ts';

// Supabase signs each session's access token with a private key and publishes
// the matching public keys at a well-known URL (a "JWKS"). We fetch those once
// per Worker instance and check every token against them, so the API can tell
// who is calling without asking Supabase on every request -- and without ever
// holding a secret that could forge a token.

export type TokenVerifier = (token: string) => Promise<AuthUser | null>;

export function verifierFor(keys: JWTVerifyGetKey, issuer: string): TokenVerifier {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: 'authenticated',
      });
      if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
      return { id: payload.sub, email: payload.email.toLowerCase() };
    } catch {
      // expired, wrong signature, wrong issuer -- all the same to the caller
      return null;
    }
  };
}

const cache = new Map<string, TokenVerifier>();

export function supabaseVerifier(supabaseUrl: string): TokenVerifier | null {
  if (!supabaseUrl) return null;
  const base = supabaseUrl.replace(/\/+$/, '');
  let verifier = cache.get(base);
  if (!verifier) {
    const keys = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
    verifier = verifierFor(keys, `${base}/auth/v1`);
    cache.set(base, verifier);
  }
  return verifier;
}
