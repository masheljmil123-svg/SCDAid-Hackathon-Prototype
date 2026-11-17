import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage.jsx'
import { DemoCasesPage } from './pages/DemoCasesPage.jsx'
import { AssessmentPage } from './pages/AssessmentPage.jsx'
import { InsightsLoginPage } from './pages/insights/InsightsLoginPage.jsx'
import { InsightsDashboardPage } from './pages/insights/InsightsDashboardPage.jsx'
import { FeedbackWidget } from './components/feedback/FeedbackWidget.jsx'
import './App.css'
import './assessment.css'
import './styles/insights.css'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/demo" element={<DemoCasesPage />} />
        <Route path="/demo/:caseId" element={<AssessmentPage />} />
        <Route path="/demo/:caseId/recommendation" element={<AssessmentPage />} />
        <Route path="/insights/login" element={<InsightsLoginPage />} />
        <Route path="/insights" element={<InsightsDashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FeedbackWidget />
    </>
  )
}

export default App
