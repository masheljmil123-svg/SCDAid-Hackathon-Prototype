import { ArrowRight, BookOpen, Check, Cpu, Dna } from 'lucide-react'
import { Link } from 'react-router-dom'
import bloodBg from '../assets/scdaid-bg.png'

const FEATURES = [
  { icon: BookOpen, title: 'Evidence-Based', line: 'Guidelines' },
  { icon: Dna, title: 'Pharmacogenomics', line: '(CYP2D6)' },
  { icon: Cpu, title: 'AI-Powered', line: 'Recommendations' },
]

const CHECKS = [
  'Clinical safety checks',
  'Genetic considerations',
  'Predicted treatment response',
  'Demo recommendation workflow',
]

export function Hero() {
  return (
    <section className="hero" id="home">
      <div
        className="hero-cells"
        aria-hidden="true"
        style={{ backgroundImage: `url(${bloodBg})` }}
      />
      <div className="hero-cells-depth" aria-hidden="true">
        <span className="hero-blob hero-blob-a" />
        <span className="hero-blob hero-blob-b" />
        <span className="hero-blob hero-blob-c" />
      </div>

      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-eyebrow">Interactive Prototype</p>
          <h1 className="hero-title">
            <span>Smarter Opioid Decisions.</span>
            <span className="hero-title-red">Better Care for Sickle Cell.</span>
          </h1>
          <p className="hero-lead">
            Explore how SCDAid organizes patient data, safety checks, and
            pharmacogenomic context to support individualized opioid selection
            for adult vaso-occlusive crisis.
          </p>

          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" to="/demo">
              Select a Demo Patient
              <ArrowRight size={16} />
            </Link>
            <button
              type="button"
              className="btn btn-outline btn-lg"
              onClick={() =>
                document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Learn More
            </button>
          </div>

          <ul className="hero-features">
            {FEATURES.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.title}>
                  <span className="hero-feature-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <em>{item.line}</em>
                  </span>
                </li>
              )
            })}
          </ul>

          <p className="hero-tag">Safer decisions. Stronger tomorrows.</p>
        </div>

        <aside className="hero-card">
          <p className="hero-script">
            From data
            <br />
            to better days
          </p>

          <Link className="hero-rec-strip" to="/demo">
            <span className="hero-rec-icon">
              <Dna size={18} />
            </span>
            <span>
              Interactive
              <strong>Demo Recommendation</strong>
            </span>
            <ArrowRight size={18} />
          </Link>

          <ul className="hero-checks">
            {CHECKS.map((label) => (
              <li key={label}>
                <span>
                  <Check size={12} strokeWidth={3} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}
