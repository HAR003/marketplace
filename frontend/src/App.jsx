import { useEffect } from 'react'
import { BrowserRouter } from 'react-router'
import './App.css'
import AppRoutes from './Routes/AppRoutes.jsx'
import { useAuthStore } from './store/authStore.js'

function App() {
  // A page load loses the in-memory access token; the refresh cookie brings it back
  useEffect(() => {
    useAuthStore.getState().refreshSession()
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
