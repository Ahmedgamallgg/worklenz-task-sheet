import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Flex,
  Table,
  Typography,
  Space,
  Tag,
  Avatar,
  Button,
  DatePicker,
  Select,
  Input,
  Row,
  Col,
  Statistic,
  Dropdown,
  Tooltip,
  Tabs,
  Badge,
  Alert,
  theme,
  TableColumnsType,
} from '@/shared/antd-imports';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  DownloadOutlined,
  SearchOutlined,
  UserOutlined,
  ProjectOutlined,
  TeamOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  ArrowDownOutlined,
  RiseOutlined,
  WarningOutlined,
} from '@/shared/antd-imports';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import dayjs from 'dayjs';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import {
  IApprovalReportsSummary,
  IEmployeeReportRow,
  ITeamReportRow,
  IProjectReportRow,
} from '@/types/time-approval.types';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export const formatDuration = (seconds: number | string | null | undefined): string => {
  const numSecs = typeof seconds === 'number' ? seconds : parseFloat(seconds as string) || 0;
  const totalMins = Math.round(numSecs / 60);
  const hours = Math.floor(Math.abs(totalMins) / 60);
  const mins = Math.abs(totalMins) % 60;
  const sign = totalMins < 0 ? '-' : '';
  return `${sign}${hours}h ${mins}m`;
};

