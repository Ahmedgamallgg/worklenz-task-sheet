import React from 'react';
import { Card, Typography } from 'antd';

export const ClientPortalRequestDetails: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Typography.Title level={4}>Client Request Details</Typography.Title>
      </Card>
    </div>
  );
};

export default ClientPortalRequestDetails;
