import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Col,
  Flex,
  Input,
  Row,
  Select,
  Space,
  Tabs,
  Typography,
  message,
  Statistic,
  DatePicker,
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  CheckOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import { ITaskTimeApproval, TaskTimeApprovalStatus } from '@/types/time-approval.types';
import ApprovalsTable from '@/components/approvals/ApprovalsTable';
import ApprovalActionModal from '@/components/approvals/ApprovalActionModal';
import ApprovalDetailDrawer from '@/components/approvals/ApprovalDetailDrawer';
import MyTimesheetView from '@/components/timesheets/MyTimesheetView';
import { useAuthService } from '@/hooks/useAuth';

export const ApprovalsPage: React.FC = () => {
  const [approvals, setApprovals] = useState<ITaskTimeApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawers state
  const [selectedApproval, setSelectedApproval] = useState<ITaskTimeApproval | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState<boolean>(false);
  const [actionModalMode, setActionModalMode] = useState<'approve' | 'adjust' | 'reject'>('approve');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const currentSession = useAuthService().getCurrentSession();

  const fetchApprovals = useCallback(async () => {
    if (activeTab === 'timesheet') return;
    try {
      setLoading(true);
      let res;
      if (activeTab === 'my') {
        res = await timeApprovalsApiService.getMySubmissions();
      } else {
        const statusFilter = activeTab === 'pending' ? TaskTimeApprovalStatus.PENDING : 'ALL';
        res = await timeApprovalsApiService.getPendingApprovals({
          status: statusFilter,
        });
      }

      if (res.done && Array.isArray(res.body)) {
        setApprovals(res.body);
      }
    } catch (err) {
      console.error('Failed to load approvals:', err);
      message.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleOpenActionModal = (approval: ITaskTimeApproval, mode: 'approve' | 'adjust' | 'reject') => {
    setSelectedApproval(approval);
    setActionModalMode(mode);
    setActionModalOpen(true);
  };

  const handleOpenDrawer = (approval: ITaskTimeApproval) => {
    setSelectedApproval(approval);
    setDrawerOpen(true);
  };

  const handleDirectApprove = async (approval: ITaskTimeApproval) => {
    try {
      const res = await timeApprovalsApiService.approve(approval.id);
      if (res.done) {
        message.success(`Time approved for ${approval.member_name}`);
        fetchApprovals();
      } else {
        message.error(res.message || 'Failed to approve');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Error approving time');
    }
  };

  // Metrics computation
  const pendingCount = approvals.filter(a => a.status === TaskTimeApprovalStatus.PENDING).length;
  const pendingTotalMinutes = approvals
    .filter(a => a.status === TaskTimeApprovalStatus.PENDING)
    .reduce((sum, a) => sum + Math.round(a.recorded_duration / 60), 0);

  const approvedTotalMinutes = approvals
    .filter(a => a.status === TaskTimeApprovalStatus.APPROVED || a.status === TaskTimeApprovalStatus.ADJUSTED)
    .reduce((sum, a) => sum + Math.round((a.approved_duration || 0) / 60), 0);

  const adjustedCount = approvals.filter(a => a.status === TaskTimeApprovalStatus.ADJUSTED).length;

  const filteredApprovals = approvals.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.task_name?.toLowerCase().includes(q) ||
      item.member_name?.toLowerCase().includes(q) ||
      item.project_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Time Tracking & Approvals
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            Review, adjust, and approve employee logged hours with full audit trail.
          </Typography.Paragraph>
        </div>
      </Flex>

      {/* Main Table Card */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 20 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'pending', label: `Pending Approvals (${pendingCount})` },
            { key: 'all', label: 'All Team Submissions' },
            { key: 'my', label: 'My Submissions' },
            { key: 'timesheet', label: 'My Timesheet' },
          ]}
        />

        {activeTab !== 'timesheet' && (
          <>
            {/* KPI Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20, marginTop: 12 }}>
              <Col xs={24} sm={12} md={6}>
                <Card bordered={true} style={{ borderRadius: 8 }}>
                  <Statistic
                    title="Pending Approvals"
                    value={pendingCount}
                    prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                    valueStyle={{ color: pendingCount > 0 ? '#fa8c16' : undefined, fontWeight: 700 }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card bordered={true} style={{ borderRadius: 8 }}>
                  <Statistic
                    title="Pending Duration"
                    value={`${(pendingTotalMinutes / 60).toFixed(1)} hrs`}
                    prefix={<ClockCircleOutlined style={{ color: '#1677ff' }} />}
                    valueStyle={{ fontWeight: 700 }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card bordered={true} style={{ borderRadius: 8 }}>
                  <Statistic
                    title="Approved Time"
                    value={`${(approvedTotalMinutes / 60).toFixed(1)} hrs`}
                    prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    valueStyle={{ color: '#52c41a', fontWeight: 700 }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card bordered={true} style={{ borderRadius: 8 }}>
                  <Statistic
                    title="Adjusted Submissions"
                    value={adjustedCount}
                    prefix={<ExclamationCircleOutlined style={{ color: '#722ed1' }} />}
                    valueStyle={{ fontWeight: 700 }}
                  />
                </Card>
              </Col>
            </Row>

            <Flex justify="flex-end" align="center" style={{ marginBottom: 16 }}>
              <Input
                placeholder="Search employee, task, project..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: 280 }}
              />
            </Flex>

            <ApprovalsTable
              data={filteredApprovals}
              loading={loading}
              onActionClick={handleOpenActionModal}
              onViewDetail={handleOpenDrawer}
              onDirectApprove={handleDirectApprove}
            />
          </>
        )}

        {activeTab === 'timesheet' && (
          <div style={{ marginTop: 16 }}>
            <MyTimesheetView />
          </div>
        )}
      </Card>

      {/* Action Modal */}
      <ApprovalActionModal
        open={actionModalOpen}
        approval={selectedApproval}
        initialMode={actionModalMode}
        onClose={() => setActionModalOpen(false)}
        onSuccess={fetchApprovals}
      />

      {/* Detail Drawer */}
      <ApprovalDetailDrawer
        open={drawerOpen}
        approvalId={selectedApproval?.id || null}
        onClose={() => setDrawerOpen(false)}
        onActionClick={(approval, mode) => {
          setDrawerOpen(false);
          handleOpenActionModal(approval, mode);
        }}
      />
    </div>
  );
};

export default ApprovalsPage;
