import { Navigate, createBrowserRouter, useLocation, useParams } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import AccountSettings from './pages/AccountSettings';
import Dashboard from './pages/Dashboard';
import Domains from './pages/Domains';
import LatestReport from './pages/LatestReport';
import Login from './pages/Login';
import Model from './pages/Model';
import MyRecords from './pages/MyRecords';
import Plugin from './pages/Plugin';
import PluginBind from './pages/PluginBind';
import PluginGuide from './pages/PluginGuide';
import PluginSync from './pages/PluginSync';
import ProductHome from './pages/ProductHome';
import Register from './pages/Register';
import Records from './pages/Records';
import ReportDetail from './pages/ReportDetail';
import Rules from './pages/Rules';
import Samples from './pages/Samples';
import Scan from './pages/Scan';
import Stats from './pages/Stats';
import UserDomains from './pages/UserDomains';
import Users from './pages/Users';
import type { UserRole } from './types';

function RoleGuard({ roles, children }: { roles: UserRole[]; children: ReactElement }) {
  const { initialized, user } = useAuth();
  const location = useLocation();
  if (!initialized) return <div className="p-6 text-sm text-slate-500">Loading session...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function LegacyReportRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/app/reports/${id}` : '/app/report/latest'} replace />;
}

const router = createBrowserRouter([
  { path: '/', element: <ProductHome /> },
  { path: '/welcome', element: <Navigate to="/" replace /> },
  { path: '/plugin-install', element: <PluginGuide /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/reports/:id', element: <LegacyReportRedirect /> },
  { path: '/report/latest', element: <Navigate to="/app/report/latest" replace /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'scan', element: <RoleGuard roles={['user']}><Scan /></RoleGuard> },
      { path: 'my-records', element: <RoleGuard roles={['user']}><MyRecords /></RoleGuard> },
      { path: 'my-domains', element: <RoleGuard roles={['user']}><UserDomains /></RoleGuard> },
      { path: 'plugin-sync', element: <RoleGuard roles={['user']}><PluginSync /></RoleGuard> },
      { path: 'plugin-bind', element: <RoleGuard roles={['admin', 'user']}><PluginBind /></RoleGuard> },
      { path: 'account', element: <RoleGuard roles={['user', 'admin']}><AccountSettings /></RoleGuard> },
      { path: 'report/latest', element: <RoleGuard roles={['user', 'admin']}><LatestReport /></RoleGuard> },
      { path: 'plugin-guide', element: <RoleGuard roles={['admin', 'user']}><PluginGuide /></RoleGuard> },

      { path: 'admin/records', element: <RoleGuard roles={['admin']}><Records /></RoleGuard> },
      { path: 'admin/samples', element: <RoleGuard roles={['admin']}><Samples /></RoleGuard> },
      { path: 'admin/rules', element: <RoleGuard roles={['admin']}><Rules /></RoleGuard> },
      { path: 'admin/domains', element: <RoleGuard roles={['admin']}><Domains /></RoleGuard> },
      { path: 'admin/model', element: <RoleGuard roles={['admin']}><Model /></RoleGuard> },
      { path: 'admin/stats', element: <RoleGuard roles={['admin']}><Stats /></RoleGuard> },
      { path: 'admin/plugin', element: <RoleGuard roles={['admin']}><Plugin /></RoleGuard> },
      { path: 'admin/users', element: <RoleGuard roles={['admin']}><Users /></RoleGuard> },
      { path: 'reports/:id', element: <RoleGuard roles={['admin', 'user']}><ReportDetail /></RoleGuard> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default router;
