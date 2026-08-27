import React from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Tooltip,
  Popconfirm,
  Flex,
} from '@/shared/antd-imports';
import {
  CheckOutlined,
  EditOutlined,
  CloseOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { ITaskTimeApproval, TaskTimeApprovalStatus } from '@/types/time-approval.types';
import SingleAvatar from '@/components/common/single-avatar/single-avatar';
import { formatDateTimeWithUserTimezone } from '@/utils/format-date-time-with-user-timezone';
import { useAuthService } from '@/hooks/useAuth';

interface ApprovalsTableProps {
  data: ITaskTimeApproval[];
  loading: boolean;
  onActionClick: (approval: ITaskTimeApproval, mode: 'approve' | 'adjust' | 'reject') => void;
  onViewDetail: (approval: ITaskTimeApproval) => void;
  onDirectApprove: (approval: ITaskTimeApproval) => void;
}

export const ApprovalsTable: React.FC<ApprovalsTableProps> = ({
  data,
  loading,
  onActionClick,
  onViewDetail,
  onDirectApprove,
}) => {
  const currentSession = useAuthService().getCurrentSession();

  const renderStatusTag = (status: TaskTimeApprovalStatus) => {
    switch (status) {
      case TaskTimeApprovalStatus.PENDING:
        return <Tag icon={<ClockCircleOutlined />} color="warning">Pending</Tag>;
      case TaskTimeApprovalStatus.APPROVED:
        return <Tag icon={<CheckCircleOutlined />} color="success">Approved</Tag>;
      case TaskTimeApprovalStatus.ADJUSTED:
        return <Tag icon={<ExclamationCircleOutlined />} color="processing">Adjusted</Tag>;
      case TaskTimeApprovalStatus.REJECTED:
        return <Tag icon={<CloseCircleOutlined />} color="error">Rejected</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_: any, record: ITaskTimeApproval) => (
        <Flex align="center" gap={8}>
          <SingleAvatar avatarUrl={record.member_avatar_url} name={record.member_name} />
          <div>
            <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
              {record.member_name}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {record.member_email}
            </Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Task & Project',
      key: 'task',
      render: (_: any, record: ITaskTimeApproval) => (
        <div>
          <Typography.Text
            strong
            style={{ fontSize: 13, cursor: 'pointer', color: '#1677ff' }}
            onClick={() => onViewDetail(record)}
          >
            {record.task_name}
          </Typography.Text>
          <div>
            <Tag color="geekblue" style={{ fontSize: 11, marginTop: 2 }}>
              {record.project_name}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_duration',
      key: 'recorded_duration',
      render: (seconds: number) => {
        const mins = Math.round(seconds / 60);
        return (
          <Typography.Text strong>
            {mins}m <span style={{ fontWeight: 'normal', color: '#8c8c8c', fontSize: 11 }}>({(mins / 60).toFixed(1)}h)</span>
          </Typography.Text>
        );
      },
    },
    {
      title: 'Approved',
      dataIndex: 'approved_duration',
      key: 'approved_duration',
      render: (seconds: number, record: ITaskTimeApproval) => {
        if (record.status === TaskTimeApprovalStatus.PENDING) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        const mins = Math.round(seconds / 60);
        return (
          <Typography.Text strong style={{ color: '#52c41a' }}>
            {mins}m <span style={{ fontWeight: 'normal', color: '#8c8c8c', fontSize: 11 }}>({(mins / 60).toFixed(1)}h)</span>
          </Typography.Text>
        );
      },
    },
    {
      title: 'Variance',
      key: 'variance',
      render: (_: any, record: ITaskTimeApproval) => {
        const estimatedMins = record.task_estimated_minutes || 0;
        if (estimatedMins <= 0) {
          return <Typography.Text type="secondary">N/A</Typography.Text>;
        }
        const varianceSeconds = record.variance_seconds || 0;
        const varianceMins = Math.round(varianceSeconds / 60);
        const isOver = varianceMins > 0;

        return (
          <div>
            <Typography.Text type={isOver ? 'danger' : 'success'} strong>
              {isOver ? `+${varianceMins}m` : `${varianceMins}m`}
            </Typography.Text>
            {record.variance_percentage !== undefined && record.variance_percentage !== null && (
              <div style={{ fontSize: 11, color: isOver ? '#ff4d4f' : '#52c41a' }}>
                ({record.variance_percentage}%)
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: TaskTimeApprovalStatus) => renderStatusTag(status),
    },
    {
      title: 'Submitted',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      render: (val: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {formatDateTimeWithUserTimezone(val, currentSession?.timezone_name)}
        </Typography.Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ITaskTimeApproval) => {
        const isPending = record.status === TaskTimeApprovalStatus.PENDING;

        return (
          <Space orientation="horizontal" size={4}>
            <Tooltip title="View Details">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => onViewDetail(record)}
              />
            </Tooltip>

            {isPending && (
              <>
                <Tooltip title="Quick Approve">
                  <Popconfirm
                    title="Quick Approve Time"
                    description={`Approve ${Math.round(record.recorded_duration / 60)} minutes for ${record.member_name}?`}
                    onConfirm={() => onDirectApprove(record)}
                    okText="Approve"
                    cancelText="Cancel"
                  >
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckOutlined />}
                      style={{ backgroundColor: '#52c41a' }}
                    />
                  </Popconfirm>
                </Tooltip>

                <Tooltip title="Adjust Duration">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onActionClick(record, 'adjust')}
                  />
                </Tooltip>

                <Tooltip title="Reject">
                  <Button
                    danger
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => onActionClick(record, 'reject')}
                  />
                </Tooltip>
              </>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="id"
      loading={loading}
      pagination={{ pageSize: 15, showSizeChanger: true }}
    />
  );
};

export default ApprovalsTable;
