import React, { useEffect, useState, useCallback } from 'react';
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
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FieldTimeOutlined,
  RightOutlined,
  FileDoneOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import { ITaskTimeApproval, TaskTimeApprovalStatus } from '@/types/time-approval.types';
import { formatSecondsToHoursMinutes } from '@/utils/time-format.utils';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import {
  setSelectedTaskId,
  setShowTaskDrawer,
  fetchTask,
} from '@/features/task-drawer/task-drawer.slice';
import { setProjectId } from '@/features/project/project.slice';

export const EmployeeApprovalWidget: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState<boolean>(false);
  const [submissions, setSubmissions] = useState<ITaskTimeApproval[]>([]);
  const [stats, setStats] = useState<{
    tasks_today_count: number;
    tasks_completed_today_count: number;
    recorded_today_seconds: number;
    approved_today_seconds: number;
    pending_submissions_count: number;
  }>({
    tasks_today_count: 0,
    tasks_completed_today_count: 0,
    recorded_today_seconds: 0,
    approved_today_seconds: 0,
    pending_submissions_count: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await timeApprovalsApiService.getDashboardStats();
      if (res.done && res.body?.my_work) {
        const myWork = res.body.my_work;
        setStats({
          tasks_today_count: myWork.tasks_today_count || 0,
          tasks_completed_today_count: myWork.tasks_completed_today_count || 0,
          recorded_today_seconds: myWork.recorded_today_seconds || 0,
          approved_today_seconds: myWork.approved_today_seconds || 0,
          pending_submissions_count: myWork.pending_submissions_count || 0,
        });
        setSubmissions(myWork.recent_submissions || []);
      } else {
        // Fallback
        const [subRes, tsRes] = await Promise.all([
          timeApprovalsApiService.getMySubmissions(),
          timeApprovalsApiService.getMyTimesheet({
            start_date: `${dayjs().format('YYYY-MM-DD')} 00:00:00`,
            end_date: `${dayjs().format('YYYY-MM-DD')} 23:59:59`,
            view: 'daily',
          }),
        ]);

        if (subRes.done && Array.isArray(subRes.body)) {
          setSubmissions(subRes.body.slice(0, 5));
          const pending = subRes.body.filter(s => s.status === TaskTimeApprovalStatus.PENDING).length;
          setStats(prev => ({
            ...prev,
            pending_submissions_count: pending,
            recorded_today_seconds: tsRes.body?.summary?.total_recorded_seconds || 0,
            approved_today_seconds: tsRes.body?.summary?.total_approved_seconds || 0,
          }));
        }
      }
    } catch (error) {
      console.error('Error loading employee approval widget data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenTask = (taskId: string, projectId?: string) => {
    dispatch(setSelectedTaskId(taskId));
    dispatch(fetchTask({ taskId, projectId: projectId || '' }));
    if (projectId) dispatch(setProjectId(projectId));
    dispatch(setShowTaskDrawer(true));
  };

  const renderStatusBadge = (status: TaskTimeApprovalStatus) => {
    switch (status) {
      case TaskTimeApprovalStatus.PENDING:
        return <Tag icon={<ClockCircleOutlined />} color="warning">Pending</Tag>;
      case TaskTimeApprovalStatus.APPROVED:
        return <Tag icon={<CheckCircleOutlined />} color="success">Approved</Tag>;
      case TaskTimeApprovalStatus.ADJUSTED:
        return <Tag icon={<ExclamationCircleOutlined />} color="processing">Adjusted</Tag>;
      case TaskTimeApprovalStatus.REJECTED:
        return <Tag color="error">Rejected</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Task',
      dataIndex: 'task_name',
      key: 'task_name',
      render: (name: string, record: ITaskTimeApproval) => (
        <Button
          type="link"
          style={{ padding: 0, height: 'auto', fontWeight: 500, textAlign: 'left', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onClick={() => handleOpenTask(record.task_id, record.project_id)}
        >
          {record.task_no ? `#${record.task_no} ` : ''}{name || 'Untitled Task'}
        </Button>
      ),
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_duration',
      key: 'recorded_duration',
      width: '22%',
      render: (sec: number) => (
        <span style={{ fontWeight: 500 }}>
          {formatSecondsToHoursMinutes(sec || 0)}
        </span>
      ),
    },
    {
      title: 'Approved',
      dataIndex: 'approved_duration',
      key: 'approved_duration',
      width: '22%',
      render: (sec: number, record: ITaskTimeApproval) => {
        if (record.status === TaskTimeApprovalStatus.APPROVED || record.status === TaskTimeApprovalStatus.ADJUSTED) {
          return (
            <span style={{ color: '#52c41a', fontWeight: 600 }}>
              {formatSecondsToHoursMinutes(sec || 0)}
            </span>
          );
        }
        return <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    {
      title: 'Approval',
      dataIndex: 'status',
      key: 'status',
      width: '24%',
      render: (status: TaskTimeApprovalStatus) => renderStatusBadge(status),
    },
  ];

  return (
    <Card
      size="small"
      style={{ borderRadius: 8 }}
      title={
        <Flex justify="space-between" align="center">
          <Typography.Text strong style={{ fontSize: 14 }}>
            Time & Approval Summary
          </Typography.Text>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => navigate('/worklenz/approvals')}
          >
            My Timesheet <RightOutlined style={{ fontSize: 10 }} />
          </Button>
        </Flex>
      }
    >
      {loading ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={16}>
          {/* Top Row: Tasks Today & Completed */}
          <Row gutter={[8, 8]}>
            <Col span={12}>
              <Card size="small" bordered={true} style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                <Statistic
                  title={<span style={{ fontSize: 11, color: '#389e0d' }}>Tasks Today / Done</span>}
                  value={`${stats.tasks_today_count} (${stats.tasks_completed_today_count} done)`}
                  prefix={<FileDoneOutlined style={{ color: '#52c41a', fontSize: 14 }} />}
                  valueStyle={{ fontSize: 14, fontWeight: 700, color: '#237804' }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" bordered={true} style={{ background: stats.pending_submissions_count > 0 ? '#fffbe6' : '#fafafa', borderColor: stats.pending_submissions_count > 0 ? '#ffe58f' : '#f0f0f0' }}>
                <Statistic
                  title={<span style={{ fontSize: 11 }}>Pending Approval</span>}
                  value={stats.pending_submissions_count}
                  prefix={<ClockCircleOutlined style={{ color: stats.pending_submissions_count > 0 ? '#faad14' : '#8c8c8c', fontSize: 14 }} />}
                  valueStyle={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: stats.pending_submissions_count > 0 ? '#d48806' : undefined,
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Second Row: Recorded Today vs Approved Today */}
          <Row gutter={[8, 8]}>
            <Col span={12}>
              <Card size="small" bordered={true} style={{ background: '#e6f4ff', borderColor: '#91caff' }}>
                <Statistic
                  title={<span style={{ fontSize: 11, color: '#0958d9' }}>Recorded Today</span>}
                  value={formatSecondsToHoursMinutes(stats.recorded_today_seconds)}
                  prefix={<FieldTimeOutlined style={{ color: '#1677ff', fontSize: 14 }} />}
                  valueStyle={{ fontSize: 15, fontWeight: 700, color: '#1677ff' }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" bordered={true} style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                <Statistic
                  title={<span style={{ fontSize: 11, color: '#389e0d' }}>Approved Today</span>}
                  value={formatSecondsToHoursMinutes(stats.approved_today_seconds)}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />}
                  valueStyle={{ fontSize: 15, fontWeight: 700, color: '#52c41a' }}
                />
              </Card>
            </Col>
          </Row>

          {/* Recent Tasks List */}
          <div>
            <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                Recent Tasks & Submissions
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                Last {submissions.length} submissions
              </Typography.Text>
            </Flex>
            <Table
              dataSource={submissions.slice(0, 5)}
              columns={columns as any}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: 'No submissions yet' }}
            />
          </div>
        </Flex>
      )}
    </Card>
  );
};

export default EmployeeApprovalWidget;

