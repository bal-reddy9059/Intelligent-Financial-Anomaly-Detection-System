import { useEffect, useState } from 'react';
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
import RiskProfile from './components/logic/RiskProfile'
import FraudHeatmap from './components/logic/FraudHeatmap'
import FraudCalendar from './components/logic/FraudCalendar'
import NetworkAnalysis from './components/logic/NetworkAnalysis'
import ScoreHistory from './components/logic/ScoreHistory'
import Watchlist from './components/logic/Watchlist'
import FeedbackCenter from './components/logic/FeedbackCenter'
import DatasetDrift from './components/logic/DatasetDrift'
import BehavioralAnalysis from './components/logic/BehavioralAnalysis'
import RuleEngine from './components/logic/RuleEngine'
import BulkExplain from './components/logic/BulkExplain'
import RetrainingReadiness from './components/logic/RetrainingReadiness'
import RiskScoreBlend from './components/logic/RiskScoreBlend'
import QRPay from './components/logic/QRPay'
import Budget from './components/logic/Budget'
import RequestMoney from './components/logic/RequestMoney'
import AIAssistant from './components/logic/AIAssistant'
import NotificationsCenter from './components/logic/NotificationsCenter'
import SplitBill from './components/logic/SplitBill'
import RecurringPayments from './components/logic/RecurringPayments'
import SavingsGoals from './components/logic/SavingsGoals'
import EMICalculator from './components/logic/EMICalculator'
import LiveFraudFeed from './components/logic/LiveFraudFeed'
import DisputeCenter from './components/logic/DisputeCenter'
import BiometricGuard from './components/logic/BiometricGuard'
import SpendingCoach from './components/logic/SpendingCoach'
import ContactTrustScore from './components/logic/ContactTrustScore'
import CommunityReports from './components/logic/CommunityReports'
import FraudTimeline from './components/logic/FraudTimeline'
import PaymentHealth from './components/logic/PaymentHealth'
import SecurityBadges from './components/logic/SecurityBadges'

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
      '/risk-profile': 'SafePayAI - Risk Profile',
      '/fraud-heatmap': 'SafePayAI - Fraud Heatmap',
      '/fraud-calendar': 'SafePayAI - Fraud Calendar',
      '/network-analysis': 'SafePayAI - Network Analysis',
      '/score-history': 'SafePayAI - Score History',
      '/watchlist': 'SafePayAI - Watchlist',
      '/feedback-center': 'SafePayAI - Feedback Center',
      '/dataset-drift': 'SafePayAI - Dataset Drift',
      '/behavioral-analysis': 'SafePayAI - Behavioral Analysis',
      '/rule-engine': 'SafePayAI - Rule Engine',
      '/bulk-explain': 'SafePayAI - Bulk Explain',
      '/retraining-readiness': 'SafePayAI - Retraining Readiness',
      '/risk-score-blend': 'SafePayAI - Risk Score Blend',
      '/qr-pay': 'SafePayAI - QR Pay',
      '/budget': 'SafePayAI - Budget Tracker',
      '/request-money': 'SafePayAI - Request Money',
      '/ai-assistant': 'SafePayAI - AI Assistant',
      '/notifications': 'SafePayAI - Notifications',
      '/split-bill': 'SafePayAI - Split Bill',
      '/recurring-payments': 'SafePayAI - Recurring Payments',
      '/savings-goals': 'SafePayAI - Savings Goals',
      '/emi-calculator': 'SafePayAI - EMI Calculator',
      '/live-fraud-feed': 'SafePayAI - Live Fraud Feed',
      '/dispute-center': 'SafePayAI - Dispute Center',
      '/biometric-guard': 'SafePayAI - Biometric Guard',
      '/spending-coach': 'SafePayAI - AI Spending Coach',
      '/contact-trust': 'SafePayAI - Contact Trust Scores',
      '/community-reports': 'SafePayAI - Community Reports',
      '/fraud-timeline': 'SafePayAI - Fraud Prediction Timeline',
      '/payment-health': 'SafePayAI - Payment Health Score',
      '/security-badges': 'SafePayAI - Security Achievements',
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
        <Route path="/risk-profile" element={<PrivateRoute element={<RiskProfile />} />} />
        <Route path="/fraud-heatmap" element={<PrivateRoute element={<FraudHeatmap />} />} />
        <Route path="/fraud-calendar" element={<PrivateRoute element={<FraudCalendar />} />} />
        <Route path="/network-analysis" element={<PrivateRoute element={<NetworkAnalysis />} />} />
        <Route path="/score-history" element={<PrivateRoute element={<ScoreHistory />} />} />
        <Route path="/watchlist" element={<PrivateRoute element={<Watchlist />} />} />
        <Route path="/feedback-center" element={<PrivateRoute element={<FeedbackCenter />} />} />
        <Route path="/dataset-drift" element={<PrivateRoute element={<DatasetDrift />} />} />
        <Route path="/behavioral-analysis" element={<PrivateRoute element={<BehavioralAnalysis />} />} />
        <Route path="/rule-engine" element={<PrivateRoute element={<RuleEngine />} />} />
        <Route path="/bulk-explain" element={<PrivateRoute element={<BulkExplain />} />} />
        <Route path="/retraining-readiness" element={<PrivateRoute element={<RetrainingReadiness />} />} />
        <Route path="/risk-score-blend" element={<PrivateRoute element={<RiskScoreBlend />} />} />
        <Route path="/qr-pay" element={<PrivateRoute element={<QRPay />} />} />
        <Route path="/budget" element={<PrivateRoute element={<Budget />} />} />
        <Route path="/request-money" element={<PrivateRoute element={<RequestMoney />} />} />
        <Route path="/ai-assistant" element={<PrivateRoute element={<AIAssistant />} />} />
        {/* Week 1 */}
        <Route path="/notifications" element={<PrivateRoute element={<NotificationsCenter />} />} />
        {/* Week 2 */}
        <Route path="/split-bill" element={<PrivateRoute element={<SplitBill />} />} />
        <Route path="/recurring-payments" element={<PrivateRoute element={<RecurringPayments />} />} />
        {/* Week 3 */}
        <Route path="/savings-goals" element={<PrivateRoute element={<SavingsGoals />} />} />
        <Route path="/emi-calculator" element={<PrivateRoute element={<EMICalculator />} />} />
        {/* Week 4 */}
        <Route path="/live-fraud-feed" element={<PrivateRoute element={<LiveFraudFeed />} />} />
        <Route path="/dispute-center" element={<PrivateRoute element={<DisputeCenter />} />} />
        {/* Week 5 */}
        <Route path="/biometric-guard" element={<PrivateRoute element={<BiometricGuard />} />} />
        {/* Week 6 */}
        <Route path="/spending-coach" element={<PrivateRoute element={<SpendingCoach />} />} />
        {/* Week 7 */}
        <Route path="/contact-trust" element={<PrivateRoute element={<ContactTrustScore />} />} />
        <Route path="/community-reports" element={<PrivateRoute element={<CommunityReports />} />} />
        {/* Week 8 */}
        <Route path="/fraud-timeline" element={<PrivateRoute element={<FraudTimeline />} />} />
        <Route path="/payment-health" element={<PrivateRoute element={<PaymentHealth />} />} />
        <Route path="/security-badges" element={<PrivateRoute element={<SecurityBadges />} />} />
      </Routes>
    </Router>
  );
};

export default App;