const ApprovalReportsPage: React.FC = () => {
  const { t } = useTranslation('time-report');
  const { token } = theme.useToken();
  useDocumentTitle('Reporting - Approval Reports');

  // Active Tab: 'team' | 'employee' | 'project'
  const [activeTab, setActiveTab] = useState<'team' | 'employee' | 'project'>('team');

  // Filter states
  const [dateRangePreset, setDateRangePreset] = useState<string>('thisMonth');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<IApprovalReportsSummary | null>(null);
  const [teamRows, setTeamRows] = useState<ITeamReportRow[]>([]);
  const [employeeRows, setEmployeeRows] = useState<IEmployeeReportRow[]>([]);
  const [projectRows, setProjectRows] = useState<IProjectReportRow[]>([]);

  // Calculate start and end date strings from filters
  const getFilterParams = useCallback(() => {
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (customRange && customRange[0] && customRange[1]) {
      startDate = customRange[0].format('YYYY-MM-DD');
      endDate = customRange[1].format('YYYY-MM-DD');
    }

    return {
      start_date: startDate,
      end_date: endDate,
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
      search: searchQuery.trim() ? searchQuery.trim() : undefined,
    };
  }, [customRange, statusFilter, searchQuery]);

  // Handle Preset changes
  const handlePresetChange = (value: string) => {
    setDateRangePreset(value);
    const now = dayjs();
    switch (value) {
      case 'today':
        setCustomRange([now.startOf('day'), now.endOf('day')]);
        break;
      case 'thisWeek':
        setCustomRange([now.startOf('week'), now.endOf('week')]);
        break;
      case 'lastWeek':
        setCustomRange([
          now.subtract(1, 'week').startOf('week'),
          now.subtract(1, 'week').endOf('week'),
        ]);
        break;
      case 'thisMonth':
        setCustomRange([now.startOf('month'), now.endOf('month')]);
        break;
      case 'lastMonth':
        setCustomRange([
          now.subtract(1, 'month').startOf('month'),
          now.subtract(1, 'month').endOf('month'),
        ]);
        break;
      case 'allTime':
        setCustomRange(null);
        break;
      default:
        break;
    }
  };

  // Fetch report data
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = getFilterParams();

      const [summaryRes, teamRes, empRes, projRes] = await Promise.all([
        timeApprovalsApiService.getApprovalReportsSummary(params),
        timeApprovalsApiService.getTeamReports(params),
        timeApprovalsApiService.getEmployeeReports(params),
        timeApprovalsApiService.getProjectReports(params),
      ]);

      if (summaryRes.done && summaryRes.body) {
        setSummary(summaryRes.body);
      }
      if (teamRes.done && teamRes.body) {
        setTeamRows(teamRes.body);
      }
      if (empRes.done && empRes.body) {
        setEmployeeRows(empRes.body);
      }
      if (projRes.done && projRes.body) {
        setProjectRows(projRes.body);
      }
    } catch (err: any) {
      console.error('Error fetching approval reports data:', err);
      setError(err?.message || 'Failed to load approval report data');
    } finally {
      setLoading(false);
    }
  }, [getFilterParams]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Export handlers
  const handleExport = async (format: 'csv' | 'excel') => {
    setExporting(true);
    try {
      const params = getFilterParams();
      await timeApprovalsApiService.exportReports(activeTab, format, params);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // Team Table Columns
  const teamColumns: TableColumnsType<ITeamReportRow> = [
    {
      title: 'Employee',
      key: 'name',
      render: (_, record) => (
        <Space>
          <Avatar src={record.avatar_url} icon={<UserOutlined />} />
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role_name',
      key: 'role_name',
      render: (role: string) => <Tag color="blue">{role || 'Member'}</Tag>,
    },
    {
      title: 'Tasks',
      dataIndex: 'tasks_count',
      key: 'tasks_count',
      align: 'center',
      sorter: (a, b) => a.tasks_count - b.tasks_count,
    },
    {
      title: 'Estimated',
      dataIndex: 'estimated_seconds',
      key: 'estimated_seconds',
      render: (sec: number) => <Text>{formatDuration(sec)}</Text>,
      sorter: (a, b) => a.estimated_seconds - b.estimated_seconds,
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_seconds',
      key: 'recorded_seconds',
      render: (sec: number) => (
        <Text strong style={{ color: '#1890ff' }}>
          {formatDuration(sec)}
        </Text>
      ),
      sorter: (a, b) => a.recorded_seconds - b.recorded_seconds,
    },
    {
      title: 'Approved',
      dataIndex: 'approved_seconds',
      key: 'approved_seconds',
      render: (sec: number) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatDuration(sec)}
        </Text>
      ),
      sorter: (a, b) => a.approved_seconds - b.approved_seconds,
    },
    {
      title: (
        <Tooltip title="Difference between Recorded Time and Approved Time (Adjusted hours)">
          <span>Difference</span>
        </Tooltip>
      ),
      dataIndex: 'difference_seconds',
      key: 'difference_seconds',
      render: (sec: number) => {
        if (sec === 0) return <Text type="secondary">-</Text>;
        return (
          <Tag color={sec > 0 ? 'volcano' : 'green'}>
            {sec > 0 ? `-${formatDuration(sec)}` : `+${formatDuration(Math.abs(sec))}`}
          </Tag>
        );
      },
      sorter: (a, b) => a.difference_seconds - b.difference_seconds,
    },
    {
      title: (
        <Tooltip title="Recorded vs Estimated variance percentage">
          <span>Variance</span>
        </Tooltip>
      ),
      dataIndex: 'variance_percentage',
      key: 'variance_percentage',
      render: (pct: number) => {
        if (pct === 0) return <Text type="secondary">0%</Text>;
        const isOver = pct > 0;
        return (
          <Text style={{ color: isOver ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
            {isOver ? `+${pct}%` : `${pct}%`}
          </Text>
        );
      },
      sorter: (a, b) => a.variance_percentage - b.variance_percentage,
    },
    {
      title: 'Approval Statuses',
      key: 'statuses',
      render: (_, record) => (
        <Space size={4} wrap>
          {record.approved_count > 0 && <Tag color="success">Approved: {record.approved_count}</Tag>}
          {record.adjusted_count > 0 && <Tag color="warning">Adjusted: {record.adjusted_count}</Tag>}
          {record.rejected_count > 0 && <Tag color="error">Rejected: {record.rejected_count}</Tag>}
          {record.pending_count > 0 && <Tag color="processing">Pending: {record.pending_count}</Tag>}
        </Space>
      ),
    },
  ];

  // Employee Table Columns
  const employeeColumns: TableColumnsType<IEmployeeReportRow> = [
    {
      title: 'Employee',
      key: 'name',
      render: (_, record) => (
        <Space>
          <Avatar src={record.avatar_url} icon={<UserOutlined />} />
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Completed Tasks',
      key: 'completed_tasks',
      align: 'center',
      render: (_, record) => (
        <Text>
          <Text strong style={{ color: '#52c41a' }}>
            {record.tasks_completed_count}
          </Text>{' '}
          / {record.total_tasks_count}
        </Text>
      ),
      sorter: (a, b) => a.tasks_completed_count - b.tasks_completed_count,
    },
    {
      title: 'Estimated',
      dataIndex: 'estimated_seconds',
      key: 'estimated_seconds',
      render: (sec: number) => <Text>{formatDuration(sec)}</Text>,
      sorter: (a, b) => a.estimated_seconds - b.estimated_seconds,
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_seconds',
      key: 'recorded_seconds',
      render: (sec: number) => (
        <Text strong style={{ color: '#1890ff' }}>
          {formatDuration(sec)}
        </Text>
      ),
      sorter: (a, b) => a.recorded_seconds - b.recorded_seconds,
    },
    {
      title: 'Approved',
      dataIndex: 'approved_seconds',
      key: 'approved_seconds',
      render: (sec: number) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatDuration(sec)}
        </Text>
      ),
      sorter: (a, b) => a.approved_seconds - b.approved_seconds,
    },
    {
      title: 'Adjustment',
      dataIndex: 'adjustment_seconds',
      key: 'adjustment_seconds',
      render: (sec: number) => {
        if (sec === 0) return <Text type="secondary">-</Text>;
        return <Tag color="volcano">-{formatDuration(sec)}</Tag>;
      },
      sorter: (a, b) => a.adjustment_seconds - b.adjustment_seconds,
    },
    {
      title: 'Avg Variance',
      dataIndex: 'average_variance_percentage',
      key: 'average_variance_percentage',
      render: (pct: number) => {
        if (pct === 0) return <Text type="secondary">0%</Text>;
        const isOver = pct > 0;
        return (
          <Text style={{ color: isOver ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
            {isOver ? `+${pct}%` : `${pct}%`}
          </Text>
        );
      },
      sorter: (a, b) => a.average_variance_percentage - b.average_variance_percentage,
    },
    {
      title: (
        <Tooltip title="Tasks exceeding original estimate">
          <span>&gt; Estimate</span>
        </Tooltip>
      ),
      dataIndex: 'tasks_above_estimate_count',
      key: 'tasks_above_estimate_count',
      align: 'center',
      render: (count: number) =>
        count > 0 ? <Tag color="orange">{count}</Tag> : <Text type="secondary">0</Text>,
      sorter: (a, b) => a.tasks_above_estimate_count - b.tasks_above_estimate_count,
    },
    {
      title: (
        <Tooltip title="Tasks exceeding maximum approved limit set by manager">
          <span>&gt; Maximum</span>
        </Tooltip>
      ),
      dataIndex: 'tasks_above_maximum_count',
      key: 'tasks_above_maximum_count',
      align: 'center',
      render: (count: number) =>
        count > 0 ? <Tag color="red">{count}</Tag> : <Text type="secondary">0</Text>,
      sorter: (a, b) => a.tasks_above_maximum_count - b.tasks_above_maximum_count,
    },
  ];

  // Project Table Columns
  const projectColumns: TableColumnsType<IProjectReportRow> = [
    {
      title: 'Project',
      key: 'name',
      render: (_, record) => (
        <Space>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: record.project_color || '#1890ff',
            }}
          />
          <div>
            <Text strong>{record.project_name}</Text>
            {record.project_key && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                ({record.project_key})
              </Text>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Tasks Count',
      dataIndex: 'tasks_count',
      key: 'tasks_count',
      align: 'center',
      sorter: (a, b) => a.tasks_count - b.tasks_count,
    },
    {
      title: 'Estimated',
      dataIndex: 'estimated_seconds',
      key: 'estimated_seconds',
      render: (sec: number) => <Text>{formatDuration(sec)}</Text>,
      sorter: (a, b) => a.estimated_seconds - b.estimated_seconds,
    },
    {
      title: 'Recorded',
      dataIndex: 'recorded_seconds',
      key: 'recorded_seconds',
      render: (sec: number) => (
        <Text strong style={{ color: '#1890ff' }}>
          {formatDuration(sec)}
        </Text>
      ),
      sorter: (a, b) => a.recorded_seconds - b.recorded_seconds,
    },
    {
      title: 'Approved',
      dataIndex: 'approved_seconds',
      key: 'approved_seconds',
      render: (sec: number) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatDuration(sec)}
        </Text>
      ),
      sorter: (a, b) => a.approved_seconds - b.approved_seconds,
    },
    {
      title: 'Difference',
      dataIndex: 'difference_seconds',
      key: 'difference_seconds',
      render: (sec: number) => {
        if (sec === 0) return <Text type="secondary">-</Text>;
        return <Tag color="volcano">-{formatDuration(sec)}</Tag>;
      },
      sorter: (a, b) => a.difference_seconds - b.difference_seconds,
    },
    {
      title: 'Variance',
      dataIndex: 'variance_percentage',
      key: 'variance_percentage',
      render: (pct: number) => {
        if (pct === 0) return <Text type="secondary">0%</Text>;
        const isOver = pct > 0;
        return (
          <Text style={{ color: isOver ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
            {isOver ? `+${pct}%` : `${pct}%`}
          </Text>
        );
      },
      sorter: (a, b) => a.variance_percentage - b.variance_percentage,
    },
    {
      title: '&gt; Estimate',
      dataIndex: 'tasks_above_estimate_count',
      key: 'tasks_above_estimate_count',
      align: 'center',
      render: (count: number) =>
        count > 0 ? <Tag color="orange">{count}</Tag> : <Text type="secondary">0</Text>,
      sorter: (a, b) => a.tasks_above_estimate_count - b.tasks_above_estimate_count,
    },
    {
      title: '&gt; Maximum',
      dataIndex: 'tasks_above_maximum_count',
      key: 'tasks_above_maximum_count',
      align: 'center',
      render: (count: number) =>
        count > 0 ? <Tag color="red">{count}</Tag> : <Text type="secondary">0</Text>,
      sorter: (a, b) => a.tasks_above_maximum_count - b.tasks_above_maximum_count,
    },
  ];

  return (
    <Flex vertical gap={16} style={{ padding: '0 8px 24px' }}>
      {/* Header with Title & Export Actions */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Approval Reports
          </Title>
          <Text type="secondary">
            Comprehensive breakdown of Recorded vs Approved time, Adjustments, and Variances
          </Text>
        </div>

        <Space wrap>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'csv',
                  icon: <FileTextOutlined />,
                  label: 'Export as CSV',
                  onClick: () => handleExport('csv'),
                },
                {
                  key: 'excel',
                  icon: <FileExcelOutlined style={{ color: '#52c41a' }} />,
                  label: 'Export as Excel',
                  onClick: () => handleExport('excel'),
                },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />} loading={exporting}>
              Export Report
            </Button>
          </Dropdown>

          <Button icon={<SyncOutlined />} onClick={fetchReportData} loading={loading}>
            Refresh
          </Button>
        </Space>
      </Flex>

      {/* Error alert if any */}
      {error && <Alert type="error" message={error} closable showIcon />}

      {/* Filter Toolbar */}
      <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Select
              style={{ width: '100%' }}
              value={dateRangePreset}
              onChange={handlePresetChange}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'thisWeek', label: 'This Week' },
                { value: 'lastWeek', label: 'Last Week' },
                { value: 'thisMonth', label: 'This Month' },
                { value: 'lastMonth', label: 'Last Month' },
                { value: 'allTime', label: 'All Time' },
              ]}
            />
          </Col>

          {dateRangePreset !== 'allTime' && (
            <Col xs={24} sm={12} md={8}>
              <RangePicker
                style={{ width: '100%' }}
                value={customRange}
                onChange={dates => setCustomRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              />
            </Col>
          )}

          <Col xs={24} sm={12} md={5}>
            <Select
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'ADJUSTED', label: 'Adjusted' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'PENDING', label: 'Pending' },
              ]}
            />
          </Col>

          <Col xs={24} sm={12} md={5}>
            <Input
              placeholder="Search employee / project..."
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {/* Summary KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6} lg={4}>
          <Card size="small" hoverable style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: '#1890ff' }} />
                  <span>Recorded Hours</span>
                </Space>
              }
              value={formatDuration(summary?.total_recorded_seconds || 0)}
              valueStyle={{ fontSize: 20, fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Total employee tracked time
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6} lg={4}>
          <Card size="small" hoverable style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <span>Approved Hours</span>
                </Space>
              }
              value={formatDuration(summary?.total_approved_seconds || 0)}
              valueStyle={{ color: '#52c41a', fontSize: 20, fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Approved by managers
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6} lg={4}>
          <Card size="small" hoverable style={{ borderTop: '3px solid #faad14' }}>
            <Statistic
              title={
                <Space>
                  <SyncOutlined spin={loading} style={{ color: '#faad14' }} />
                  <span>Pending Hours</span>
                </Space>
              }
              value={formatDuration(summary?.total_pending_seconds || 0)}
              valueStyle={{ color: '#faad14', fontSize: 20, fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {summary?.pending_submissions_count || 0} pending submissions
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6} lg={4}>
          <Card size="small" hoverable style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic
              title={
                <Space>
                  <ArrowDownOutlined style={{ color: '#ff4d4f' }} />
                  <span>Adjusted Time</span>
                </Space>
              }
              value={`-${formatDuration(summary?.total_adjustment_seconds || 0)}`}
              valueStyle={{ color: '#ff4d4f', fontSize: 20, fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {summary?.adjustment_percentage || 0}% total adjustment rate
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6} lg={4}>
          <Card size="small" hoverable style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic
              title={
                <Space>
                  <RiseOutlined style={{ color: '#722ed1' }} />
                  <span>Estimated Hours</span>
                </Space>
              }
              value={formatDuration(summary?.total_estimated_seconds || 0)}
              valueStyle={{ fontSize: 20, fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Original task estimates
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6} lg={4}>
          <Card size="small" hoverable style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic
              title={
                <Space>
                  <WarningOutlined style={{ color: '#fa8c16' }} />
                  <span>Over Limits</span>
                </Space>
              }
              value={`${summary?.tasks_above_estimate_count || 0} / ${summary?.tasks_above_maximum_count || 0}`}
              valueStyle={{ fontSize: 20, fontWeight: 700 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              &gt; Estimate / &gt; Max Approved
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Main Report Card with Tabs */}
      <Card
        styles={{
          body: { padding: '16px' },
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={k => setActiveTab(k as 'team' | 'employee' | 'project')}
          items={[
            {
              key: 'team',
              label: (
                <Space>
                  <TeamOutlined />
                  <span>Team Report</span>
                  <Badge count={teamRows.length} showZero style={{ backgroundColor: '#1890ff' }} />
                </Space>
              ),
              children: (
                <Table
                  loading={loading}
                  columns={teamColumns}
                  dataSource={teamRows}
                  rowKey="team_member_id"
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  scroll={{ x: 'max-content' }}
                />
              ),
            },
            {
              key: 'employee',
              label: (
                <Space>
                  <UserOutlined />
                  <span>Employee Report</span>
                  <Badge count={employeeRows.length} showZero style={{ backgroundColor: '#52c41a' }} />
                </Space>
              ),
              children: (
                <Table
                  loading={loading}
                  columns={employeeColumns}
                  dataSource={employeeRows}
                  rowKey="team_member_id"
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  scroll={{ x: 'max-content' }}
                />
              ),
            },
            {
              key: 'project',
              label: (
                <Space>
                  <ProjectOutlined />
                  <span>Project Report</span>
                  <Badge count={projectRows.length} showZero style={{ backgroundColor: '#722ed1' }} />
                </Space>
              ),
              children: (
                <Table
                  loading={loading}
                  columns={projectColumns}
                  dataSource={projectRows}
                  rowKey="project_id"
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  scroll={{ x: 'max-content' }}
                />
              ),
            },
          ]}
        />
      </Card>
    </Flex>
  );
};

export default ApprovalReportsPage;
