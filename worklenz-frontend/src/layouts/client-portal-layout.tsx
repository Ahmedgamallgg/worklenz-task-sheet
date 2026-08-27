import { Layout } from '@/shared/antd-imports';
import { Outlet } from 'react-router-dom';
import { memo } from 'react';
import Navbar from '@/features/navbar/navbar';
import { useAppSelector } from '../hooks/useAppSelector';
import UpgradePlansModal from '@/worklenz-ee/components/UpgradePlansModal';

const ClientPortalLayout = memo(() => {
  const themeMode = useAppSelector(state => state.themeReducer.mode);

  return (
    <>
      <Layout className="min-h-screen">
        <Layout.Header
          className={`sticky top-0 z-[999] flex items-center p-0 shadow-md ${
            themeMode === 'dark' ? 'border-b border-[#303030]' : 'shadow-[#18181811]'
          }`}
        >
          <Navbar />
        </Layout.Header>

        <Layout.Content className="px-4 sm:px-8 lg:px-12 xl:px-16 mx-auto w-full max-w-[1400px]">
          <Outlet />
        </Layout.Content>
      </Layout>

      <UpgradePlansModal />
    </>
  );
});

ClientPortalLayout.displayName = 'ClientPortalLayout';

export default ClientPortalLayout;
