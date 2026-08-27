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
  Button,
  Switch,
  Tooltip,
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  FilterOutlined,
  ReloadOutlined,
  WarningOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import { teamMembersApiService } from '@/api/team-members/teamMembers.api.service';
import { projectsApiService } from '@/api/projects/projects.api.service';
import { ITaskTimeApproval, TaskTimeApprovalStatus } from '@/types/time-approval.types';
import ApprovalsTable from '@/components/approvals/ApprovalsTable';
import ApprovalActionModal from '@/components/approvals/ApprovalActionModal';
import ApprovalDetailDrawer from '@/components/approvals/ApprovalDetailDrawer';
import MyTimesheetView from '@/components/timesheets/MyTimesheetView';
import { useAuthService } from '@/hooks/useAuth';
import { useSocket } from '@/socket/socketContext';
import { SocketEvents } from '@/shared/socket-events';

export const ApprovalsPage: React.FC = () => {
  const [approvals, setApprovals] = useState<ITaskTimeApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('pending');

  // Filter options state
  const [membersList, setMembersList] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsList, setProjectsList] = useState<Array<{ id: string; name: string }>>([]);

  // Active filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<TaskTimeApprovalStatus | 'ALL'>('ALL');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [onlyOverEstimate, setOnlyOverEstimate] = useState<boolean>(false);
  const [onlyOverMax, setOnlyOverMax] = useState<boolean>(false);

  // Modals & Drawers state
  const [selectedApproval, setSelectedApproval] = useState<ITaskTimeApproval | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState<boolean>(false);
  const [actionModalMode, setActionModalMode] = useState<'approve' | 'adjust' | 'reject'>('approve');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const currentSession = useAuthService().getCurrentSession();
  const { socket } = useSocket();

  // Load members and projects for filter dropdowns
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [membersRes, projectsRes] = await Promise.all([
          teamMembersApiService.getAll(),
          projectsApiService.getProjects(0, 100, null, null, null),
        ]);

        if (membersRes.done && Array.isArray(membersRes.body)) {
          setMembersList(
            membersRes.body.map((m: any) => ({
              id: m.id,
              name: m.name || m.user_name || m.email,
            }))
          );
        }

        if (projectsRes.done && projectsRes.body?.data) {
          setProjectsList(
            projectsRes.body.data.map((p: any) => ({
              id: p.id,
              name: p.name,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load lookup filters:', err);
      }
    };

    loadLookups();
  }, []);

  const fetchApprovals = useCallback(async () => {
    if (activeTab === 'timesheet') return;
    try {
      setLoading(true);
      let res;
      if (activeTab === 'my') {
        res = await timeApprovalsApiService.getMySubmissions();
      } else {
        const statusFilter =
          activeTab === 'pending'
            ? TaskTimeApprovalStatus.PENDING
            : selectedStatus !== 'ALL'
            ? selectedStatus
            : 'ALL';

        res = await timeApprovalsApiService.getPendingApprovals({
          status: statusFilter,
          employee_id: selectedMemberId,
          project_id: selectedProjectId,
          start_date: dateRange?.[0] ? dateRange[0].toISOString() : undefined,
          end_date: dateRange?.[1] ? dateRange[1].toISOString() : undefined,
          over_estimate: onlyOverEstimate || undefined,
          over_maximum: onlyOverMax || undefined,
          search: searchQuery.trim() || undefined,
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
  }, [
    activeTab,
    selectedStatus,
    selectedMemberId,
    selectedProjectId,
    dateRange,
    onlyOverEstimate,
    onlyOverMax,
    searchQuery,
  ]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Real-time updates via WebSockets
  useEffect(() => {
    const handleTimeLogUpdated = () => {
      fetchApprovals();
    };

    socket?.on(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), handleTimeLogUpdated);
    return () => {
      socket?.off(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), handleTimeLogUpdated);
    };
  }, [socket, fetchApprovals]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMemberId(undefined);
    setSelectedProjectId(undefined);
    setSelectedStatus('ALL');
    setDateRange(null);
    setOnlyOverEstimate(false);
    setOnlyOverMax(false);
  };

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

  const exceededLimitCount = approvals.filter(
    a => (a.maximum_approved_minutes && a.recorded_duration > a.maximum_approved_minutes * 60) ||
         (a.task_estimated_minutes && a.recorded_duration > a.task_estimated_minutes * 60)
  ).length;

  // Local client filter for instant search responsiveness
  const filteredApprovals = approvals.filter(item => {
    if (onlyOverEstimate) {
      if (!item.task_estimated_minutes || item.recorded_duration <= item.task_estimated_minutes * 60) {
        return false;
      }
    }
    if (onlyOverMax) {
      if (!item.maximum_approved_minutes || item.recorded_duration <= item.maximum_approved_minutes * 60) {
        return false;
      }
    }
    if (selectedMemberId && item.team_member_id !== selectedMemberId) {
      return false;
    }
    if (selectedProjectId && item.project_id !== selectedProjectId) {
      return false;
    }
    if (selectedStatus !== 'ALL' && activeTab !== 'pending' && item.status !== selectedStatus) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.task_name?.toLowerCase().includes(q) ||
      item.member_name?.toLowerCase().includes(q) ||
      item.project_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Time Tracking & Approvals
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            Review, adjust, and approve team time submissions with comprehensive audit trail, variance analysis, and limit warnings.
          </Typography.Paragraph>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={fetchApprovals}
        >
          Refresh
        </Button>
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
                <Card bordered={true} style={{ borderRadius: 8, backgroundColor: '#fffbe6' }}>
                  <Statistic
                    title="Pending Approvals"
                    value={pendingCount}
                    prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                    valueStyle={{ color: pendingCount > 0 ? '#d48806' : undefined, fontWeight: 700 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {(pendingTotalMinutes / 60).toFixed(1)} hrs awaiting review
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card bordered={true} style={{ borderRadius: 8, backgroundColor: '#f6ffed' }}>
                  <Statistic
                    title="Approved Time"
                    value={`${(approvedTotalMinutes / 60).toFixed(1)} hrs`}
                    prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    valueStyle={{ color: '#389e0d', fontWeight: 700 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {approvedTotalMinutes} total approved minutes
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card bordered={true} style={{ borderRadius: 8, backgroundColor: '#f9f0ff' }}>
                  <Statistic
                    title="Adjusted Submissions"
                    value={adjustedCount}
                    prefix={<ExclamationCircleOutlined style={{ color: '#722ed1' }} />}
                    valueStyle={{ color: '#531dab', fontWeight: 700 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    With manager adjustment reasons
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Card bordered={true} style={{ borderRadius: 8, backgroundColor: exceededLimitCount > 0 ? '#fff1f0' : '#fafafa' }}>
                  <Statistic
                    title="Exceeded Limits / Est."
                    value={exceededLimitCount}
                    prefix={<WarningOutlined style={{ color: exceededLimitCount > 0 ? '#ff4d4f' : '#8c8c8c' }} />}
                    valueStyle={{ color: exceededLimitCount > 0 ? '#cf1322' : undefined, fontWeight: 700 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    Over estimate or maximum cap
                  </Typography.Text>
                </Card>
              </Col>
            </Row>

            {/* Filter Toolbar */}
            {activeTab !== 'my' && (
              <Card
                size="small"
                style={{
                  marginBottom: 16,
                  backgroundColor: '#fafafa',
                  borderRadius: 6,
                  borderColor: '#f0f0f0',
                }}
              >
                <Row gutter={[12, 12]} align="middle">
                  {/* Search Input */}
                  <Col xs={24} sm={12} md={6}>
                    <Input
                      placeholder="Search employee, task, project..."
                      prefix={<SearchOutlined />}
                      allowClear
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </Col>

                  {/* Employee Filter */}
                  <Col xs={24} sm={12} md={4}>
                    <Select
                      placeholder="All Employees"
                      allowClear
                      showSearch
                      optionFilterProp="children"
                      value={selectedMemberId}
                      onChange={setSelectedMemberId}
                      style={{ width: '100%' }}
                      options={membersList.map(m => ({ label: m.name, value: m.id }))}
                    />
                  </Col>

                  {/* Project Filter */}
                  <Col xs={24} sm={12} md={4}>
                    <Select
                      placeholder="All Projects"
                      allowClear
                      showSearch
                      optionFilterProp="children"
                      value={selectedProjectId}
                      onChange={setSelectedProjectId}
                      style={{ width: '100%' }}
                      options={projectsList.map(p => ({ label: p.name, value: p.id }))}
                    />
                  </Col>

                  {/* Status Filter (when in 'all' tab) */}
                  {activeTab === 'all' && (
                    <Col xs={24} sm={12} md={3}>
                      <Select
                        placeholder="Status"
                        value={selectedStatus}
                        onChange={setSelectedStatus}
                        style={{ width: '100%' }}
                        options={[
                          { label: 'All Statuses', value: 'ALL' },
                          { label: 'Pending', value: TaskTimeApprovalStatus.PENDING },
                          { label: 'Approved', value: TaskTimeApprovalStatus.APPROVED },
                          { label: 'Adjusted', value: TaskTimeApprovalStatus.ADJUSTED },
                          { label: 'Rejected', value: TaskTimeApprovalStatus.REJECTED },
                        ]}
                      />
                    </Col>
                  )}

                  {/* Date Range Filter */}
                  <Col xs={24} sm={12} md={activeTab === 'all' ? 4 : 5}>
                    <DatePicker.RangePicker
                      value={dateRange}
                      onChange={(dates) => setDateRange(dates as any)}
                      style={{ width: '100%' }}
                    />
                  </Col>

                  {/* Toggles & Clear Filters */}
                  <Col xs={24} sm={24} md={activeTab === 'all' ? 3 : 5}>
                    <Flex align="center" justify="flex-end" gap={12} wrap="wrap">
                      <Tooltip title="Filter tasks that exceeded the estimated time">
                        <Flex align="center" gap={4}>
                          <Switch
                            size="small"
                            checked={onlyOverEstimate}
                            onChange={setOnlyOverEstimate}
                          />
                          <Typography.Text style={{ fontSize: 11 }}>Over Est</Typography.Text>
                        </Flex>
                      </Tooltip>

                      <Tooltip title="Filter tasks that exceeded the maximum approved limit">
                        <Flex align="center" gap={4}>
                          <Switch
                            size="small"
                            checked={onlyOverMax}
                            onChange={setOnlyOverMax}
                          />
                          <Typography.Text style={{ fontSize: 11 }}>Over Max</Typography.Text>
                        </Flex>
                      </Tooltip>

                      <Button
                        size="small"
                        icon={<ClearOutlined />}
                        onClick={handleResetFilters}
                      >
                        Reset
                      </Button>
                    </Flex>
                  </Col>
                </Row>
              </Card>
            )}

            {/* Approvals Table */}
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
