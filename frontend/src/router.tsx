import { Navigate, createBrowserRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import Domains from './pages/Domains';
import Login from './pages/Login';
import Model from './pages/Model';
import MyRecords from './pages/MyRecords';
import Plugin from './pages/Plugin';
import PluginGuide from './pages/PluginGuide';
import Records from './pages/Records';
import ReportDetail from './pages/ReportDetail';
import LatestReport from './pages/LatestReport';
import Rules from './pages/Rules';
import Scan from './pages/Scan';
import Stats from './pages/Stats';
import Users from './pages/Users';
import type { UserRole } from './types';

function RoleGuard({ roles, children }: { roles: UserRole[]; children: ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'scan', element: <RoleGuard roles={['user']}><Scan /></RoleGuard> },
      { path: 'records', element: <RoleGuard roles={['admin']}><Records /></RoleGuard> },
      { path: 'my-records', element: <RoleGuard roles={['user']}><MyRecords /></RoleGuard> },
      { path: 'rules', element: <RoleGuard roles={['admin']}><Rules /></RoleGuard> },
      { path: 'domains', element: <RoleGuard roles={['admin']}><Domains /></RoleGuard> },
      { path: 'model', element: <RoleGuard roles={['admin']}><Model /></RoleGuard> },
      { path: 'stats', element: <RoleGuard roles={['admin']}><Stats /></RoleGuard> },
      { path: 'plugin', element: <RoleGuard roles={['admin']}><Plugin /></RoleGuard> },
      { path: 'admin/users', element: <RoleGuard roles={['admin']}><Users /></RoleGuard> },
      { path: 'reports/:id', element: <RoleGuard roles={['admin', 'user']}><ReportDetail /></RoleGuard> },
      { path: 'report/latest', element: <RoleGuard roles={['user']}><LatestReport /></RoleGuard> },
      { path: 'plugin-guide', element: <RoleGuard roles={['user']}><PluginGuide /></RoleGuard> },
    ],
  },
]);

export default router;
