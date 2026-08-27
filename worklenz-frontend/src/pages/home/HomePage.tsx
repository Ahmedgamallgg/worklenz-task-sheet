import React, { useEffect, memo, useMemo, useCallback, useState } from 'react';
import { useMediaQuery } from 'react-responsive';
import Col from 'antd/es/col';
import Flex from 'antd/es/flex';
import Row from 'antd/es/row';
import Segmented from 'antd/es/segmented';
import Badge from 'antd/es/badge';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import GreetingWithTime from './GreetingWithTime';
import TasksList from '@/pages/home/task-list/TasksList';
import { ProjectDrawer } from '@/components/projects/project-drawer/project-drawer';
import CreateProjectButton from '@/components/projects/project-create-button/project-create-button';
import RecentAndFavouriteProjectList from '@/pages/home/recent-and-favourite-project-list/recent-and-favourite-project-list';
import TodoList from './todo-list/todo-list';
import MyTeamDashboard from './my-team-dashboard/MyTeamDashboard';

import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAuthService } from '@/hooks/useAuth';
import { isTeamLeadRole } from '@/types/roles/role.types';
import { timeApprovalsApiService } from '@/api/time-approvals/time-approvals.api.service';
import { useSocket } from '@/socket/socketContext';
import { SocketEvents } from '@/shared/socket-events';

import { fetchProjectStatuses } from '@/features/projects/lookups/projectStatuses/projectStatusesSlice';
import { fetchProjectCategories } from '@/features/projects/lookups/projectCategories/projectCategoriesSlice';
import { fetchProjectHealth } from '@/features/projects/lookups/projectHealth/projectHealthSlice';
import { fetchProjects } from '@/features/home-page/home-page.slice';
import { createPortal } from 'react-dom';
import UserActivityFeed from './user-activity-feed/user-activity-feed';

import EmployeeApprovalWidget from './approval-widget/EmployeeApprovalWidget';

const DESKTOP_MIN_WIDTH = 1024;
const TASK_LIST_MIN_WIDTH = 500;
const SIDEBAR_MAX_WIDTH = 400;

// Lazy load heavy components
const TaskDrawer = React.lazy(() => import('@/components/task-drawer/task-drawer'));
const SurveyPromptModal = React.lazy(() =>
  import('@/components/survey/SurveyPromptModal').then(m => ({ default: m.SurveyPromptModal }))
);

