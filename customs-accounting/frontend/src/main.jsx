import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { I18nProvider } from './i18n/I18nContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { CompanyProvider } from './contexts/CompanyContext.jsx';
import { FeedbackProvider } from './components/Feedback.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider>
        <AuthProvider>
          <CompanyProvider>
            <FeedbackProvider>
              <App />
            </FeedbackProvider>
          </CompanyProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
