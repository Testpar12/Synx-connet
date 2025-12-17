import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import Router from './Router';

function App() {
  return (
    <BrowserRouter>
      <AppProvider i18n={{}}>
        <Router />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