const HomePage = memo(() => {
  const dispatch = useAppDispatch();
  const isDesktop = useMediaQuery({ query: `(min-width: ${DESKTOP_MIN_WIDTH}px)` });
  const authService = useAuthService();
  const isOwnerOrAdmin = authService.isOwnerOrAdmin();
  const currentSession = authService.getCurrentSession();
  const isTeamLead = currentSession?.role_name ? isTeamLeadRole(currentSession.role_name) : false;
  const { socket } = useSocket();

  const [activeContext, setActiveContext] = useState<'my-work' | 'my-team'>('my-work');
  const [isManager, setIsManager] = useState<boolean>(isOwnerOrAdmin || isTeamLead);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  useDocumentTitle(activeContext === 'my-team' ? 'Team Dashboard' : 'Home');

  const checkManagerStatus = useCallback(async () => {
    try {
      const res = await timeApprovalsApiService.getDashboardStats();
      if (res.done && res.body?.my_team) {
        if (res.body.my_team.is_manager || isOwnerOrAdmin || isTeamLead) {
          setIsManager(true);
          setPendingApprovalsCount(res.body.my_team.pending_approvals_count || 0);
        }
      }
    } catch (e) {
      // Non-blocking
    }
  }, [isOwnerOrAdmin, isTeamLead]);

  // Check if user has manager role or reportees
  useEffect(() => {
    checkManagerStatus();
  }, [checkManagerStatus]);

  // Real-time updates via WebSockets
  useEffect(() => {
    const handleTimeLogUpdated = () => {
      checkManagerStatus();
    };

    socket?.on(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), handleTimeLogUpdated);
    return () => {
      socket?.off(SocketEvents.TASK_TIME_LOG_UPDATED.toString(), handleTimeLogUpdated);
    };
  }, [socket, checkManagerStatus]);

  // Preload TaskDrawer component to prevent dynamic import failures
  useEffect(() => {
    const preloadTaskDrawer = async () => {
      try {
        await import('@/components/task-drawer/task-drawer');
      } catch (error) {
        console.warn('Failed to preload TaskDrawer:', error);
      }
    };

    preloadTaskDrawer();
  }, []);

  // Memoize fetch function to prevent recreation on every render
  const fetchLookups = useCallback(async () => {
    const fetchPromises = [
      dispatch(fetchProjectHealth()),
      dispatch(fetchProjectCategories()),
      dispatch(fetchProjectStatuses()),
      dispatch(fetchProjects()),
    ].filter(Boolean);

    await Promise.all(fetchPromises);
  }, [dispatch]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  // Memoize components to prevent unnecessary re-renders
  const CreateProjectButtonComponent = useMemo(() => {
    if (!isOwnerOrAdmin) return null;

    return isDesktop ? (
      <div className="absolute right-0 top-1/2 -translate-y-1/2">
        <CreateProjectButton />
      </div>
    ) : (
      <CreateProjectButton />
    );
  }, [isDesktop, isOwnerOrAdmin]);

  return (
    <div className="my-8 min-h-[90vh]">
      <Col className="flex flex-col gap-6">
        <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
          <GreetingWithTime />

          {/* Manager Context Switcher (My Work / My Team) */}
          {isManager && (
            <Segmented
              value={activeContext}
              onChange={val => setActiveContext(val as 'my-work' | 'my-team')}
              size="middle"
              style={{
                padding: 4,
                borderRadius: 8,
                backgroundColor: '#ffffff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #f0f0f0',
              }}
              options={[
                {
                  value: 'my-work',
                  label: (
                    <Flex align="center" gap={6} style={{ padding: '4px 8px' }}>
                      <UserOutlined />
                      <span style={{ fontWeight: 600 }}>My Work</span>
                    </Flex>
                  ),
                },
                {
                  value: 'my-team',
                  label: (
                    <Flex align="center" gap={6} style={{ padding: '4px 8px' }}>
                      <TeamOutlined />
                      <span style={{ fontWeight: 600 }}>My Team</span>
                      {pendingApprovalsCount > 0 && (
                        <Badge
                          count={pendingApprovalsCount}
                          size="small"
                          style={{ backgroundColor: '#fa8c16' }}
                        />
                      )}
                    </Flex>
                  ),
                },
              ]}
            />
          )}
        </Flex>

        {CreateProjectButtonComponent}
      </Col>

      {/* Contextual View: MY WORK vs MY TEAM */}
      {activeContext === 'my-team' && isManager ? (
        <div className="mt-8">
          <MyTeamDashboard />
        </div>
      ) : (
        <Row gutter={[24, 24]} className="mt-12">
          <Col xs={24} lg={16}>
            <Flex vertical gap={24}>
              <TasksList />
            </Flex>
          </Col>

          <Col xs={24} lg={8}>
            <Flex vertical gap={24}>
              <EmployeeApprovalWidget />

              <TodoList />

              <UserActivityFeed />

              <RecentAndFavouriteProjectList />
            </Flex>
          </Col>
        </Row>
      )}

      {createPortal(<TaskDrawer />, document.body, 'home-task-drawer')}
      {createPortal(<ProjectDrawer onClose={() => {}} />, document.body, 'project-drawer')}
      {createPortal(<SurveyPromptModal />, document.body, 'survey-modal')}
    </div>
  );
});

HomePage.displayName = 'HomePage';

export default HomePage;

