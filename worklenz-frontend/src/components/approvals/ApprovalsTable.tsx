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
  Badge,
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
  WarningOutlined,
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

  const formatDurationDisplay = (totalMinutes: number) => {
    if (totalMinutes <= 0) return '0m';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

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
      width: 180,
      render: (_: any, record: ITaskTimeApproval) => (
        <Flex align="center" gap={8}>
          <SingleAvatar avatarUrl={record.member_avatar_url} name={record.member_name} />
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 13, display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {record.member_name}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {record.member_email}
            </Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Task & Project',
      key: 'task',
      minWidth: 200,
      render: (_: any, record: ITaskTimeApproval) => {
        const isOverMax = !!record.maximum_approved_minutes &&
          record.recorded_duration > (record.maximum_approved_minutes * 60);
        const isOverEst = !!record.task_estimated_minutes &&
          record.recorded_duration > (record.task_estimated_minutes * 60);

        return (
          <Flex vertical gap={4}>
            <Flex align="center" gap={6} wrap="wrap">
              {record.task_no && (
                <Tag style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                  #{record.task_no}
                </Tag>
              )}
              <Typography.Text
                strong
                style={{ fontSize: 13, cursor: 'pointer', color: '#1677ff' }}
                onClick={() => onViewDetail(record)}
              >
                {record.task_name}
              </Typography.Text>
            </Flex>
            <Flex align="center" gap={6} wrap="wrap">
              <Tag color="geekblue" style={{ fontSize: 11, margin: 0 }}>
                {record.project_name}
              </Tag>
              {record.task_status_name && (
                <Tag
                  style={{
                    fontSize: 11,
                    margin: 0,
                    borderColor: record.task_status_color || undefined,
                    color: record.task_status_color || undefined,
                  }}
                >
                  {record.task_status_name}
                </Tag>
              )}
              {isOverMax && (
                <Tooltip title={`Recorded time exceeds maximum approved limit of ${record.maximum_approved_minutes}m`}>
                  <Tag color="error" icon={<WarningOutlined />} style={{ margin: 0, fontSize: 10 }}>
                    Exceeds Max Limit
                  </Tag>
                </Tooltip>
              )}
              {!isOverMax && isOverEst && (
                <Tooltip title={`Recorded time exceeds estimate of ${record.task_estimated_minutes}m`}>
                  <Tag color="warning" icon={<ExclamationCircleOutlined />} style={{ margin: 0, fontSize: 10 }}>
                    Over Estimate
                  </Tag>
                </Tooltip>
              )}
            </Flex>
          </Flex>
        );
      },
    },
    {
      title: 'Estimated',
      dataIndex: 'task_estimated_minutes',
      key: 'estimated',
      width: 100,
      render: (mins?: number) => {
        if (!mins || mins <= 0) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        return (
          <Typography.Text style={{ fontSize: 12 }}>
            {formatDurationDisplay(mins)}
          </Typography.Text>
        );
      },
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_duration',
      key: 'recorded_duration',
      width: 110,
      render: (seconds: number) => {
        const mins = Math.round(seconds / 60);
        return (
          <div>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {formatDurationDisplay(mins)}
            </Typography.Text>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>
              {mins} mins
            </div>
          </div>
        );
      },
    },
    {
      title: 'Max Approved',
      dataIndex: 'maximum_approved_minutes',
      key: 'maximum_approved_minutes',
      width: 110,
      render: (maxMins: number | null | undefined, record: ITaskTimeApproval) => {
        if (!maxMins || maxMins <= 0) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        const recordedMins = Math.round(record.recorded_duration / 60);
        const isOver = recordedMins > maxMins;
        return (
          <div>
            <Typography.Text strong style={{ color: isOver ? '#cf1322' : undefined, fontSize: 12 }}>
              {formatDurationDisplay(maxMins)}
            </Typography.Text>
            {isOver && (
              <div style={{ fontSize: 10, color: '#ff4d4f', fontWeight: 600 }}>
                +{formatDurationDisplay(recordedMins - maxMins)} over
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Approved',
      dataIndex: 'approved_duration',
      key: 'approved_duration',
      width: 110,
      render: (seconds: number, record: ITaskTimeApproval) => {
        if (record.status === TaskTimeApprovalStatus.PENDING) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        const mins = Math.round(seconds / 60);
        return (
          <div>
            <Typography.Text strong style={{ color: '#52c41a', fontSize: 13 }}>
              {formatDurationDisplay(mins)}
            </Typography.Text>
            <div style={{ fontSize: 11, color: '#52c41a' }}>
              {mins} mins
            </div>
          </div>
        );
      },
    },
    {
      title: 'Variance',
      key: 'variance',
      width: 120,
      render: (_: any, record: ITaskTimeApproval) => {
        const estimatedMins = record.task_estimated_minutes || 0;
        if (estimatedMins <= 0) {
          return <Typography.Text type="secondary">N/A</Typography.Text>;
        }
        const recordedMins = Math.round(record.recorded_duration / 60);
        const varianceMins = recordedMins - estimatedMins;
        const isOver = varianceMins > 0;

        return (
          <div>
            <Typography.Text type={isOver ? 'danger' : 'success'} strong style={{ fontSize: 12 }}>
              {isOver ? `+${formatDurationDisplay(varianceMins)}` : formatDurationDisplay(varianceMins)}
            </Typography.Text>
            {record.variance_percentage !== undefined && record.variance_percentage !== null && (
              <div style={{ fontSize: 11, color: isOver ? '#cf1322' : '#389e0d', fontWeight: 500 }}>
                {isOver ? `+${record.variance_percentage}%` : `${record.variance_percentage}%`}
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
      width: 110,
      render: (status: TaskTimeApprovalStatus) => renderStatusTag(status),
    },
    {
      title: 'Submitted',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 140,
      render: (val: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {formatDateTimeWithUserTimezone(val, currentSession?.timezone_name)}
        </Typography.Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: any, record: ITaskTimeApproval) => {
        const isPending = record.status === TaskTimeApprovalStatus.PENDING;

        return (
          <Space size={4}>
            <Tooltip title="View Details">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => onViewDetail(record)}
              />
            </Tooltip>

            {isPending && (
              <>
                <Tooltip title="Quick Approve Recorded Time">
                  <Popconfirm
                    title="Quick Approve Time"
                    description={`Approve full recorded time of ${formatDurationDisplay(Math.round(record.recorded_duration / 60))} for ${record.member_name}?`}
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

                <Tooltip title="Adjust Approved Duration">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onActionClick(record, 'adjust')}
                  />
                </Tooltip>

                <Tooltip title="Reject Submission">
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
      scroll={{ x: 1200 }}
      pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (total) => `Total ${total} submissions` }}
    />
  );
};

export default ApprovalsTable;
