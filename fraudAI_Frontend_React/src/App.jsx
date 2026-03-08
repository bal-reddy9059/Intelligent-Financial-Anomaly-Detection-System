import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './components/logic/firebase';
import Homepage from './components/logic/homepage';
import Dashboard from './components/logic/Dashboard';
import Recent from './components/logic/Recent'
import Statements from './components/logic/Statements'
import Beneficiaries from './components/logic/Beneficiaries'
import SettingsPage from './components/logic/Settings'
import HelpSupport from './components/logic/HelpSupport'

const PrivateRoute = ({ element }) => {
  const [authState, setAuthState] = useState('loading');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState(user ? 'authenticated' : 'unauthenticated');
    });
    return unsubscribe;
  }, []);

  if (authState === 'loading') return <div className="min-h-screen bg-gray-900" />;
  return authState === 'authenticated' ? element : <Navigate to="/" replace />;
};

const RouteTitleUpdater = () => {
  const location = useLocation();

  useEffect(() => {
    const routeToTitle = {
      '/': 'SafePayAI - Home',
      '/dashboard': 'SafePayAI - Dashboard',
      '/send-money': 'SafePayAI - Send Money',
      '/transactions': 'SafePayAI - Transactions',
      '/statements': 'SafePayAI - Statements',
      '/beneficiaries': 'SafePayAI - Beneficiaries',
      '/settings': 'SafePayAI - Settings',
      '/help-support': 'SafePayAI - Help & Support',
    };

    const title = routeToTitle[location.pathname] || 'SafePayAI';
    document.title = title;
  }, [location]);

  return null;
};

const App = () => {
  return (
    <Router>
      <RouteTitleUpdater />
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/send-money" element={<Homepage />} />
        <Route path="/dashboard" element={<PrivateRoute element={<Dashboard />} />} />
        <Route path="/transactions" element={<PrivateRoute element={<Recent />} />} />
        <Route path="/statements" element={<PrivateRoute element={<Statements />} />} />
        <Route path="/beneficiaries" element={<PrivateRoute element={<Beneficiaries />} />} />
        <Route path="/settings" element={<PrivateRoute element={<SettingsPage />} />} />
        <Route path="/help-support" element={<PrivateRoute element={<HelpSupport />} />} />
      </Routes>
    </Router>
  );
};

export default App;
