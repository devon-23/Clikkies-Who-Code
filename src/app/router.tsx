import { createBrowserRouter, type RouteObject } from 'react-router';
import { RequireAccess, RequireAdmin, RequireSession } from './auth/guards.tsx';
import { Shell } from './components/Shell.tsx';
import { Admin } from './pages/Admin.tsx';
import { Campaigns } from './pages/Campaigns.tsx';
import { Denied } from './pages/Denied.tsx';
import { Enter } from './pages/Enter.tsx';
import { Hub } from './pages/Hub.tsx';
import { Intake } from './pages/Intake.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { ResetPassword, UpdatePassword } from './pages/Passwords.tsx';
import { Support } from './pages/Support.tsx';
import { Transmission } from './pages/Transmission.tsx';

export const router = createBrowserRouter([
  // open to anyone
  { path: '/', element: <Transmission /> },
  { path: '/enter', element: <Enter /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/update-password', element: <UpdatePassword /> },
  { path: '/support', element: <Support /> },

  // signed in, not yet through the door
  {
    element: <RequireSession />,
    children: [
      { path: '/intake', element: <Intake /> },
      { path: '/denied', element: <Denied /> },
    ],
  },

  // signed in, authorized, handle chosen
  {
    element: <RequireAccess />,
    children: [
      {
        element: <Shell />,
        children: [
          { path: '/hub', element: <Hub /> },
          { path: '/campaigns', element: <Campaigns /> },
          { element: <RequireAdmin />, children: [{ path: '/admin', element: <Admin /> }] },
        ],
      },
    ],
  },

  ...devPreview(),

  { path: '*', element: <NotFound /> },
]);

// /dev/preview/hub?as=admin etc. -- the signed-in pages with a fake session,
// for design work before Supabase exists. import.meta.env.DEV is replaced
// with false in production builds, so this route and its module never ship.
function devPreview(): RouteObject[] {
  if (!import.meta.env.DEV) return [];
  return [{
    path: '/dev/preview',
    lazy: async () => ({ Component: (await import('./dev/Preview.tsx')).PreviewSession }),
    children: [
      {
        element: <Shell />,
        children: [
          { path: 'hub', element: <Hub /> },
          { path: 'campaigns', element: <Campaigns /> },
          { path: 'admin', element: <Admin /> },
        ],
      },
      { path: 'intake', element: <Intake /> },
      { path: 'denied', element: <Denied /> },
    ],
  }];
}
