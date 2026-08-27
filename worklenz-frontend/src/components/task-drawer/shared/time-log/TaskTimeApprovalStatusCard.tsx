import React, { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Flex,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SendOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import { ITaskTimeApproval, TaskTimeApprovalStatus } from '@/types/time-approval.types';
import { useAppSelector } from '@/hooks/useAppSelector';
import { formatSecondsToHoursMinutes } from '@/utils/time-format.utils';

interface TaskTimeApprovalStatusCardProps {
  taskId: string;
  onStatusChange?: () => void;
}

export const TaskTimeApprovalStatusCard: React.FC<TaskTimeApprovalStatusCardProps> = ({
  taskId,
  onStatusChange,
}) => {
  const [approvals, setApprovals] = useState<ITaskTimeApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const currentUser = useAppSelector(state => state.userReducer);

  const fetchApprovals = async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      const res = await timeApprovalsApiService.getByTask(taskId);
      if (res.done && Array.isArray(res.body)) {
        setApprovals(res.body);
      }
    } catch (error) {
      console.error('Error fetching task approvals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [taskId]);

  const latestApproval = approvals.length > 0 ? approvals[0] : null;

  const handleSubmitTime = async () => {
    try {
      setSubmitting(true);
      const res = await timeApprovalsApiService.submit(taskId);
      if (res.done) {
        message.success(res.message || 'Time submitted for manager approval.');
        await fetchApprovals();
        if (onStatusChange) onStatusChange();
      } else {
        message.error(res.message || 'Failed to submit time.');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Error submitting time.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = async (approvalId: string) => {
    try {
      setSubmitting(true);
      const res = await timeApprovalsApiService.resubmit(approvalId);
      if (res.done) {
        message.success(res.message || 'Resubmitted successfully.');
        await fetchApprovals();
        if (onStatusChange) onStatusChange();
      } else {
        message.error(res.message || 'Failed to resubmit.');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Error resubmitting time.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = (status: TaskTimeApprovalStatus) => {
    switch (status) {
      case TaskTimeApprovalStatus.PENDING:
        return (
          <Tag icon={<ClockCircleOutlined />} color="warning">
            Pending Approval
          </Tag>
        );
      case TaskTimeApprovalStatus.APPROVED:
        return (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Approved
          </Tag>
        );
      case TaskTimeApprovalStatus.ADJUSTED:
        return (
          <Tag icon={<ExclamationCircleOutlined />} color="processing">
            Adjusted & Approved
          </Tag>
        );
      case TaskTimeApprovalStatus.REJECTED:
        return (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Rejected
          </Tag>
        );
      default:
        return <Tag>{status}</Tag>;
    }
  };

  if (!latestApproval) {
    return (
      <Card size="small" style={{ marginBottom: 12, backgroundColor: '#fafafa' }}>
        <Flex justify="space-between" align="center">
          <div>
            <Typography.Text strong style={{ fontSize: 13 }}>
              Time Approval
            </Typography.Text>
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
              Submit your logged hours for manager verification.
            </Typography.Paragraph>
          </div>
          <Popconfirm
            title="Submit Time for Approval"
            description="Are you sure you want to submit all recorded time for manager review?"
            okText="Submit"
            cancelText="Cancel"
            onConfirm={handleSubmitTime}
          >
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={submitting}
            >
              Submit Time
            </Button>
          </Popconfirm>
        </Flex>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderColor:
          latestApproval.status === TaskTimeApprovalStatus.APPROVED
            ? '#b7eb8f'
            : latestApproval.status === TaskTimeApprovalStatus.REJECTED
            ? '#ffccc7'
            : latestApproval.status === TaskTimeApprovalStatus.ADJUSTED
            ? '#91caff'
            : '#ffe58f',
      }}
    >
      <Flex vertical gap={6}>
        <Flex justify="space-between" align="center">
          <Space direction="horizontal" size={6}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              Time Approval:
            </Typography.Text>
            {renderStatusBadge(latestApproval.status)}
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              (v{latestApproval.version || 1})
            </Typography.Text>
          </Space>

          {latestApproval.status === TaskTimeApprovalStatus.REJECTED && (
            <Popconfirm
              title="Resubmit for Approval"
              description="Resubmit your time logs after making required updates?"
              okText="Resubmit"
              cancelText="Cancel"
              onConfirm={() => handleResubmit(latestApproval.id)}
            >
              <Button
                type="primary"
                size="small"
                danger
                icon={<SyncOutlined />}
                loading={submitting}
              >
                Resubmit
              </Button>
            </Popconfirm>
          )}
        </Flex>

        <Flex justify="space-between" align="center" style={{ fontSize: 12 }}>
          <Typography.Text type="secondary">
            Recorded: <Typography.Text strong>{formatSecondsToHoursMinutes(latestApproval.recorded_duration || 0)}</Typography.Text>
          </Typography.Text>
          {(latestApproval.status === TaskTimeApprovalStatus.APPROVED ||
            latestApproval.status === TaskTimeApprovalStatus.ADJUSTED) && (
            <Typography.Text type="secondary">
              Approved: <Typography.Text strong style={{ color: '#52c41a' }}>{formatSecondsToHoursMinutes(latestApproval.approved_duration || 0)}</Typography.Text>
            </Typography.Text>
          )}
          {latestApproval.approver_name && (
            <Typography.Text type="secondary">
              Reviewer: <Typography.Text strong>{latestApproval.approver_name}</Typography.Text>
            </Typography.Text>
          )}
        </Flex>

        {latestApproval.status === TaskTimeApprovalStatus.ADJUSTED && latestApproval.adjustment_reason && (
          <Alert
            type="info"
            showIcon
            message={
              <Typography.Text style={{ fontSize: 12 }}>
                <Typography.Text strong>Adjustment Reason: </Typography.Text>
                {latestApproval.adjustment_reason}
              </Typography.Text>
            }
            style={{ padding: '4px 8px', marginTop: 4 }}
          />
        )}

        {latestApproval.status === TaskTimeApprovalStatus.REJECTED && latestApproval.rejection_reason && (
          <Alert
            type="error"
            showIcon
            message={
              <Typography.Text style={{ fontSize: 12 }}>
                <Typography.Text strong>Rejection Reason: </Typography.Text>
                {latestApproval.rejection_reason}
              </Typography.Text>
            }
            style={{ padding: '4px 8px', marginTop: 4 }}
          />
        )}

        {latestApproval.manager_comment && (
          <Typography.Paragraph
            italic
            type="secondary"
            style={{ margin: 0, fontSize: 11 }}
          >
            Manager Comment: "{latestApproval.manager_comment}"
          </Typography.Paragraph>
        )}
      </Flex>
    </Card>
  );
};

export default TaskTimeApprovalStatusCard;
