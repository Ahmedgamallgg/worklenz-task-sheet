import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Typography,
  Divider,
  Flex,
  Tag,
  Space,
  Table,
  Button,
  Timeline,
  Card,
  Skeleton,
  Alert,
  Tooltip,
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  CheckOutlined,
  EditOutlined,
  CloseOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import { ITaskTimeApproval, TaskTimeApprovalStatus } from '@/types/time-approval.types';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import SingleAvatar from '@/components/common/single-avatar/single-avatar';
import { formatDateTimeWithUserTimezone } from '@/utils/format-date-time-with-user-timezone';
import { useAuthService } from '@/hooks/useAuth';

interface ApprovalDetailDrawerProps {
  open: boolean;
  approvalId: string | null;
  onClose: () => void;
  onActionClick: (approval: ITaskTimeApproval, mode: 'approve' | 'adjust' | 'reject') => void;
}

export const ApprovalDetailDrawer: React.FC<ApprovalDetailDrawerProps> = ({
  open,
  approvalId,
  onClose,
  onActionClick,
}) => {
  const [approval, setApproval] = useState<ITaskTimeApproval | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const currentSession = useAuthService().getCurrentSession();

  useEffect(() => {
    if (open && approvalId) {
      fetchDetail();
    }
  }, [open, approvalId]);

  const fetchDetail = async () => {
    if (!approvalId) return;
    try {
      setLoading(true);
      const res = await timeApprovalsApiService.getById(approvalId);
      if (res.done && res.body) {
        setApproval(res.body);
      }
    } catch (err) {
      console.error('Failed to load approval details:', err);
    } finally {
      setLoading(false);
    }
  };

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
        return <Tag icon={<ClockCircleOutlined />} color="warning">Pending Approval</Tag>;
      case TaskTimeApprovalStatus.APPROVED:
        return <Tag icon={<CheckCircleOutlined />} color="success">Approved</Tag>;
      case TaskTimeApprovalStatus.ADJUSTED:
        return <Tag icon={<ExclamationCircleOutlined />} color="processing">Adjusted & Approved</Tag>;
      case TaskTimeApprovalStatus.REJECTED:
        return <Tag icon={<CloseCircleOutlined />} color="error">Rejected</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  if (!approval && !loading) return null;

  const recordedMins = approval ? Math.round(approval.recorded_duration / 60) : 0;
  const estimatedMins = approval?.task_estimated_minutes || 0;
  const maxApprovedMins = approval?.maximum_approved_minutes || 0;
  const approvedMins = approval?.approved_duration ? Math.round(approval.approved_duration / 60) : 0;
  const varianceMins = estimatedMins > 0 ? recordedMins - estimatedMins : 0;

  const isOverMax = maxApprovedMins > 0 && recordedMins > maxApprovedMins;
  const isOverEst = estimatedMins > 0 && recordedMins > estimatedMins;

  return (
    <Drawer
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          Time Approval Details
        </Typography.Title>
      }
      open={open}
      onClose={onClose}
      width={720}
      extra={
        approval && approval.status === TaskTimeApprovalStatus.PENDING ? (
          <Space>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              style={{ backgroundColor: '#52c41a' }}
              onClick={() => onActionClick(approval, 'approve')}
            >
              Approve
            </Button>
            <Button
              icon={<EditOutlined />}
              onClick={() => onActionClick(approval, 'adjust')}
            >
              Adjust
            </Button>
            <Button
              danger
              icon={<CloseOutlined />}
              onClick={() => onActionClick(approval, 'reject')}
            >
              Reject
            </Button>
          </Space>
        ) : null
      }
    >
      {loading || !approval ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <Flex vertical gap={16}>
          {/* Header Card */}
          <Card size="small" style={{ backgroundColor: '#fafafa', borderRadius: 8 }}>
            <Flex vertical gap={8}>
              <Flex justify="space-between" align="start">
                <div>
                  <Flex align="center" gap={8}>
                    {approval.task_no && (
                      <Tag style={{ fontSize: 12, fontWeight: 700 }}>
                        #{approval.task_no}
                      </Tag>
                    )}
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {approval.task_name}
                    </Typography.Title>
                  </Flex>
                  <Flex align="center" gap={6} style={{ marginTop: 6 }}>
                    <Tag color="geekblue">{approval.project_name}</Tag>
                    {approval.task_status_name && (
                      <Tag
                        style={{
                          borderColor: approval.task_status_color || undefined,
                          color: approval.task_status_color || undefined,
                        }}
                      >
                        {approval.task_status_name}
                      </Tag>
                    )}
                  </Flex>
                </div>
                {renderStatusTag(approval.status)}
              </Flex>

              <Divider style={{ margin: '8px 0' }} />

              <Flex justify="space-between" align="center">
                <Flex align="center" gap={8}>
                  <SingleAvatar avatarUrl={approval.member_avatar_url} name={approval.member_name} />
                  <div>
                    <Typography.Text strong>{approval.member_name}</Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 11 }}>
                      {approval.member_email}
                    </Typography.Paragraph>
                  </div>
                </Flex>

                <div style={{ textAlign: 'right' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Submission: <Typography.Text strong>#{approval.submission_number} (v{approval.version})</Typography.Text>
                  </Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 11 }}>
                    Submitted on {formatDateTimeWithUserTimezone(approval.submitted_at, currentSession?.timezone_name)}
                  </Typography.Paragraph>
                </div>
              </Flex>
            </Flex>
          </Card>

          {/* Limit Warnings */}
          {isOverMax && (
            <Alert
              type="error"
              showIcon
              icon={<WarningOutlined />}
              message="Exceeds Maximum Approved Time Limit"
              description={`The recorded time of ${formatDurationDisplay(recordedMins)} exceeds the task's maximum approved limit of ${formatDurationDisplay(maxApprovedMins)} by ${formatDurationDisplay(recordedMins - maxApprovedMins)} (${recordedMins - maxApprovedMins} mins).`}
            />
          )}

          {!isOverMax && isOverEst && (
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="Exceeds Estimated Time"
              description={`Recorded time of ${formatDurationDisplay(recordedMins)} exceeds the task estimate of ${formatDurationDisplay(estimatedMins)} by ${formatDurationDisplay(varianceMins)} (+${approval.variance_percentage}%).`}
            />
          )}

          {/* Time Metrics Grid */}
          <Flex gap={12} wrap="wrap">
            <Card size="small" style={{ flex: 1, minWidth: 120, textAlign: 'center', borderRadius: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Estimated Time
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0 0' }}>
                {estimatedMins > 0 ? formatDurationDisplay(estimatedMins) : '—'}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {estimatedMins > 0 ? `${estimatedMins} mins` : 'No estimate'}
              </Typography.Text>
            </Card>

            <Card size="small" style={{ flex: 1, minWidth: 120, textAlign: 'center', borderRadius: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Max Approved Limit
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0 0', color: isOverMax ? '#cf1322' : undefined }}>
                {maxApprovedMins > 0 ? formatDurationDisplay(maxApprovedMins) : '—'}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {maxApprovedMins > 0 ? `${maxApprovedMins} mins` : 'No limit set'}
              </Typography.Text>
            </Card>

            <Card size="small" style={{ flex: 1, minWidth: 120, textAlign: 'center', borderRadius: 8, backgroundColor: '#f0f5ff' }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Recorded Duration
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0 0', color: '#1677ff' }}>
                {formatDurationDisplay(recordedMins)}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {recordedMins} mins
              </Typography.Text>
            </Card>

            <Card size="small" style={{ flex: 1, minWidth: 120, textAlign: 'center', borderRadius: 8, backgroundColor: '#f6ffed' }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Approved Duration
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0 0', color: '#52c41a' }}>
                {approval.status === TaskTimeApprovalStatus.PENDING ? '—' : formatDurationDisplay(approvedMins)}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {approval.status === TaskTimeApprovalStatus.PENDING ? 'Pending' : `${approvedMins} mins`}
              </Typography.Text>
            </Card>

            <Card size="small" style={{ flex: 1, minWidth: 120, textAlign: 'center', borderRadius: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Variance (vs Est)
              </Typography.Text>
              <Typography.Title
                level={4}
                style={{
                  margin: '4px 0 0 0',
                  color: varianceMins > 0 ? '#cf1322' : '#389e0d',
                }}
              >
                {estimatedMins > 0 ? (varianceMins > 0 ? `+${formatDurationDisplay(varianceMins)}` : formatDurationDisplay(varianceMins)) : 'N/A'}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {approval.variance_percentage !== undefined && approval.variance_percentage !== null
                  ? `${varianceMins > 0 ? '+' : ''}${approval.variance_percentage}%`
                  : 'N/A'}
              </Typography.Text>
            </Card>
          </Flex>

          {/* Notes and Reasons */}
          {approval.adjustment_reason && (
            <Alert
              type="info"
              showIcon
              message="Manager Adjustment Reason"
              description={approval.adjustment_reason}
            />
          )}

          {approval.rejection_reason && (
            <Alert
              type="error"
              showIcon
              message="Rejection Reason"
              description={approval.rejection_reason}
            />
          )}

          {approval.manager_comment && (
            <Alert
              type="success"
              showIcon
              message="Manager Comment"
              description={approval.manager_comment}
            />
          )}

          {/* Detailed Work Logs Table */}
          <div>
            <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                Individual Time Log Entries ({approval.time_logs?.length || 0})
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Total Recorded: {formatDurationDisplay(recordedMins)}
              </Typography.Text>
            </Flex>

            <Table
              size="small"
              pagination={false}
              dataSource={approval.time_logs || []}
              rowKey="id"
              columns={[
                {
                  title: 'Date & Time',
                  dataIndex: 'created_at',
                  key: 'created_at',
                  render: (val: string) => formatDateTimeWithUserTimezone(val, currentSession?.timezone_name),
                },
                {
                  title: 'Duration',
                  dataIndex: 'time_spent',
                  key: 'time_spent',
                  render: (seconds: number) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = seconds % 60;
                    return (
                      <Typography.Text strong>
                        {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
                      </Typography.Text>
                    );
                  },
                },
                {
                  title: 'Type',
                  dataIndex: 'logged_by_timer',
                  key: 'logged_by_timer',
                  render: (timer: boolean) => (timer ? <Tag color="blue" icon={<FieldTimeOutlined />}>Timer</Tag> : <Tag>Manual</Tag>),
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  render: (desc: string | null) => desc || <Typography.Text type="secondary">—</Typography.Text>,
                },
              ]}
            />
          </div>

          {/* Submission History Timeline */}
          {approval.history && approval.history.length > 0 && (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 12 }}>
                Submission & Review History
              </Typography.Title>
              <Timeline
                items={approval.history.map(item => ({
                  color:
                    item.status === TaskTimeApprovalStatus.APPROVED
                      ? 'green'
                      : item.status === TaskTimeApprovalStatus.REJECTED
                      ? 'red'
                      : item.status === TaskTimeApprovalStatus.ADJUSTED
                      ? 'blue'
                      : 'orange',
                  children: (
                    <Card size="small" style={{ marginBottom: 8, borderRadius: 6 }}>
                      <Flex justify="space-between" align="center">
                        <Typography.Text strong>
                          Submission #{item.submission_number} (v{item.version}) — {item.status}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {formatDateTimeWithUserTimezone(item.submitted_at, currentSession?.timezone_name)}
                        </Typography.Text>
                      </Flex>
                      <div style={{ marginTop: 4 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Recorded: {formatDurationDisplay(Math.round(item.recorded_duration / 60))} ({Math.round(item.recorded_duration / 60)}m)
                          {item.status !== TaskTimeApprovalStatus.PENDING && (
                            <> | Approved: {formatDurationDisplay(Math.round(item.approved_duration / 60))} ({Math.round(item.approved_duration / 60)}m)</>
                          )}
                        </Typography.Text>
                      </div>
                      {item.adjustment_reason && (
                        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 11 }}>
                          <strong>Adjustment:</strong> {item.adjustment_reason}
                        </Typography.Paragraph>
                      )}
                      {item.rejection_reason && (
                        <Typography.Paragraph type="danger" style={{ margin: '4px 0 0 0', fontSize: 11 }}>
                          <strong>Rejection:</strong> {item.rejection_reason}
                        </Typography.Paragraph>
                      )}
                      {item.manager_comment && (
                        <Typography.Paragraph style={{ margin: '4px 0 0 0', fontSize: 11, color: '#389e0d' }}>
                          <strong>Comment:</strong> {item.manager_comment}
                        </Typography.Paragraph>
                      )}
                    </Card>
                  ),
                }))}
              />
            </div>
          )}
        </Flex>
      )}
    </Drawer>
  );
};

export default ApprovalDetailDrawer;
