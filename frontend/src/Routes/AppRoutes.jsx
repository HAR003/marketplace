import { Navigate, Route, Routes } from 'react-router'
import GoogleCallback from '../pages/GoogleCallback.jsx'
import HomePage from '../pages/HomePage.jsx'
import LoginPage from '../pages/LoginPage.jsx'
import RegisterPage from '../pages/RegisterPage.jsx'
import VerifyEmailPage from '../pages/VerifyEmailPage.jsx'
import GuestRoute from './GuestRoute.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<HomePage />} />
      </Route>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      {/* The link in the verification email; open to everyone */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      {/* Where Google sends the sign-in popup; it must load while the session is still being checked */}
      <Route path="/auth/google/callback" element={<GoogleCallback />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>

  )
}
