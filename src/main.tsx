
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { AudioProvider } from './components/AudioProvider'

createRoot(document.getElementById('root')!).render(
  <AudioProvider>
    <App />
  </AudioProvider>
)
