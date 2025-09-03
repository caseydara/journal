// src/App.js
import React from 'react';
import Assistant from './components/Assistant';
import History from './components/History';

export default function App() {
  const path = window.location.pathname;
  if (path === '/history') return <History />;
  return <Assistant />;
}