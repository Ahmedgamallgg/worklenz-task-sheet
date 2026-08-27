import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Radio,
  Space,
  Typography,
  Alert,
  Divider,
  Flex,
  Tag,
  Button,
  message,
} from '@/shared/antd-imports';
import { WarningOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { ITaskTimeApproval, TaskTimeApprovalStatus } from '@/types/time-approval.types';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';

interface ApprovalActionModalProps {
  open: boolean;
  approval: ITaskTimeApproval | null;
  initialMode?: 'approve' | 'adjust' | 'reject';
  onClose: () => void;
  onSuccess: () => void;
}

export const ApprovalActionModal: React.FC<ApprovalActionModalProps> = ({
  open,
  approval,
  initialMode = 'approve',
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [actionType, setActionType] = useState<'approve' | 'adjust' | 'reject'>(initialMode);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (open && approval) {
      setActionType(initialMode);
      const recordedMinutes = Math.round(approval.recorded_duration / 60);
      form.setFieldsValue({
        actionType: initialMode,
        approved_minutes: recordedMinutes,
        adjustment_reason: '',
        rejection_reason: '',
        manager_comment: '',
      });
    }
  }, [open, approval, initialMode, form]);

  if (!approval) return null;

  const recordedMinutes = Math.round(approval.recorded_duration / 60);
  const estimatedMinutes = approval.task_estimated_minutes || 0;
  const maxApprovedMinutes = approval.maximum_approved_minutes || 0;
  const varianceMinutes = estimatedMinutes > 0 ? recordedMinutes - estimatedMinutes : 0;

  const isOverMax = maxApprovedMinutes > 0 && recordedMinutes > maxApprovedMinutes;
  const isOverEst = estimatedMinutes > 0 && recordedMinutes > estimatedMinutes;

  const formatDurationDisplay = (totalMinutes: number) => {
    if (totalMinutes <= 0) return '0m';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const handleApplyPreset = (minutes: number) => {
    form.setFieldsValue({ approved_minutes: minutes });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (actionType === 'approve') {
        const res = await timeApprovalsApiService.approve(approval.id, {
          manager_comment: values.manager_comment,
        });
        if (res.done) {
          message.success('Time approved successfully.');
          onSuccess();
          onClose();
        } else {
          message.error(res.message || 'Failed to approve time.');
        }
      } else if (actionType === 'adjust') {
        const approvedSeconds = (values.approved_minutes || 0) * 60;
        const res = await timeApprovalsApiService.adjust(approval.id, {
          approved_duration: approvedSeconds,
          adjustment_reason: values.adjustment_reason,
          manager_comment: values.manager_comment,
        });
        if (res.done) {
          message.success('Time adjusted and approved successfully.');
          onSuccess();
          onClose();
        } else {
          message.error(res.message || 'Failed to adjust time.');
        }
      } else if (actionType === 'reject') {
        const res = await timeApprovalsApiService.reject(approval.id, {
          rejection_reason: values.rejection_reason,
          manager_comment: values.manager_comment,
        });
        if (res.done) {
          message.success('Time submission returned/rejected.');
          onSuccess();
          onClose();
        } else {
          message.error(res.message || 'Failed to reject time.');
        }
      }
    } catch (err: any) {
      if (err?.errorFields) return; // Antd form validation error
      message.error(err?.response?.data?.message || err?.message || 'Error processing request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          Review Time Submission
        </Typography.Title>
      }
      open={open}
      onOk={handleSubmit}
      confirmLoading={submitting}
      onCancel={onClose}
      okText={
        actionType === 'approve'
          ? 'Approve Full Time'
          : actionType === 'adjust'
          ? 'Confirm Adjusted Time'
          : 'Reject Submission'
      }
      okButtonProps={{
        danger: actionType === 'reject',
        type: 'primary',
      }}
      width={600}
      destroyOnClose
    >
      <div style={{ marginBlock: 16 }}>
        {/* Task & Member Overview Card */}
        <Flex vertical gap={8} style={{ backgroundColor: '#f9f9f9', padding: 14, borderRadius: 8, marginBottom: 16 }}>
          <Flex justify="space-between" align="start">
            <div>
              <Typography.Text strong style={{ fontSize: 14 }}>
                {approval.task_name}
              </Typography.Text>
              <div>
                <Tag color="geekblue" style={{ fontSize: 11, marginTop: 4 }}>
                  {approval.project_name}
                </Tag>
                {approval.task_status_name && (
                  <Tag
                    style={{
                      fontSize: 11,
                      marginTop: 4,
                      borderColor: approval.task_status_color || undefined,
                      color: approval.task_status_color || undefined,
                    }}
                  >
                    {approval.task_status_name}
                  </Tag>
                )}
              </div>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Employee: <Typography.Text strong>{approval.member_name}</Typography.Text>
            </Typography.Text>
          </Flex>

          <Divider style={{ margin: '4px 0' }} />

          <Flex justify="space-between" align="center" style={{ fontSize: 12 }}>
            <div>
              <Typography.Text type="secondary">Estimated: </Typography.Text>
              <Typography.Text strong>{estimatedMinutes > 0 ? formatDurationDisplay(estimatedMinutes) : '—'}</Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">Recorded: </Typography.Text>
              <Typography.Text strong style={{ color: '#1677ff' }}>{formatDurationDisplay(recordedMinutes)}</Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">Max Limit: </Typography.Text>
              <Typography.Text strong style={{ color: isOverMax ? '#cf1322' : undefined }}>
                {maxApprovedMinutes > 0 ? formatDurationDisplay(maxApprovedMinutes) : '—'}
              </Typography.Text>
            </div>
            {estimatedMinutes > 0 && (
              <div>
                <Typography.Text type="secondary">Variance: </Typography.Text>
                <Typography.Text type={varianceMinutes > 0 ? 'danger' : 'success'} strong>
                  {varianceMinutes > 0 ? `+${formatDurationDisplay(varianceMinutes)}` : formatDurationDisplay(varianceMinutes)}
                  {approval.variance_percentage !== undefined && approval.variance_percentage !== null && ` (${approval.variance_percentage}%)`}
                </Typography.Text>
              </div>
            )}
          </Flex>
        </Flex>

        {/* Exceeds Limits Warning Banners */}
        {isOverMax && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            message="Exceeds Maximum Approved Time Limit"
            description={`The employee recorded ${formatDurationDisplay(recordedMinutes)}, which exceeds the maximum approved ceiling of ${formatDurationDisplay(maxApprovedMinutes)} by ${formatDurationDisplay(recordedMinutes - maxApprovedMinutes)}.`}
            style={{ marginBottom: 16 }}
          />
        )}

        {!isOverMax && isOverEst && (
          <Alert
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            message="Exceeds Estimated Time"
            description={`The recorded time of ${formatDurationDisplay(recordedMinutes)} is ${formatDurationDisplay(varianceMinutes)} (+${approval.variance_percentage}%) over the estimated time of ${formatDurationDisplay(estimatedMinutes)}.`}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form form={form} layout="vertical" initialValues={{ actionType: initialMode }}>
          <Form.Item label="Decision Action" name="actionType">
            <Radio.Group
              value={actionType}
              onChange={e => setActionType(e.target.value)}
              buttonStyle="solid"
              style={{ width: '100%', display: 'flex' }}
            >
              <Radio.Button value="approve" style={{ flex: 1, textAlign: 'center' }}>
                Approve
              </Radio.Button>
              <Radio.Button value="adjust" style={{ flex: 1, textAlign: 'center' }}>
                Adjust Duration
              </Radio.Button>
              <Radio.Button value="reject" style={{ flex: 1, textAlign: 'center' }}>
                Reject / Return
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {actionType === 'approve' && (
            <Alert
              type="success"
              showIcon
              message={`Approve recorded time of ${formatDurationDisplay(recordedMinutes)} (${recordedMinutes} mins).`}
              style={{ marginBottom: 16 }}
            />
          )}

          {actionType === 'adjust' && (
            <>
              <Alert
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                message="Architectural Rule: Original recorded time logs are NEVER overwritten. Both recorded time and manager-approved time are permanently preserved."
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                label="Approved Minutes"
                name="approved_minutes"
                rules={[
                  { required: true, message: 'Please specify approved duration in minutes' },
                  { type: 'number', min: 0, message: 'Minutes must be at least 0' },
                ]}
              >
                <InputNumber
                  min={0}
                  step={15}
                  style={{ width: '100%' }}
                  addonAfter="Minutes"
                />
              </Form.Item>

              {/* Quick adjustment presets */}
              <Flex gap={8} style={{ marginBottom: 16 }} wrap="wrap">
                <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: '24px' }}>
                  Quick presets:
                </Typography.Text>
                {maxApprovedMinutes > 0 && maxApprovedMinutes !== recordedMinutes && (
                  <Button size="small" onClick={() => handleApplyPreset(maxApprovedMinutes)}>
                    Cap to Max ({formatDurationDisplay(maxApprovedMinutes)})
                  </Button>
                )}
                {estimatedMinutes > 0 && estimatedMinutes !== recordedMinutes && (
                  <Button size="small" onClick={() => handleApplyPreset(estimatedMinutes)}>
                    Set to Estimated ({formatDurationDisplay(estimatedMinutes)})
                  </Button>
                )}
                <Button size="small" onClick={() => handleApplyPreset(Math.max(0, recordedMinutes - 30))}>
                  -30 mins
                </Button>
                <Button size="small" onClick={() => handleApplyPreset(Math.max(0, recordedMinutes - 60))}>
                  -1 hour
                </Button>
              </Flex>

              <Form.Item
                label="Adjustment Reason (Mandatory)"
                name="adjustment_reason"
                rules={[
                  { required: true, message: 'Adjustment reason is required when modifying approved duration' },
                  { whitespace: true, message: 'Adjustment reason cannot be blank' },
                ]}
              >
                <Input.TextArea
                  rows={2}
                  placeholder="Explain why approved duration differs from recorded duration (e.g. 1.5 hours was out of scope)..."
                />
              </Form.Item>
            </>
          )}

          {actionType === 'reject' && (
            <>
              <Alert
                type="error"
                showIcon
                message="Returning this submission allows the employee to adjust time logs and resubmit for approval."
                style={{ marginBottom: 16 }}
              />
              <Form.Item
                label="Rejection Reason (Mandatory)"
                name="rejection_reason"
                rules={[
                  { required: true, message: 'Rejection reason is required' },
                  { whitespace: true, message: 'Rejection reason cannot be blank' },
                ]}
              >
                <Input.TextArea
                  rows={2}
                  placeholder="Explain what needs to be fixed before resubmission..."
                />
              </Form.Item>
            </>
          )}

          <Form.Item label="Manager Comment (Optional)" name="manager_comment">
            <Input.TextArea rows={2} placeholder="Optional feedback or guidance note for the team member..." />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default ApprovalActionModal;
