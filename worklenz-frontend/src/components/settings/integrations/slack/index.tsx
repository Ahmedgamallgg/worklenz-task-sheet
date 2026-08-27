import React from 'react';
import { Card, Button, Typography, Modal, Form, Table, Space, Tag, Select, Input } from 'antd';
import { CheckCircleOutlined, DisconnectOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';

export const SlackDisconnectedCard: React.FC<{
  loading?: boolean;
  onConnect?: () => void;
  hasBusinessAccess?: boolean;
}> = ({ loading, onConnect }) => (
  <Card>
    <Typography.Title level={4}>Connect Slack</Typography.Title>
    <Typography.Paragraph type="secondary">
      Receive real-time task updates and notifications directly in your Slack channels.
    </Typography.Paragraph>
    <Button type="primary" loading={loading} onClick={onConnect}>
      Connect Workspace
    </Button>
  </Card>
);

export const SlackConnectedCard: React.FC<{
  workspace?: any;
  channels?: any[];
  availableChannels?: any[];
  onManage?: () => void;
  onDisconnect?: () => void;
}> = ({ workspace, onManage, onDisconnect }) => (
  <Card>
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Title level={4}>
        <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
        Slack Connected
      </Typography.Title>
      <Typography.Text type="secondary">
        Connected to workspace: <strong>{workspace?.team_name || 'Workspace'}</strong>
      </Typography.Text>
      <Space style={{ marginTop: 12 }}>
        <Button icon={<SettingOutlined />} onClick={onManage}>
          Manage Channels
        </Button>
        <Button danger icon={<DisconnectOutlined />} onClick={onDisconnect}>
          Disconnect
        </Button>
      </Space>
    </Space>
  </Card>
);

export const SlackManageModal: React.FC<any> = ({
  open,
  channels = [],
  loading,
  onClose,
  onAddNew,
  onEdit,
  onDelete,
}) => (
  <Modal
    title="Manage Slack Notifications"
    open={open}
    onCancel={onClose}
    footer={[
      <Button key="close" onClick={onClose}>
        Close
      </Button>,
      <Button key="add" type="primary" icon={<PlusOutlined />} onClick={onAddNew}>
        Add Channel
      </Button>,
    ]}
    width={650}
  >
    <Table
      size="small"
      dataSource={channels}
      rowKey="id"
      loading={loading}
      columns={[
        { title: 'Channel', dataIndex: 'channel_name', key: 'channel_name' },
        { title: 'Project', dataIndex: 'project_name', key: 'project_name' },
        {
          title: 'Actions',
          key: 'actions',
          render: (_, record) => (
            <Space>
              <Button size="small" onClick={() => onEdit(record)}>
                Edit
              </Button>
              <Button size="small" danger onClick={() => onDelete(record.id)}>
                Delete
              </Button>
            </Space>
          ),
        },
      ]}
    />
  </Modal>
);

export const SlackChannelFormModal: React.FC<any> = ({
  open,
  form,
  editingChannel,
  availableChannels = [],
  onClose,
  onSubmit,
}) => (
  <Modal
    title={editingChannel ? 'Edit Slack Channel' : 'Add Slack Channel'}
    open={open}
    onCancel={onClose}
    onOk={() => form.submit()}
  >
    <Form form={form} layout="vertical" onFinish={onSubmit}>
      <Form.Item
        name="channel_id"
        label="Slack Channel"
        rules={[{ required: true, message: 'Please select a channel' }]}
      >
        <Select
          placeholder="Select Slack Channel"
          options={availableChannels.map((c: any) => ({ label: `#${c.name}`, value: c.id }))}
        />
      </Form.Item>
    </Form>
  </Modal>
);
