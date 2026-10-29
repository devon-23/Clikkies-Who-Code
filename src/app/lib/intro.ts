// Whether this browser has already heard the opening transmission. The
// account remembers it too (profile.introSeenAt), so it follows the player
// across devices once they are signed in; this covers the signed-out visit.

const KEY = 'cwc:intro-seen';

export function introSeenHere(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false; // private mode, storage blocked: just play it
  }
}

export function markIntroSeenHere(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // nothing to do -- the account will remember once signed in
  }
}
