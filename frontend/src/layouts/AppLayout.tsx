import { Navigate, Outlet, useLocation } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AppSidebar from '../components/AppSidebar';
import { useAuth } from '../contexts/AuthContext';

export default function AppLayout() {
  const { initialized, user } = useAuth();
  const location = useLocation();

  if (!initialized) return <div className="p-6 text-sm text-slate-500">Loading session...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppSidebar />
      <div className="min-h-screen lg:pl-72">
        <AppHeader />
        <main className="px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
