import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';

// self-hosted, latin only: no third-party font requests, nothing to leak
import '@fontsource/michroma/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/document.css';
import './styles/system.css';
import './styles/pages.css';
import './styles/investigation.css';

import type { ComponentType, ReactNode } from 'react';
import { SessionProvider } from './auth/session.tsx';

// Development only: /dev/preview switches the app to a fake session and a
// fake API, for design work without Supabase. import.meta.env.DEV is `false`
// in production builds, so this branch and the module it loads never ship.
let Provider: ComponentType<{ children: ReactNode }> = SessionProvider;
if (import.meta.env.DEV) {
  const preview = await import('./dev/Preview.tsx');
  Provider = preview.activate() ?? SessionProvider;
}

// loaded after the preview may have rewritten the URL: the router reads the
// location once, when it is created
const { router } = await import('./router.tsx');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);
