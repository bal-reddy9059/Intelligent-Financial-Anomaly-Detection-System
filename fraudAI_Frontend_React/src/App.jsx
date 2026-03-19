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
import UploadData from './components/logic/UploadData'
import ExploreData from './components/logic/ExploreData'
import RunDetection from './components/logic/RunDetection'
import DetectionResults from './components/logic/DetectionResults'
import ModelComparison from './components/logic/ModelComparison'
import CheckTransaction from './components/logic/CheckTransaction'
import BatchCheck from './components/logic/BatchCheck'
import AIHub from './components/logic/AIHub'
import FeatureInsights from './components/logic/FeatureInsights'

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
      '/upload-data': 'SafePayAI - Upload Data',
      '/explore-data': 'SafePayAI - Explore Data',
      '/run-detection': 'SafePayAI - Run Detection',
      '/detection-results': 'SafePayAI - Detection Results',
      '/model-comparison': 'SafePayAI - Model Comparison',
      '/check-transaction': 'SafePayAI - Check Transaction',
      '/batch-check': 'SafePayAI - Batch Check',
      '/ai-hub': 'SafePayAI - AI Intelligence Hub',
      '/feature-insights': 'SafePayAI - Feature Insights',
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
        <Route path="/upload-data" element={<PrivateRoute element={<UploadData />} />} />
        <Route path="/explore-data" element={<PrivateRoute element={<ExploreData />} />} />
        <Route path="/run-detection" element={<PrivateRoute element={<RunDetection />} />} />
        <Route path="/detection-results" element={<PrivateRoute element={<DetectionResults />} />} />
        <Route path="/model-comparison" element={<PrivateRoute element={<ModelComparison />} />} />
        <Route path="/check-transaction" element={<PrivateRoute element={<CheckTransaction />} />} />
        <Route path="/batch-check" element={<PrivateRoute element={<BatchCheck />} />} />
        <Route path="/ai-hub" element={<PrivateRoute element={<AIHub />} />} />
        <Route path="/feature-insights" element={<PrivateRoute element={<FeatureInsights />} />} />
      </Routes>
    </Router>
  );
};

export default App;
