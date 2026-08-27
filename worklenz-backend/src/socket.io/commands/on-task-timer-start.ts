import moment from "moment";
import {Server, Socket} from "socket.io";
import db from "../../config/db";
import {SocketEvents} from "../events";

import {getLoggedInUserIdFromSocket, log_error, notifyProjectUpdates} from "../util";

export async function on_task_timer_start(_io: Server, socket: Socket, data?: string) {
  try {
    const body = JSON.parse(data as string);
    const userId = getLoggedInUserIdFromSocket(socket);

    // Enforce single active timer rule across all tasks
    const existingQuery = `
      SELECT tt.task_id, t.name as task_name
      FROM task_timers tt
      JOIN tasks t ON t.id = tt.task_id
      WHERE tt.user_id = $1 AND tt.task_id != $2;
    `;
    const existing = await db.query(existingQuery, [userId, body.task_id]);
    if (existing.rows.length > 0) {
      socket.emit(SocketEvents.TASK_TIMER_START.toString(), {
        error: "ACTIVE_TIMER_EXISTS",
        message: "You already have an active timer.",
        details: {
          taskId: existing.rows[0].task_id,
          taskName: existing.rows[0].task_name,
        },
      });
      return;
    }

    const q = `
    INSERT INTO task_timers (task_id, user_id, start_time)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT ON CONSTRAINT task_timers_pk DO UPDATE SET start_time = CURRENT_TIMESTAMP
    RETURNING start_time;
    `;

    const result = await db.query(q, [body.task_id, userId]);
    const [d] = result.rows;
    socket.emit(SocketEvents.TASK_TIMER_START.toString(), {
      id: body.task_id,
      timer_start_time: moment(d.start_time).valueOf(),
      parent_task: body.parent_task,
    });
    notifyProjectUpdates(socket, body.task_id);
    return;
  } catch (error) {
    log_error(error);
  }

  socket.emit(SocketEvents.TASK_TIMER_START.toString(), null);
}
