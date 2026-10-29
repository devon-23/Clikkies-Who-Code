import { Link } from 'react-router';
import { useSession } from '../auth/session.tsx';
import { Colophon } from '../components/Colophon.tsx';

// Out of the fiction entirely. The story this site borrows from is about
// depression, and Dema's religion is a religion of death. This page says so
// plainly, and points somewhere real.
export function Support() {
  const { me } = useSession();
  return (
    <div className="shell">
      <main id="main" className="shell__main support">
        <p className="kicker">Outside the story</p>
        <h1 className="page-head__title">If you are struggling</h1>
        <div className="prose support__body">
          <p>
            Dema is fiction, but what it stands for is not. The story this project borrows from is about depression and
            the pull to give up — and about holding on anyway, with help.
          </p>
          <p>If you are thinking about ending your life, or worried about someone who is, please talk to a person today.</p>
          <ul className="support__lines">
            <li><b>United States:</b> call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline), any time.</li>
            <li><b>Anywhere else:</b> <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com ↗</a> lists free, confidential lines by country.</li>
            <li><b>In immediate danger:</b> call your local emergency number.</li>
          </ul>
          <p>Talking to a friend, a family member or a doctor counts too. You do not have to have the words ready.</p>
        </div>
        <p className="support__back"><Link to={me?.access === 'granted' ? '/hub' : '/'}>← Back</Link></p>
      </main>
      <Colophon />
    </div>
  );
}
