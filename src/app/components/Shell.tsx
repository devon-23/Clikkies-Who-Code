import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useSession } from '../auth/session.tsx';
import { Colophon } from './Colophon.tsx';
import { Seal } from './Seal.tsx';

// The recovered machine around every signed-in page.
export function Shell() {
  const { me, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  const links = [
    { to: '/hub', label: 'Network' },
    { to: '/campaigns', label: 'Campaigns' },
    ...(me?.profile?.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/hub" className="masthead__brand">
            <Seal />
            <span>
              <span className="masthead__name">Clikkies Who Code</span>
              <span className="masthead__node">DMAORG · RECOVERED NODE</span>
            </span>
          </Link>

          <button
            type="button"
            className="button button--small masthead__menu"
            aria-expanded={open}
            aria-controls="masthead-drawer"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Close' : 'Menu'}
          </button>

          <div className="masthead__drawer" id="masthead-drawer" data-open={open}>
            <nav className="nav" aria-label="Main">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} className="nav__link">{l.label}</NavLink>
              ))}
            </nav>
            <div className="masthead__who">
              <span>handle <b>{me?.profile?.username}</b></span>
              <button type="button" className="button button--small" onClick={() => void signOut()}>Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="shell__main" tabIndex={-1}>
        <Outlet />
      </main>
      <Colophon />
    </div>
  );
}
