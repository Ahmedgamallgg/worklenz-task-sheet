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
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FieldTimeOutlined,
  RightOutlined,
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
  const [todayStats, setTodayStats] = useState<{
    recorded_seconds: number;
    approved_seconds: number;
    pending_count: number;
  }>({
    recorded_seconds: 0,
    approved_seconds: 0,
    pending_count: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const today = dayjs().format('YYYY-MM-DD');

      // Fetch user's submissions
      const submissionsRes = await timeApprovalsApiService.getMySubmissions();
      if (submissionsRes.done && Array.isArray(submissionsRes.body)) {
        setSubmissions(submissionsRes.body);

        const pending = submissionsRes.body.filter(
          s => s.status === TaskTimeApprovalStatus.PENDING
        ).length;

        // Calculate today stats from today's timesheet
        const timesheetRes = await timeApprovalsApiService.getMyTimesheet({
          start_date: `${today} 00:00:00`,
          end_date: `${today} 23:59:59`,
          view: 'daily',
        });

        if (timesheetRes.done && timesheetRes.body) {
          setTodayStats({
            recorded_seconds: timesheetRes.body.summary.total_recorded_seconds || 0,
            approved_seconds: timesheetRes.body.summary.total_approved_seconds || 0,
            pending_count: pending,
          });
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
          style={{ padding: 0, height: 'auto', fontWeight: 500, textAlign: 'left' }}
          onClick={() => handleOpenTask(record.task_id, record.project_id)}
        >
          {record.task_no ? `#${record.task_no} ` : ''}{name}
        </Button>
      ),
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_duration',
      key: 'recorded_duration',
      width: '20%',
      render: (sec: number) => formatSecondsToHoursMinutes(sec || 0),
    },
    {
      title: 'Approved',
      dataIndex: 'approved_duration',
      key: 'approved_duration',
      width: '20%',
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
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: '25%',
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
          <Row gutter={[12, 12]}>
            <Col span={8}>
              <Card size="small" bordered={true} style={{ background: '#fafafa' }}>
                <Statistic
                  title={<span style={{ fontSize: 11 }}>Recorded Today</span>}
                  value={formatSecondsToHoursMinutes(todayStats.recorded_seconds)}
                  valueStyle={{ fontSize: 16, fontWeight: 700, color: '#1677ff' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" bordered={true} style={{ background: '#fafafa' }}>
                <Statistic
                  title={<span style={{ fontSize: 11 }}>Approved Today</span>}
                  value={formatSecondsToHoursMinutes(todayStats.approved_seconds)}
                  valueStyle={{ fontSize: 16, fontWeight: 700, color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" bordered={true} style={{ background: '#fafafa' }}>
                <Statistic
                  title={<span style={{ fontSize: 11 }}>Pending</span>}
                  value={todayStats.pending_count}
                  valueStyle={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: todayStats.pending_count > 0 ? '#fa8c16' : undefined,
                  }}
                />
              </Card>
            </Col>
          </Row>

          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              Recent Submissions
            </Typography.Text>
            <Table
              dataSource={submissions.slice(0, 4)}
              columns={columns as any}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: 'No recent submissions' }}
            />
          </div>
        </Flex>
      )}
    </Card>
  );
};

export default EmployeeApprovalWidget;
