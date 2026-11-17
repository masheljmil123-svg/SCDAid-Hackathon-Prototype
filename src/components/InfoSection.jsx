import { Activity, Cpu, Dna, Shield } from 'lucide-react'

const PILLARS = [
  {
    icon: Activity,
    title: 'Clinical Data',
    copy: 'Age, genotype, pain severity, and VOC context inform first-line selection.',
  },
  {
    icon: Shield,
    title: 'Safety & Organ Function',
    copy: 'Renal and hepatic markers help flag agent-specific safety review.',
  },
  {
    icon: Dna,
    title: 'Pharmacogenomics',
    copy: 'CYP2D6 genotype and inhibitors are reviewed when data are available.',
  },
  {
    icon: Cpu,
    title: 'Ranked Guidance',
    copy: 'Candidate opioids are organized by eligibility and simulated response.',
  },
]

export function InfoSection() {
  return (
    <section className="info-section" id="about">
      <div className="info-inner">
        <p className="info-kicker">About SCDAid</p>
        <h2>How SCDAid Supports Clinical Decisions</h2>
        <p className="info-lead">
          SCDAid is a bedside decision-support workspace for adult vaso-occlusive
          crisis analgesia. This prototype lets you walk through predefined
          patient scenarios and review the recommendation workflow.
        </p>

        <ul className="info-grid" id="how">
          {PILLARS.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.title}>
                <span className="info-icon">
                  <Icon size={18} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
