import { Route, Routes } from 'react-router-dom'
import BookingPage from './pages/BookingPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<BookingPage />} />
    </Routes>
  )
}

export default App
