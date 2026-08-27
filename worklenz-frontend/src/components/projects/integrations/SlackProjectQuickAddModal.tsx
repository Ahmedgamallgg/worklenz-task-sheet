import React from 'react';
import { Modal, Form, Select, Typography } from 'antd';

interface SlackProjectQuickAddModalProps {
  open: boolean;
  projectId: string;
  projectName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const SlackProjectQuickAddModal: React.FC<SlackProjectQuickAddModalProps> = ({
  open,
  projectName,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();

  const handleFinish = () => {
    onSuccess();
    onClose();
  };

  return (
    <Modal
      title={`Connect Slack to ${projectName || 'Project'}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="channel_id"
          label="Slack Channel"
          rules={[{ required: true, message: 'Please select a channel' }]}
        >
          <Select placeholder="Select a channel to receive notifications" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default SlackProjectQuickAddModal;
