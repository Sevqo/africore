export function Logo() {
  return (
    <a href="/" className="logo" aria-label="AfriCore home">
      <img
        src="/favicon.svg"
        alt=""
        className="brand-mark"
        width={32}
        height={32}
        aria-hidden="true"
      />
      AfriCore<span className="logo-period">.</span>
    </a>
  );
}
