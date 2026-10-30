import { createBrowserRouter } from 'react-router';
import { RequireAccess, RequireAdmin, RequireSession } from './auth/guards.tsx';
import { Shell } from './components/Shell.tsx';
import { Admin } from './pages/Admin.tsx';
import { AdminDiagnostics, AdminPlayer, AdminPlayers } from './pages/AdminViews.tsx';
import { Archive, ArchiveRecord } from './pages/Archive.tsx';
import { Campaigns } from './pages/Campaigns.tsx';
import { Denied } from './pages/Denied.tsx';
import { Enter } from './pages/Enter.tsx';
import { Hub } from './pages/Hub.tsx';
import { Intake } from './pages/Intake.tsx';
import { Mission } from './pages/Mission.tsx';
import { Notebook } from './pages/Notebook.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { ResetPassword, UpdatePassword } from './pages/Passwords.tsx';
import { Profile } from './pages/Profile.tsx';
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
          { path: '/missions/:id', element: <Mission /> },
          { path: '/archive', element: <Archive /> },
          { path: '/archive/:id', element: <ArchiveRecord /> },
          { path: '/notebook', element: <Notebook /> },
          { path: '/profile', element: <Profile /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: '/admin', element: <Admin /> },
              { path: '/admin/players', element: <AdminPlayers /> },
              { path: '/admin/players/:username', element: <AdminPlayer /> },
              { path: '/admin/diagnostics', element: <AdminDiagnostics /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFound /> },
]);
