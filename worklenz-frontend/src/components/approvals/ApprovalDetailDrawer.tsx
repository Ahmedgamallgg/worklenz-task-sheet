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
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  EditOutlined,
  CloseOutlined,
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

  return (
    <Drawer
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          Time Approval Details
        </Typography.Title>
      }
      open={open}
      onClose={onClose}
      width={680}
      extra={
        approval && approval.status === TaskTimeApprovalStatus.PENDING ? (
          <Space>
            <Button
              type="primary"
              icon={<CheckOutlined />}
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
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Flex vertical gap={16}>
          {/* Header Card */}
          <Card size="small" style={{ backgroundColor: '#fafafa' }}>
            <Flex vertical gap={8}>
              <Flex justify="space-between" align="start">
                <div>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {approval.task_name}
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Project: <Typography.Text strong>{approval.project_name}</Typography.Text>
                  </Typography.Text>
                </div>
                {renderStatusTag(approval.status)}
              </Flex>

              <Divider style={{ margin: '6px 0' }} />

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

          {/* Time Metrics Grid */}
          <Flex gap={12}>
            <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Recorded Duration
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0 0' }}>
                {Math.round(approval.recorded_duration / 60)}m
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                ({(approval.recorded_duration / 3600).toFixed(1)} hrs)
              </Typography.Text>
            </Card>

            <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Approved Duration
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0 0', color: '#52c41a' }}>
                {Math.round((approval.approved_duration || 0) / 60)}m
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                ({((approval.approved_duration || 0) / 3600).toFixed(1)} hrs)
              </Typography.Text>
            </Card>

            <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Estimated
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: '4px 0 0 0' }}>
                {approval.task_estimated_minutes || 0}m
              </Typography.Title>
              <Typography.Text
                type={
                  (approval.variance_seconds || 0) > 0 ? 'danger' : 'success'
                }
                style={{ fontSize: 11 }}
              >
                Variance: {Math.round((approval.variance_seconds || 0) / 60)}m
              </Typography.Text>
            </Card>
          </Flex>

          {/* Notes and Reasons */}
          {approval.adjustment_reason && (
            <Alert
              type="info"
              showIcon
              message="Adjustment Reason"
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
            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              Recorded Time Log Entries
            </Typography.Title>
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
                    return <Typography.Text strong>{mins}m {secs}s</Typography.Text>;
                  },
                },
                {
                  title: 'Type',
                  dataIndex: 'logged_by_timer',
                  key: 'logged_by_timer',
                  render: (timer: boolean) => (timer ? <Tag color="blue">Timer</Tag> : <Tag>Manual</Tag>),
                },
                {
                  title: 'Description',
                  dataIndex: 'description',
                  key: 'description',
                  render: (desc: string | null) => desc || <Typography.Text type="secondary">-</Typography.Text>,
                },
              ]}
            />
          </div>

          {/* Submission History Timeline */}
          {approval.history && approval.history.length > 0 && (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 12 }}>
                Submission History
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
                    <div>
                      <Typography.Text strong>
                        Submission #{item.submission_number} (v{item.version}) - {item.status}
                      </Typography.Text>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Recorded: {Math.round(item.recorded_duration / 60)}m | Approved: {Math.round(item.approved_duration / 60)}m
                        </Typography.Text>
                      </div>
                      {item.adjustment_reason && (
                        <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 11 }}>
                          Adjustment: {item.adjustment_reason}
                        </Typography.Paragraph>
                      )}
                      {item.rejection_reason && (
                        <Typography.Paragraph type="danger" style={{ margin: 0, fontSize: 11 }}>
                          Rejection: {item.rejection_reason}
                        </Typography.Paragraph>
                      )}
                    </div>
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
