import React from 'react';
import { Card, Typography, Button, Space } from 'antd';
import UpgradePlansModal from '@/worklenz-ee/components/UpgradePlansModal';

export const BillingSection: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Typography.Title level={4}>Subscription & Billing</Typography.Title>
        <Typography.Paragraph type="secondary">
          Manage your organization's subscription plan, invoices, and billing details.
        </Typography.Paragraph>
      </Card>
      <UpgradePlansModal />
    </div>
  );
};

export default BillingSection;
