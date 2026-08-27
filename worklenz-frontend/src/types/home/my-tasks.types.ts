import { IProjectTask } from '../project/projectTasksViewModel.types';
import { ITaskStatusViewModel } from '../tasks/taskStatusGetResponse.types';

export interface IMyTask extends IProjectTask {
  is_task: boolean;
  done: boolean;
  project_color?: string;
  project_name?: string;
  team_id?: string;
  status_color?: string;
  project_statuses?: ITaskStatusViewModel[];
  parent_task_name?: string;
  latest_time_approval_status?: string;
}
