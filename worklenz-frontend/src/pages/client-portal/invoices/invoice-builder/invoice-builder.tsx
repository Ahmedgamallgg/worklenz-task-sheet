import React from 'react';
import { Card, Typography } from 'antd';

export const InvoiceBuilder: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Typography.Title level={4}>Invoice Builder</Typography.Title>
      </Card>
    </div>
  );
};

export default InvoiceBuilder;
