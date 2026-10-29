import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The browser only ever uses Supabase to sign in, sign out and reset
// passwords. Game data goes through our own API, never straight to the
// database -- and the database refuses it anyway (see the migrations).

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          // PKCE: email links carry a one-time code rather than a live token
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const authConfigured = supabase !== null;
