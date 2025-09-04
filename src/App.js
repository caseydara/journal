// src/App.js
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Assistant from "./components/Assistant";
import History from "./components/History";
import HumeDemoPage from "./components/HumeDemo";
import { VoiceProvider } from "@humeai/voice-react";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/history" element={<History />} />
        <Route path="/hume-demo" element={<HumeDemoPage />} />
        <Route path="/" element={<VoiceProvider><Assistant /></VoiceProvider>} />
      </Routes>
    </BrowserRouter>
  );
}
