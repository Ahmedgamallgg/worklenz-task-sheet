import React from 'react';
import { Drawer, Form, Input, Button, Space, Typography } from 'antd';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { toggleRatecardDrawer } from '@/features/finance/finance-slice';

interface RateCardDrawerProps {
  type?: 'create' | 'edit';
  ratecardId?: string;
  onSaved?: () => void;
}

export const RateCardDrawer: React.FC<RateCardDrawerProps> = ({
  type = 'create',
  ratecardId,
  onSaved,
}) => {
  const isDrawerOpen = useAppSelector(state => state.financeReducer?.isRateCardDrawerOpen || false);
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();

  const handleClose = () => {
    dispatch(toggleRatecardDrawer(false));
  };

  const handleFinish = () => {
    handleClose();
    if (onSaved) onSaved();
  };

  return (
    <Drawer
      title={type === 'create' ? 'Create Rate Card' : 'Edit Rate Card'}
      open={isDrawerOpen}
      onClose={handleClose}
      width={480}
      extra={
        <Space>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" onClick={() => form.submit()}>
            Save
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label="Rate Card Name"
          rules={[{ required: true, message: 'Rate card name is required' }]}
        >
          <Input placeholder="e.g. Standard 2026 Rate Card" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="Optional notes or details..." />
        </Form.Item>
      </Form>
    </Drawer>
  );
};

export default RateCardDrawer;
