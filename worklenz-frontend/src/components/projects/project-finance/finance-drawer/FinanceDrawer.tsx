import React from 'react';
import { Drawer, Typography } from '@/shared/antd-imports';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { closeFinanceDrawer } from '@/features/finance/finance-slice';

export const FinanceDrawer: React.FC = () => {
  const isDrawerOpen = useAppSelector(state => state.financeReducer?.isFinanceDrawerOpen || false);
  const dispatch = useAppDispatch();

  const handleClose = () => {
    dispatch(closeFinanceDrawer());
  };

  return (
    <Drawer title="Financial Breakdown" open={isDrawerOpen} onClose={handleClose} width={520}>
      <Typography.Paragraph type="secondary">
        Task financial details and rate card allocations.
      </Typography.Paragraph>
    </Drawer>
  );
};

export default FinanceDrawer;
