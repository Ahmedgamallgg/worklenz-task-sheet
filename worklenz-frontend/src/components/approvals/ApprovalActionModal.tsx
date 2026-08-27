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
  message,
} from '@/shared/antd-imports';
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
  const varianceMinutes = recordedMinutes - estimatedMinutes;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (actionType === 'approve') {
        const res = await timeApprovalsApiService.approve(approval.id, {
          manager_comment: values.manager_comment,
        });
        if (res.done) {
          message.success('Time approval confirmed successfully.');
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
          message.success('Time submission rejected.');
          onSuccess();
          onClose();
        } else {
          message.error(res.message || 'Failed to reject time.');
        }
      }
    } catch (err: any) {
      if (err?.errorFields) return; // Antd validation error
      message.error(err?.response?.data?.message || 'Error processing request.');
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
      width={560}
      destroyOnClose
    >
      <div style={{ marginBlock: 16 }}>
        {/* Task and Member Summary */}
        <Flex vertical gap={6} style={{ backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <Flex justify="space-between" align="center">
            <Typography.Text strong style={{ fontSize: 14 }}>
              {approval.task_name}
            </Typography.Text>
            <Tag color="blue">{approval.project_name}</Tag>
          </Flex>
          <Flex justify="space-between" align="center" style={{ fontSize: 12 }}>
            <Typography.Text type="secondary">
              Employee: <Typography.Text strong>{approval.member_name}</Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary">
              Recorded: <Typography.Text strong>{recordedMinutes} mins</Typography.Text>
            </Typography.Text>
          </Flex>
          {estimatedMinutes > 0 && (
            <Flex justify="space-between" align="center" style={{ fontSize: 12 }}>
              <Typography.Text type="secondary">
                Estimated: <Typography.Text>{estimatedMinutes} mins</Typography.Text>
              </Typography.Text>
              <Typography.Text type={varianceMinutes > 0 ? 'danger' : 'success'}>
                Variance: {varianceMinutes > 0 ? `+${varianceMinutes}` : varianceMinutes} mins
                {approval.variance_percentage !== undefined && approval.variance_percentage !== null && ` (${approval.variance_percentage}%)`}
              </Typography.Text>
            </Flex>
          )}
        </Flex>

        <Form form={form} layout="vertical" initialValues={{ actionType: initialMode }}>
          <Form.Item label="Decision" name="actionType">
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
                Reject
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {actionType === 'approve' && (
            <Alert
              type="success"
              showIcon
              message={`Approve recorded time of ${recordedMinutes} minutes (${(recordedMinutes / 60).toFixed(1)}h).`}
              style={{ marginBottom: 16 }}
            />
          )}

          {actionType === 'adjust' && (
            <>
              <Alert
                type="warning"
                showIcon
                message="Adjusting the approved duration will NOT modify the employee's original logged entries. Both are preserved for reporting auditability."
                style={{ marginBottom: 16 }}
              />
              <Form.Item
                label="Approved Minutes"
                name="approved_minutes"
                rules={[
                  { required: true, message: 'Please specify approved minutes' },
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
              <Form.Item
                label="Adjustment Reason (Mandatory)"
                name="adjustment_reason"
                rules={[
                  { required: true, message: 'Adjustment reason is required when modifying time' },
                  { whitespace: true, message: 'Adjustment reason cannot be blank' },
                ]}
              >
                <Input.TextArea
                  rows={2}
                  placeholder="Explain why approved duration differs from recorded duration..."
                />
              </Form.Item>
            </>
          )}

          {actionType === 'reject' && (
            <>
              <Alert
                type="error"
                showIcon
                message="Rejection returns the submission to the employee for correction and resubmission."
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
                  placeholder="Explain what needs to be corrected before resubmission..."
                />
              </Form.Item>
            </>
          )}

          <Form.Item label="Manager Comment (Optional)" name="manager_comment">
            <Input.TextArea rows={2} placeholder="Optional message or note for the team member..." />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default ApprovalActionModal;
