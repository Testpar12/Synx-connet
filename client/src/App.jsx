import React, { useState, useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AppProvider as PolarisProvider } from '@shopify/polaris';
import { Provider } from '@shopify/app-bridge-react';
import '@shopify/polaris/build/esm/styles.css';
import Router from './Router';
import Navigation from './components/Navigation';

function AppContent() {
  return (
    <>
      <Navigation />
      <Router />
    </>
  );
}

function App() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch('/api/auth/config');
        const data = await response.json();

        const params = new URLSearchParams(window.location.search);
        const host = params.get('host');
        const shop = params.get('shop');

        if (shop) {
          sessionStorage.setItem('currentPageShop', shop);
        }

        if (data.apiKey && host) {
          setConfig({
            apiKey: data.apiKey,
            host: host,
            forceRedirect: true
          });
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    }
    fetchConfig();
  }, []);

  if (!config) {
    return <div>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Provider config={config}>
        <PolarisProvider i18n={{}}>
          <AppContent />
        </PolarisProvider>
      </Provider>
    </BrowserRouter>
  );
}

export default App;
