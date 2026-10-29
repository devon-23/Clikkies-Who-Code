import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="void">
      <p className="void__code">No such record</p>
      <p className="void__body">
        The file you asked for is not in the register. It may never have existed. It may have been removed. The archive
        does not distinguish between the two.
      </p>
      <p className="void__back"><Link to="/">← Return</Link></p>
    </div>
  );
}
