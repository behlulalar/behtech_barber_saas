import { Route, Routes } from 'react-router-dom'
import BookingPage from './pages/BookingPage'
import BookingFlow from './pages/BookingFlow'

function App() {
  return (
    <Routes>
      <Route path="/" element={<BookingPage />} />
      <Route path="/randevu" element={<BookingFlow />} />
    </Routes>
  )
}

export default App
