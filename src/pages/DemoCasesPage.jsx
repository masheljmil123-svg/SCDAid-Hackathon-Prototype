import { ArrowRight, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/Navbar.jsx'
import { Footer } from '../components/Footer.jsx'
import { DemoBanner } from '../components/DemoBanner.jsx'
import { DEMO_CASES } from '../data/demoCases.js'

export function DemoCasesPage() {
  return (
    <div className="page">
      <Navbar ctaLabel="Back Home" ctaTo="/" />
      <DemoBanner />

      <main className="demo-page">
        <header className="demo-page-head">
          <p className="info-kicker">Demo workflow</p>
          <h1>Select a Demo Patient</h1>
          <p>
            Four fictional VOC scenarios. Open the full Patient Assessment
            interface, browse the pre-filled clinical inputs, then view the
            predefined recommendation.
          </p>
        </header>

        <div className="case-grid">
          {DEMO_CASES.map((item, index) => (
            <article key={item.id} className={`case-card case-card--${item.tone}`}>
              <div className="case-card-top">
                <span className="case-code">{item.code}</span>
                <span className="case-index">0{index + 1}</span>
              </div>
              <div className="case-avatar" aria-hidden="true">
                <UserRound size={22} />
              </div>
              <h2>{item.name}</h2>
              <p className="case-title">{item.shortTitle}</p>
              <p className="case-copy">{item.scenario}</p>
              <p className={`case-chip case-chip--${item.tone}`}>{item.highlight}</p>
              <Link className="btn btn-primary case-cta" to={`/demo/${item.id}`}>
                Open Assessment
                <ArrowRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
