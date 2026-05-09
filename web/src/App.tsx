import { Routes, Route } from 'react-router-dom';
import Home from './screens/Home.js';
import Lobby from './screens/Lobby.js';
import Match from './screens/Match.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/match/:id" element={<Match />} />
    </Routes>
  );
}
