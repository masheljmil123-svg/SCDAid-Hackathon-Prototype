import { Sparkles } from 'lucide-react'
import { DEMO_BANNER } from '../data/demoCases.js'

export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <Sparkles size={14} aria-hidden="true" />
      <span>{DEMO_BANNER}</span>
    </div>
  )
}
