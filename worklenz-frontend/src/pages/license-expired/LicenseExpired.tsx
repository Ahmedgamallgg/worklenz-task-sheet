import React from 'react';
import { Result, Button, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export const LicenseExpiredPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Result
        icon={<WarningOutlined style={{ color: '#faad14' }} />}
        title="Subscription Required"
        subTitle="Your organization's license or trial has expired. Please contact your administrator or upgrade your plan to continue using all features."
        extra={[
          <Button type="primary" key="home" onClick={() => navigate('/worklenz/home')}>
            Back to Home
          </Button>,
        ]}
      />
    </div>
  );
};

export default LicenseExpiredPage;
