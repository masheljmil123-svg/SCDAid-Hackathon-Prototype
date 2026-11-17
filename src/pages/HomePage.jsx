import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Navbar } from '../components/Navbar.jsx'
import { Hero } from '../components/Hero.jsx'
import { InfoSection } from '../components/InfoSection.jsx'
import { TeamSection } from '../components/TeamSection.jsx'
import { Footer } from '../components/Footer.jsx'

export function HomePage() {
  const location = useLocation()

  useEffect(() => {
    const id = location.hash.replace('#', '')
    if (!id) return
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.hash])

  return (
    <div className="page">
      <Navbar />
      <Hero />
      <InfoSection />
      <TeamSection />
      <Footer />
    </div>
  )
}
