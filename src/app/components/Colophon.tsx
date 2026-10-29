import { Link } from 'react-router';

export function Colophon() {
  return (
    <footer className="colophon">
      <div className="colophon__inner">
        <p>Unofficial fan project. Not affiliated with Twenty One Pilots or Fueled By Ramen.</p>
        <p><Link to="/support">If you are struggling →</Link></p>
      </div>
    </footer>
  );
}
