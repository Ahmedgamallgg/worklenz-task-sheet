import React from 'react';
import { Card, Typography } from 'antd';

export const ClientPortalClients: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Typography.Title level={4}>Client Portal - Clients</Typography.Title>
        <Typography.Paragraph type="secondary">
          Manage your client portal clients and access.
        </Typography.Paragraph>
      </Card>
    </div>
  );
};

export default ClientPortalClients;
