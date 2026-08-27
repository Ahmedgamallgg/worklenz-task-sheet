import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Col,
  Flex,
  Row,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Skeleton,
  Tooltip,
  Empty,
  message,
} from '@/shared/antd-imports';
import {
  TeamOutlined,
  ProjectOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  FieldTimeOutlined,
  CheckCircleOutlined,
  HourglassOutlined,
  RightOutlined,
  CheckOutlined,
  EditOutlined,
  CloseOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import {
  IManagerDashboardStats,
  ITaskTimeApproval,
  ITeamMemberDashboardSummary,
  TaskTimeApprovalStatus,
} from '@/types/time-approval.types';
import { formatSecondsToHoursMinutes } from '@/utils/time-format.utils';
import ApprovalActionModal from '@/components/approvals/ApprovalActionModal';
import ApprovalDetailDrawer from '@/components/approvals/ApprovalDetailDrawer';
import SingleAvatar from '@/components/common/single-avatar/single-avatar';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import {
  setSelectedTaskId,
  setShowTaskDrawer,
  fetchTask,
} from '@/features/task-drawer/task-drawer.slice';
import { setProjectId } from '@/features/project/project.slice';
import { useSocket } from '@/socket/socketContext';
import { SocketEvents } from '@/shared/socket-events';

export const MyTeamDashboard: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { socket } = useSocket();
  const [loading, setLoading] = useState<boolean>(false);
  const [stats, setStats] = useState<IManagerDashboardStats['my_team']>({
    is_manager: true,
    employees_count: 0,
    tasks_in_progress_count: 0,
    pending_approvals_count: 0,
    pending_time_seconds: 0,
    overdue_tasks_count: 0,
    recorded_today_seconds: 0,
    approved_today_seconds: 0,
    team_members_summary: [],
    recent_pending_approvals: [],
  });

  // Modals & Drawers state
  const [selectedApproval, setSelectedApproval] = useState<ITaskTimeApproval | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState<boolean>(false);
  const [actionModalMode, setActionModalMode] = useState<'approve' | 'adjust' | 'reject'>('approve');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await timeApprovalsApiService.getDashboardStats();
      if (res.done && res.body?.my_team) {
        setStats(res.body.my_team);
      }
    } catch (err) {
      console.error('Failed to load team dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates via WebSockets
  useEffect(() => {
    const handleTimeLogUpdated = () => {
      loadData();
    };

    socket?.on(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), handleTimeLogUpdated);
    return () => {
      socket?.off(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), handleTimeLogUpdated);
    };
  }, [socket, loadData]);

  const handleOpenTask = (taskId: string, projectId?: string) => {
    dispatch(setSelectedTaskId(taskId));
    dispatch(fetchTask({ taskId, projectId: projectId || '' }));
    if (projectId) dispatch(setProjectId(projectId));
    dispatch(setShowTaskDrawer(true));
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
        loadData();
      } else {
        message.error(res.message || 'Failed to approve');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Error approving time');
    }
  };

  // Pending Approvals table columns
  const pendingColumns = [
    {
      title: 'Employee',
      dataIndex: 'member_name',
      key: 'member_name',
      width: '24%',
      render: (name: string, record: ITaskTimeApproval) => (
        <Flex align="center" gap={8}>
          <SingleAvatar
            avatarUrl={record.member_avatar_url}
            name={name}
            email={record.member_email}
            size={28}
          />
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
              {name || 'Unknown'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {record.project_name || 'No Project'}
            </Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Task',
      dataIndex: 'task_name',
      key: 'task_name',
      width: '28%',
      render: (name: string, record: ITaskTimeApproval) => (
        <div>
          <Button
            type="link"
            style={{ padding: 0, height: 'auto', fontWeight: 500, textAlign: 'left', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => handleOpenTask(record.task_id, record.project_id)}
          >
            {record.task_no ? `#${record.task_no} ` : ''}{name || 'Untitled Task'}
          </Button>
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {record.task_estimated_minutes && record.recorded_duration > record.task_estimated_minutes * 60 && (
              <Tooltip title={`Recorded time exceeds estimated ${formatSecondsToHoursMinutes(record.task_estimated_minutes * 60)}`}>
                <Tag color="warning" icon={<WarningOutlined />} style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                  Over Est.
                </Tag>
              </Tooltip>
            )}
            {record.maximum_approved_minutes && record.recorded_duration > record.maximum_approved_minutes * 60 && (
              <Tooltip title={`Recorded time exceeds max cap ${formatSecondsToHoursMinutes(record.maximum_approved_minutes * 60)}`}>
                <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                  Over Max Cap
                </Tag>
              </Tooltip>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_duration',
      key: 'recorded_duration',
      width: '18%',
      render: (sec: number) => (
        <span style={{ fontWeight: 600, color: '#1677ff', fontSize: 13 }}>
          {formatSecondsToHoursMinutes(sec || 0)}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '30%',
      render: (_: any, record: ITaskTimeApproval) => (
        <Space size={4}>
          <Tooltip title="Approve recorded duration">
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', padding: '0 8px' }}
              onClick={() => handleDirectApprove(record)}
            >
              Approve
            </Button>
          </Tooltip>
          <Tooltip title="Adjust approved duration">
            <Button
              size="small"
              icon={<EditOutlined />}
              style={{ padding: '0 6px' }}
              onClick={() => handleOpenActionModal(record, 'adjust')}
            />
          </Tooltip>
          <Tooltip title="Reject submission">
            <Button
              size="small"
              danger
              icon={<CloseOutlined />}
              style={{ padding: '0 6px' }}
              onClick={() => handleOpenActionModal(record, 'reject')}
            />
          </Tooltip>
          <Tooltip title="View full submission details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              style={{ padding: '0 4px' }}
              onClick={() => handleOpenDrawer(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Team Members Summary Table Columns
  const membersColumns = [
    {
      title: 'Employee',
      dataIndex: 'name',
      key: 'name',
      width: '30%',
      render: (name: string, record: ITeamMemberDashboardSummary) => (
        <Flex align="center" gap={10}>
          <SingleAvatar
            avatarUrl={record.avatar_url}
            name={name}
            email={record.email}
            size={32}
          />
          <div>
            <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
              {name || 'Unknown'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {record.role_name || record.email}
            </Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Tasks in Progress',
      dataIndex: 'tasks_in_progress',
      key: 'tasks_in_progress',
      width: '20%',
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'} style={{ fontWeight: 600 }}>
          {count} active
        </Tag>
      ),
    },
    {
      title: 'Recorded Today',
      dataIndex: 'recorded_today_seconds',
      key: 'recorded_today_seconds',
      width: '20%',
      render: (sec: number) => (
        <span style={{ fontWeight: 600, color: sec > 0 ? '#1677ff' : '#8c8c8c' }}>
          {formatSecondsToHoursMinutes(sec || 0)}
        </span>
      ),
    },
    {
      title: 'Approved Today',
      dataIndex: 'approved_today_seconds',
      key: 'approved_today_seconds',
      width: '20%',
      render: (sec: number) => (
        <span style={{ fontWeight: 600, color: sec > 0 ? '#52c41a' : '#8c8c8c' }}>
          {formatSecondsToHoursMinutes(sec || 0)}
        </span>
      ),
    },
    {
      title: 'Pending',
      dataIndex: 'pending_count',
      key: 'pending_count',
      width: '10%',
      render: (pending: number) => (
        pending > 0 ? (
          <Tag color="warning" icon={<ClockCircleOutlined />}>
            {pending}
          </Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 7 Section 26 Team KPI Summary Cards */}
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <>
          <Row gutter={[12, 12]}>
            {/* 1. Employees */}
            <Col xs={12} sm={8} md={6} lg={3}>
              <Card size="small" bordered={true} style={{ borderRadius: 8, background: '#f0f5ff', borderColor: '#adc6ff' }}>
                <Statistic
                  title={<span style={{ fontSize: 11, color: '#1d39c4' }}>Employees</span>}
                  value={stats.employees_count}
                  prefix={<TeamOutlined style={{ color: '#2f54eb', fontSize: 14 }} />}
                  valueStyle={{ fontSize: 18, fontWeight: 700, color: '#1d39c4' }}
                />
              </Card>
            </Col>

            {/* 2. Tasks In Progress */}
            <Col xs={12} sm={8} md={6} lg={3}>
              <Card size="small" bordered={true} style={{ borderRadius: 8, background: '#e6fffb', borderColor: '#87e8de' }}>
                <Statistic
                  title={<span style={{ fontSize: 11, color: '#006d75' }}>In Progress</span>}
                  value={stats.tasks_in_progress_count}
                  prefix={<ProjectOutlined style={{ color: '#13c2c2', fontSize: 14 }} />}
                  valueStyle={{ fontSize: 18, fontWeight: 700, color: '#08979c' }}
                />
              </Card>
            </Col>

            {/* 3. Pending Approvals */}
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card
                size="small"
                bordered={true}
                style={{
                  borderRadius: 8,
                  background: stats.pending_approvals_count > 0 ? '#fffbe6' : '#fafafa',
                  borderColor: stats.pending_approvals_count > 0 ? '#ffe58f' : '#f0f0f0',
                }}
              >
                <Statistic
                  title={<span style={{ fontSize: 11 }}>Pending Approvals</span>}
                  value={stats.pending_approvals_count}
                  prefix={<ClockCircleOutlined style={{ color: stats.pending_approvals_count > 0 ? '#faad14' : '#8c8c8c', fontSize: 14 }} />}
                  valueStyle={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: stats.pending_approvals_count > 0 ? '#d48806' : undefined,
                  }}
                />
              </Card>
            </Col>

            {/* 4. Overdue Tasks */}
            <Col xs={12} sm={8} md={6} lg={3}>
              <Card
                size="small"
                bordered={true}
                style={{
                  borderRadius: 8,
                  background: stats.overdue_tasks_count > 0 ? '#fff1f0' : '#fafafa',
                  borderColor: stats.overdue_tasks_count > 0 ? '#ffa39e' : '#f0f0f0',
                }}
              >
                <Statistic
                  title={<span style={{ fontSize: 11 }}>Overdue Tasks</span>}
                  value={stats.overdue_tasks_count}
                  prefix={<WarningOutlined style={{ color: stats.overdue_tasks_count > 0 ? '#ff4d4f' : '#8c8c8c', fontSize: 14 }} />}
                  valueStyle={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: stats.overdue_tasks_count > 0 ? '#cf1322' : undefined,
                  }}
                />
              </Card>
            </Col>

            {/* 5. Recorded Today */}
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card size="small" bordered={true} style={{ borderRadius: 8, background: '#e6f4ff', borderColor: '#91caff' }}>
                <Statistic
                  title={<span style={{ fontSize: 11, color: '#0958d9' }}>Recorded Today</span>}
                  value={formatSecondsToHoursMinutes(stats.recorded_today_seconds)}
                  prefix={<FieldTimeOutlined style={{ color: '#1677ff', fontSize: 14 }} />}
                  valueStyle={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}
                />
              </Card>
            </Col>

            {/* 6. Approved Today */}
            <Col xs={12} sm={8} md={6} lg={3}>
              <Card size="small" bordered={true} style={{ borderRadius: 8, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                <Statistic
                  title={<span style={{ fontSize: 11, color: '#389e0d' }}>Approved Today</span>}
                  value={formatSecondsToHoursMinutes(stats.approved_today_seconds)}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />}
                  valueStyle={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}
                />
              </Card>
            </Col>

            {/* 7. Pending Time */}
            <Col xs={12} sm={8} md={6} lg={4}>
              <Card
                size="small"
                bordered={true}
                style={{
                  borderRadius: 8,
                  background: stats.pending_time_seconds > 0 ? '#fff7e6' : '#fafafa',
                  borderColor: stats.pending_time_seconds > 0 ? '#ffd591' : '#f0f0f0',
                }}
              >
                <Statistic
                  title={<span style={{ fontSize: 11 }}>Pending Time</span>}
                  value={formatSecondsToHoursMinutes(stats.pending_time_seconds)}
                  prefix={<HourglassOutlined style={{ color: stats.pending_time_seconds > 0 ? '#fa8c16' : '#8c8c8c', fontSize: 14 }} />}
                  valueStyle={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: stats.pending_time_seconds > 0 ? '#d46b08' : undefined,
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Main Content Area */}
          <Row gutter={[20, 20]}>
            {/* Left: Pending Approvals Quick Action List */}
            <Col xs={24} lg={14}>
              <Card
                bordered={false}
                style={{ borderRadius: 8, height: '100%' }}
                title={
                  <Flex justify="space-between" align="center">
                    <Space>
                      <ClockCircleOutlined style={{ color: '#faad14' }} />
                      <Typography.Text strong style={{ fontSize: 15 }}>
                        Pending Approvals Awaiting Review ({stats.recent_pending_approvals.length})
                      </Typography.Text>
                    </Space>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => navigate('/worklenz/approvals')}
                    >
                      View All Approvals <RightOutlined style={{ fontSize: 10 }} />
                    </Button>
                  </Flex>
                }
              >
                <Table
                  dataSource={stats.recent_pending_approvals}
                  columns={pendingColumns as any}
                  rowKey="id"
                  pagination={false}
                  size="middle"
                  scroll={{ x: 600 }}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No pending approvals waiting for your review! Great job."
                      />
                    ),
                  }}
                />
              </Card>
            </Col>

            {/* Right: Team Members Activity / Workload Summary */}
            <Col xs={24} lg={10}>
              <Card
                bordered={false}
                style={{ borderRadius: 8, height: '100%' }}
                title={
                  <Flex justify="space-between" align="center">
                    <Space>
                      <TeamOutlined style={{ color: '#1677ff' }} />
                      <Typography.Text strong style={{ fontSize: 15 }}>
                        Team Today's Status ({stats.team_members_summary.length})
                      </Typography.Text>
                    </Space>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => navigate('/worklenz/approvals')}
                    >
                      Timesheets <RightOutlined style={{ fontSize: 10 }} />
                    </Button>
                  </Flex>
                }
              >
                <Table
                  dataSource={stats.team_members_summary}
                  columns={membersColumns as any}
                  rowKey="team_member_id"
                  pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
                  size="small"
                  scroll={{ x: 450 }}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No team members found."
                      />
                    ),
                  }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* Action Modal for Adjust / Reject / Approve */}
      {actionModalOpen && (
        <ApprovalActionModal
          open={actionModalOpen}
          approval={selectedApproval}
          initialMode={actionModalMode}
          onClose={() => setActionModalOpen(false)}
          onSuccess={() => {
            setActionModalOpen(false);
            loadData();
          }}
        />
      )}

      {/* Detailed Approval Drawer */}
      {drawerOpen && (
        <ApprovalDetailDrawer
          open={drawerOpen}
          approvalId={selectedApproval?.id || null}
          onClose={() => setDrawerOpen(false)}
          onActionClick={(approval, mode) => {
            setDrawerOpen(false);
            handleOpenActionModal(approval, mode);
          }}
        />
      )}
    </div>
  );
};

export default MyTeamDashboard;
