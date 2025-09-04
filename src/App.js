// src/App.js
import React from 'react';
import Assistant from './components/Assistant';
import History from './components/History';
import HumeDemoPage from './components/HumeDemo';
import { VoiceProvider } from '@humeai/voice-react';

export default function App() {
  const path = window.location.pathname;
  if (path === '/history') return <History />;
  if (path === '/hume-demo') return <HumeDemoPage />;
  return(<VoiceProvider><Assistant /></VoiceProvider>);
}