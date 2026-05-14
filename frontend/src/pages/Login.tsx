import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Input, Button, Alert } from '../components/ui'
import { Lock, User } from 'lucide-react'

interface LoginForm {
  username: string
  password: string
}

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const { theme } = useTheme()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()

  if (isAuthenticated) return <Navigate to="/" replace />

  const onSubmit = async (data: LoginForm) => {
    setError('')
    setLoading(true)
    try {
      await login(data.username, data.password)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white font-bold text-xl mb-4"
            style={{ background: theme.primaryColor }}
          >
            FX
          </div>
          <h1 className="text-2xl font-bold text-white">{theme.appName}</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-4">
              <Alert type="error" message={error} onClose={() => setError('')} />
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Username"
              placeholder="Enter your username"
              {...register('username', { required: 'Username is required' })}
              error={errors.username?.message}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              {...register('password', { required: 'Password is required' })}
              error={errors.password?.message}
            />
            <Button type="submit" className="w-full justify-center mt-2" size="lg" loading={loading}>
              Sign In
            </Button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          FX Ledger — Secure foreign exchange management
        </p>
      </div>
    </div>
  )
}
