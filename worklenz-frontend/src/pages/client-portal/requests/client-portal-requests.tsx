import React from 'react';
import { Card, Typography } from 'antd';

export const ClientPortalRequests: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Typography.Title level={4}>Client Portal - Requests</Typography.Title>
        <Typography.Paragraph type="secondary">
          Manage client requests and submissions.
        </Typography.Paragraph>
      </Card>
    </div>
  );
};

export default ClientPortalRequests;
