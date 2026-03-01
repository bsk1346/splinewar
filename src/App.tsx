import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Menu } from './components/Menu';
import { CanvasRenderer } from './components/CanvasRenderer';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import './index.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/single" element={<CanvasRenderer />} />
        <Route path="/multi" element={<MultiplayerLobby />} />
      </Routes>
    </Router>
  );
}

export default App;
