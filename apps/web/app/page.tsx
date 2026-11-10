import Link from "next/link";

const topics = [
  {
    number: "01",
    icon: "△",
    title: "Saobraćajni znakovi",
    text: "Prepoznaj znak. Razumi poruku.",
    tag: "Signalizacija",
  },
  {
    number: "02",
    icon: "↱",
    title: "Prvenstvo prolaza",
    text: "Ko prolazi prvi? Razjasni dileme.",
    tag: "Raskrsnice",
  },
  {
    number: "03",
    icon: "◎",
    title: "Bezbedna vožnja",
    text: "Male navike. Velika razlika.",
    tag: "Pravila i ponašanje",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> ZNANJE KOJE IDE S TOBOM
          </p>
          <h1 id="hero-title">
            Dobar vozač
            <br />
            zna <span>zašto.</span>
          </h1>
          <p className="hero-description">
            Saobraćajna pravila imaju smisla kada ih razumeš. Uskoro vežbaj svojim tempom i izazovi
            prijatelja na duel znanja.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/vezbanje">
              Istraži vežbanje <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link" href="/duel">
              Kako funkcioniše duel <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className="hero-note">
            <span aria-hidden="true">✓</span> Bez naloga <span aria-hidden="true">·</span> Bez
            plaćanja <span aria-hidden="true">·</span> Za stvarno znanje
          </p>
        </div>
        <div
          className="hero-art"
          role="img"
          aria-label="Ilustracija raskrsnice sa dva automobila i putanjama kretanja"
        >
          <div className="art-grid" />
          <span className="art-label">SVAKI PUT JE PRILIKA DA ZNAŠ VIŠE.</span>
          <div className="road road-horizontal" />
          <div className="road road-vertical" />
          <div className="crosswalk crosswalk-left" />
          <div className="crosswalk crosswalk-right" />
          <div className="car car-blue">
            <i />
            <i />
          </div>
          <div className="car car-orange">
            <i />
            <i />
          </div>
          <div className="route route-blue" />
          <div className="route route-orange" />
          <span className="art-sign">!</span>
          <span className="art-card">
            <span className="status-dot" /> Tvoj sledeći potez?
            <strong>
              Prvo razumevanje.
              <br />
              Onda samopouzdanje.
            </strong>
          </span>
          <span className="art-coordinate">44°48′ N &nbsp; 20°28′ E</span>
        </div>
      </section>
      <div className="principles">
        <div className="container principles-inner">
          <p>
            <span aria-hidden="true">↗</span> Uči svojim tempom
          </p>
          <p>
            <span aria-hidden="true">◇</span> Razumi svako pravilo
          </p>
          <p>
            <span aria-hidden="true">⇄</span> Izazovi prijatelja
          </p>
          <span className="small-label">USKORO NA TVOM EKRANU</span>
        </div>
      </div>
      <section className="container topics" aria-labelledby="topics-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OD OSNOVA DO SIGURNOSTI</p>
            <h2 id="topics-title">Znanje, deo po deo.</h2>
          </div>
          <p>
            Tri oblasti za dobar početak.
            <br />
            Pitanja i objašnjenja su u pripremi.
          </p>
        </div>
        <div className="topic-grid">
          {topics.map((topic) => (
            <article className="topic-card" key={topic.number}>
              <div className="topic-top">
                <span className="topic-icon" aria-hidden="true">
                  {topic.icon}
                </span>
                <span className="topic-number">/{topic.number}</span>
              </div>
              <p className="topic-tag">{topic.tag}</p>
              <h3>{topic.title}</h3>
              <p>{topic.text}</p>
              <span className="topic-status">
                U pripremi <span aria-hidden="true">↗</span>
              </span>
            </article>
          ))}
        </div>
      </section>
      <section className="container">
        <div className="duel-banner">
          <div>
            <p className="eyebrow">DVA IGRAČA. PET PITANJA.</p>
            <h2>
              Isto pitanje.
              <br />
              Prijateljski izazov.
            </h2>
            <p>
              Podeli link ili QR kod, odgovori na pet pitanja i uporedi znanje. Bez registracije, uz
              objašnjenja koja ostaju i posle duela.
            </p>
            <Link className="button button-light" href="/duel">
              Upoznaj duel <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="duel-graphic" aria-hidden="true">
            <span className="player player-one">TI</span>
            <span className="versus">vs</span>
            <span className="player player-two">DRUGAR</span>
            <span className="graphic-caption">ZNANJE JE BOLJE U DRUŠTVU.</span>
          </div>
        </div>
      </section>
      <section className="container closing">
        <p className="eyebrow">PRAVILA RAZUMEMO. BEZBEDNOST BIRAMO.</p>
        <h2>Na putu smo zajedno.</h2>
        <p>
          Gradimo besplatno mesto za učenje. Prva verzija je u izradi,
          <br className="desktop-break" /> a svako pitanje prolazi proveru pre objavljivanja.
        </p>
        <Link className="text-link" href="/o-projektu">
          Više o projektu <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </>
  );
}
