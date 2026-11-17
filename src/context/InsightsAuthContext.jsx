import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { fetchInsightsProfile } from '../lib/insightsApi.js'
import { supabase, supabaseConfigured } from '../lib/supabaseClient.js'

const InsightsAuthContext = createContext(null)

export function InsightsAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(supabaseConfigured)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setLoading(false)
      return undefined
    }

    let active = true

    async function applySession(nextSession) {
      setSession(nextSession)
      if (!nextSession?.user) {
        setProfile(null)
        setLoading(false)
        return
      }
      try {
        const nextProfile = await fetchInsightsProfile(nextSession.user.id)
        if (!active) return
        setProfile(nextProfile)
      } catch {
        if (!active) return
        setProfile(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true)
      applySession(nextSession)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      configured: supabaseConfigured,
      loading,
      session,
      user: session?.user || null,
      profile,
      role: profile?.role || null,
      isAdmin: profile?.role === 'admin',
      isSupervisor: profile?.role === 'supervisor',
      canReview: profile?.role === 'admin' || profile?.role === 'supervisor',
      async signIn(email, password) {
        if (!supabase) throw new Error('Supabase is not configured.')
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message)
        const nextProfile = await fetchInsightsProfile(data.user.id)
        if (!nextProfile) {
          await supabase.auth.signOut()
          throw new Error('This account is not authorized for the Insights dashboard.')
        }
        setSession(data.session)
        setProfile(nextProfile)
        return nextProfile
      },
      async signOut() {
        if (!supabase) return
        await supabase.auth.signOut()
        setSession(null)
        setProfile(null)
      },
    }),
    [loading, profile, session],
  )

  return (
    <InsightsAuthContext.Provider value={value}>{children}</InsightsAuthContext.Provider>
  )
}

export function useInsightsAuth() {
  const value = useContext(InsightsAuthContext)
  if (!value) throw new Error('useInsightsAuth must be used within InsightsAuthProvider')
  return value
}
