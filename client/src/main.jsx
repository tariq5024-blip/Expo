import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const RootWrapper = () => {
  useEffect(() => {
    if (!document.documentElement.dataset.theme) {
      document.documentElement.dataset.theme = 'default';
    }
  }, []);
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootWrapper />
  </StrictMode>,
)
