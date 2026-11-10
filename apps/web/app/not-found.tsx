import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container info-page">
      <p className="eyebrow">404 · POGREŠNO SKRETANJE</p>
      <h1>
        Ova stranica
        <br />
        ne postoji.
      </h1>
      <Link className="button" href="/">
        Vrati se na početnu →
      </Link>
    </section>
  );
}
