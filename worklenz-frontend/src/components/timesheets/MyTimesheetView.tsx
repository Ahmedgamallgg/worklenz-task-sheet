import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Col,
  DatePicker,
  Flex,
  Row,
  Radio,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Tooltip,
  Badge,
  Skeleton,
} from '@/shared/antd-imports';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  ExpandAltOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import { TaskTimeApprovalStatus } from '@/types/time-approval.types';
import { formatSecondsToHoursMinutes } from '@/utils/time-format.utils';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import {
  setSelectedTaskId,
  setShowTaskDrawer,
  fetchTask,
} from '@/features/task-drawer/task-drawer.slice';
import { setProjectId } from '@/features/project/project.slice';

dayjs.extend(isoWeek);

interface MyTimesheetViewProps {
  onOpenTask?: (taskId: string, projectId: string) => void;
}

export const MyTimesheetView: React.FC<MyTimesheetViewProps> = ({ onOpenTask }) => {
  const dispatch = useAppDispatch();
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState<boolean>(false);
  const [timesheetData, setTimesheetData] = useState<{
    summary: {
      total_recorded_seconds: number;
      total_approved_seconds: number;
      total_pending_seconds: number;
      total_adjustment_seconds: number;
    };
    days: Array<{
      date: string;
      recorded_seconds: number;
      approved_seconds: number;
      pending_seconds: number;
      adjustment_seconds: number;
      tasks: Array<{
        task_id: string;
        task_name: string;
        task_no?: number;
        project_id?: string;
        project_name?: string;
        recorded_seconds: number;
        approved_seconds: number;
        approval_status: TaskTimeApprovalStatus | 'NOT_SUBMITTED';
        adjustment_reason?: string;
        rejection_reason?: string;
        manager_comment?: string;
      }>;
    }>;
  }>({
    summary: {
      total_recorded_seconds: 0,
      total_approved_seconds: 0,
      total_pending_seconds: 0,
      total_adjustment_seconds: 0,
    },
    days: [],
  });

  // Calculate start and end date based on viewMode and currentDate
  const getDateRange = useCallback(() => {
    let start: Dayjs;
    let end: Dayjs;

    if (viewMode === 'daily') {
      start = currentDate.startOf('day');
      end = currentDate.endOf('day');
    } else if (viewMode === 'weekly') {
      start = currentDate.startOf('isoWeek');
      end = currentDate.endOf('isoWeek');
    } else {
      start = currentDate.startOf('month');
      end = currentDate.endOf('month');
    }

    return {
      startDate: start.format('YYYY-MM-DD 00:00:00'),
      endDate: end.format('YYYY-MM-DD 23:59:59'),
      startLabel: start.format('MMM D, YYYY'),
      endLabel: end.format('MMM D, YYYY'),
    };
  }, [viewMode, currentDate]);

  const fetchTimesheet = useCallback(async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const res = await timeApprovalsApiService.getMyTimesheet({
        start_date: startDate,
        end_date: endDate,
        view: viewMode,
      });

      if (res.done && res.body) {
        setTimesheetData(res.body);
      }
    } catch (err) {
      console.error('Failed to load my timesheet:', err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, viewMode]);

  useEffect(() => {
    fetchTimesheet();
  }, [fetchTimesheet]);

  const handlePrevious = () => {
    if (viewMode === 'daily') setCurrentDate(prev => prev.subtract(1, 'day'));
    else if (viewMode === 'weekly') setCurrentDate(prev => prev.subtract(1, 'week'));
    else setCurrentDate(prev => prev.subtract(1, 'month'));
  };

  const handleNext = () => {
    if (viewMode === 'daily') setCurrentDate(prev => prev.add(1, 'day'));
    else if (viewMode === 'weekly') setCurrentDate(prev => prev.add(1, 'week'));
    else setCurrentDate(prev => prev.add(1, 'month'));
  };

  const handleToday = () => {
    setCurrentDate(dayjs());
  };

  const handleTaskClick = (taskId: string, projectId?: string) => {
    if (onOpenTask) {
      onOpenTask(taskId, projectId || '');
    } else {
      dispatch(setSelectedTaskId(taskId));
      dispatch(fetchTask({ taskId, projectId: projectId || '' }));
      if (projectId) dispatch(setProjectId(projectId));
      dispatch(setShowTaskDrawer(true));
    }
  };

  const renderStatusBadge = (status: TaskTimeApprovalStatus | 'NOT_SUBMITTED') => {
    switch (status) {
      case TaskTimeApprovalStatus.PENDING:
        return <Tag icon={<ClockCircleOutlined />} color="warning">Pending</Tag>;
      case TaskTimeApprovalStatus.APPROVED:
        return <Tag icon={<CheckCircleOutlined />} color="success">Approved</Tag>;
      case TaskTimeApprovalStatus.ADJUSTED:
        return <Tag icon={<ExclamationCircleOutlined />} color="processing">Adjusted</Tag>;
      case TaskTimeApprovalStatus.REJECTED:
        return <Tag color="error">Rejected</Tag>;
      case 'NOT_SUBMITTED':
      default:
        return <Tag color="default">Not Submitted</Tag>;
    }
  };

  const { startLabel, endLabel } = getDateRange();
  const dateRangeDisplay =
    viewMode === 'daily'
      ? currentDate.format('dddd, MMMM D, YYYY')
      : `${startLabel} - ${endLabel}`;

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: '20%',
      render: (dateStr: string) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {dayjs(dateStr).format('ddd, MMM D, YYYY')}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {dayjs(dateStr).isSame(dayjs(), 'day') ? '(Today)' : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Tasks Count',
      key: 'tasks_count',
      width: '12%',
      render: (_: any, record: any) => (
        <span>{record.tasks?.length || 0} tasks</span>
      ),
    },
    {
      title: 'Recorded Time',
      dataIndex: 'recorded_seconds',
      key: 'recorded_seconds',
      width: '18%',
      render: (val: number) => (
        <Typography.Text strong>
          {formatSecondsToHoursMinutes(val || 0)}
        </Typography.Text>
      ),
    },
    {
      title: 'Approved Time',
      dataIndex: 'approved_seconds',
      key: 'approved_seconds',
      width: '18%',
      render: (val: number) => (
        <Typography.Text strong style={{ color: '#52c41a' }}>
          {formatSecondsToHoursMinutes(val || 0)}
        </Typography.Text>
      ),
    },
    {
      title: 'Pending Time',
      dataIndex: 'pending_seconds',
      key: 'pending_seconds',
      width: '16%',
      render: (val: number) => (
        <Typography.Text style={{ color: val > 0 ? '#faad14' : undefined }}>
          {val > 0 ? formatSecondsToHoursMinutes(val) : '—'}
        </Typography.Text>
      ),
    },
    {
      title: 'Adjustment',
      dataIndex: 'adjustment_seconds',
      key: 'adjustment_seconds',
      width: '16%',
      render: (val: number) => {
        if (!val || val === 0) return <Typography.Text type="secondary">0</Typography.Text>;
        const isNegative = val < 0;
        return (
          <Typography.Text style={{ color: isNegative ? '#ff4d4f' : '#1890ff', fontWeight: 600 }}>
            {isNegative ? '-' : '+'}{formatSecondsToHoursMinutes(Math.abs(val))}
          </Typography.Text>
        );
      },
    },
  ];

  const expandedRowRender = (record: any) => {
    const taskCols = [
      {
        title: 'Task Name',
        dataIndex: 'task_name',
        key: 'task_name',
        render: (name: string, item: any) => (
          <Button
            type="link"
            style={{ padding: 0, height: 'auto', textAlign: 'left', fontWeight: 500 }}
            icon={<ExpandAltOutlined />}
            onClick={() => handleTaskClick(item.task_id, item.project_id)}
          >
            {item.task_no ? `#${item.task_no} ` : ''}{name}
          </Button>
        ),
      },
      {
        title: 'Project',
        dataIndex: 'project_name',
        key: 'project_name',
        render: (proj: string) => proj || '—',
      },
      {
        title: 'Recorded',
        dataIndex: 'recorded_seconds',
        key: 'recorded_seconds',
        render: (sec: number) => formatSecondsToHoursMinutes(sec || 0),
      },
      {
        title: 'Approved',
        dataIndex: 'approved_seconds',
        key: 'approved_seconds',
        render: (sec: number) => (
          <span style={{ color: sec > 0 ? '#52c41a' : undefined }}>
            {sec > 0 ? formatSecondsToHoursMinutes(sec) : '—'}
          </span>
        ),
      },
      {
        title: 'Approval Status',
        dataIndex: 'approval_status',
        key: 'approval_status',
        render: (status: any) => renderStatusBadge(status),
      },
      {
        title: 'Manager Note / Reason',
        key: 'note',
        render: (_: any, item: any) => (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {item.adjustment_reason
              ? `Adj: ${item.adjustment_reason}`
              : item.rejection_reason
              ? `Rej: ${item.rejection_reason}`
              : item.manager_comment
              ? item.manager_comment
              : '—'}
          </Typography.Text>
        ),
      },
    ];

    return (
      <Table
        columns={taskCols}
        dataSource={record.tasks || []}
        pagination={false}
        rowKey={item => `${item.task_id}-${record.date}`}
        size="small"
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Controls Bar */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
          {/* View Switcher */}
          <Radio.Group
            value={viewMode}
            onChange={e => setViewMode(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="daily">Daily</Radio.Button>
            <Radio.Button value="weekly">Weekly</Radio.Button>
            <Radio.Button value="monthly">Monthly</Radio.Button>
          </Radio.Group>

          {/* Date Navigation */}
          <Space size={8} align="center">
            <Button icon={<LeftOutlined />} onClick={handlePrevious} />
            <Button onClick={handleToday}>
              {viewMode === 'daily' ? 'Today' : viewMode === 'weekly' ? 'This Week' : 'This Month'}
            </Button>
            <Button icon={<RightOutlined />} onClick={handleNext} />
            <Typography.Text strong style={{ fontSize: 15, marginInline: 8 }}>
              {dateRangeDisplay}
            </Typography.Text>
          </Space>
        </Flex>
      </Card>

      {/* KPI Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Recorded"
              value={formatSecondsToHoursMinutes(timesheetData.summary.total_recorded_seconds || 0)}
              prefix={<FieldTimeOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Approved"
              value={formatSecondsToHoursMinutes(timesheetData.summary.total_approved_seconds || 0)}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Statistic
              title="Pending Approval"
              value={formatSecondsToHoursMinutes(timesheetData.summary.total_pending_seconds || 0)}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{
                color: timesheetData.summary.total_pending_seconds > 0 ? '#fa8c16' : undefined,
                fontWeight: 700,
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            <Statistic
              title="Net Adjustment"
              value={`${timesheetData.summary.total_adjustment_seconds < 0 ? '-' : ''}${formatSecondsToHoursMinutes(
                Math.abs(timesheetData.summary.total_adjustment_seconds || 0)
              )}`}
              prefix={<ExclamationCircleOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{
                color:
                  timesheetData.summary.total_adjustment_seconds < 0
                    ? '#ff4d4f'
                    : timesheetData.summary.total_adjustment_seconds > 0
                    ? '#1890ff'
                    : undefined,
                fontWeight: 700,
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        {loading ? (
          <Skeleton active />
        ) : (
          <Table
            columns={columns}
            dataSource={timesheetData.days}
            rowKey="date"
            expandable={{
              expandedRowRender,
              defaultExpandAllRows: true,
            }}
            pagination={false}
            locale={{ emptyText: 'No time entries recorded for this period.' }}
          />
        )}
      </Card>
    </div>
  );
};

export default MyTimesheetView;
