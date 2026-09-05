"""
SampAI
RTOS Priority Scheduler Simulation

This simulator represents the RTOS running inside a bus.

Priority:
1 = Emergency
2 = Breakdown
3 = Accessibility assistance
4 = GPS tracking
5 = Passenger counting
6 = Data upload

Lower number = higher priority.
"""

from dataclasses import dataclass, asdict
from datetime import datetime
import heapq
import itertools
import threading
import time
from typing import Optional


@dataclass
class RTOSTask:
    name: str
    priority: int
    duration: float
    description: str


class RTOSSimulator:

    def __init__(self):
        self.task_queue = []
        self.counter = itertools.count()

        self.current_task: Optional[RTOSTask] = None

        self.running = False
        self.worker_thread = None
        self.periodic_thread = None

        self.logs = []

        self.lock = threading.Lock()

    # ---------------------------------------------------------
    # LOGGING
    # ---------------------------------------------------------

    def add_log(
        self,
        event: str,
        task: str,
        priority: int,
        message: str,
    ):
        log = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "event": event,
            "task": task,
            "priority": priority,
            "message": message,
        }

        self.logs.append(log)

        self.logs = self.logs[-100:]

        print(
            f"[RTOS] {event} | "
            f"P{priority} | "
            f"{task} | "
            f"{message}"
        )

    # ---------------------------------------------------------
    # ADD TASK
    # ---------------------------------------------------------

    def add_task(
        self,
        name: str,
        priority: int,
        duration: float,
        description: str,
    ):

        task = RTOSTask(
            name=name,
            priority=priority,
            duration=duration,
            description=description,
        )

        with self.lock:

            heapq.heappush(
                self.task_queue,
                (
                    priority,
                    next(self.counter),
                    task,
                ),
            )

            self.add_log(
                event="QUEUED",
                task=name,
                priority=priority,
                message="Task added to RTOS ready queue.",
            )

    # ---------------------------------------------------------
    # STANDARD ACCESSMOVE TASKS
    # ---------------------------------------------------------

    def add_gps_task(self):

        self.add_task(
            name="GPS Tracking",
            priority=4,
            duration=1.5,
            description="Update live bus location.",
        )

    def add_passenger_count_task(self):

        self.add_task(
            name="Passenger Counting",
            priority=5,
            duration=1,
            description="Calculate passenger count and crowd level.",
        )

    def add_data_upload_task(self):

        self.add_task(
            name="Data Upload",
            priority=6,
            duration=2,
            description="Synchronise historical bus data.",
        )

    def add_assistance_task(self):

        self.add_task(
            name="Accessibility Assistance",
            priority=3,
            duration=2,
            description="Notify driver about passenger assistance request.",
        )

    def add_breakdown_task(self):

        self.add_task(
            name="Breakdown Monitoring",
            priority=2,
            duration=2,
            description="Notify administrator and request replacement bus.",
        )

    def add_emergency_task(self):

        self.add_task(
            name="Emergency",
            priority=1,
            duration=2,
            description="Send emergency alert to central server immediately.",
        )

    # ---------------------------------------------------------
    # AUTOMATIC PERIODIC TASKS
    # ---------------------------------------------------------

    def periodic_task_loop(self):

        last_gps = time.time()
        last_passenger_count = time.time()
        last_data_upload = time.time()

        while self.running:

            current_time = time.time()

            # GPS every 2 seconds
            if current_time - last_gps >= 2:
                self.add_gps_task()
                last_gps = current_time

            # Passenger counting every 7 seconds
            if current_time - last_passenger_count >= 7:
                self.add_passenger_count_task()
                last_passenger_count = current_time

            # Data upload every 15 seconds
            if current_time - last_data_upload >= 15:
                self.add_data_upload_task()
                last_data_upload = current_time

            time.sleep(0.1)

    # ---------------------------------------------------------
    # CHECK FOR PRE-EMPTION
    # ---------------------------------------------------------

    def higher_priority_waiting(self, current_priority):

        with self.lock:

            if not self.task_queue:
                return False

            next_priority = self.task_queue[0][0]

            return next_priority < current_priority

    # ---------------------------------------------------------
    # EXECUTE TASK
    # ---------------------------------------------------------

    def execute_task(self, task: RTOSTask):

        self.current_task = task

        self.add_log(
            event="STARTED",
            task=task.name,
            priority=task.priority,
            message=task.description,
        )

        remaining = task.duration

        while remaining > 0 and self.running:

            time.sleep(0.25)

            remaining -= 0.25

            # -----------------------------------------------
            # PRE-EMPTION
            # -----------------------------------------------

            if self.higher_priority_waiting(task.priority):

                self.add_log(
                    event="PREEMPTED",
                    task=task.name,
                    priority=task.priority,
                    message=(
                        f"{task.name} paused because a "
                        "higher-priority task arrived."
                    ),
                )

                resumed_task = RTOSTask(
                    name=task.name,
                    priority=task.priority,
                    duration=remaining,
                    description=task.description,
                )

                with self.lock:

                    heapq.heappush(
                        self.task_queue,
                        (
                            task.priority,
                            next(self.counter),
                            resumed_task,
                        ),
                    )

                self.current_task = None

                return

        if self.running:

            self.add_log(
                event="COMPLETED",
                task=task.name,
                priority=task.priority,
                message=f"{task.name} completed successfully.",
            )

        self.current_task = None

    # ---------------------------------------------------------
    # SCHEDULER
    # ---------------------------------------------------------

    def scheduler_loop(self):

        self.add_log(
            event="SYSTEM",
            task="RTOS Scheduler",
            priority=0,
            message="Priority scheduler started.",
        )

        while self.running:

            selected_task = None

            with self.lock:

                if self.task_queue:

                    _, _, selected_task = heapq.heappop(
                        self.task_queue
                    )

            if selected_task:

                self.execute_task(selected_task)

            else:

                time.sleep(0.1)

    # ---------------------------------------------------------
    # START
    # ---------------------------------------------------------

    def start(self):

        if self.running:
            return

        self.running = True

        self.worker_thread = threading.Thread(
            target=self.scheduler_loop,
            daemon=True,
        )

        self.periodic_thread = threading.Thread(
            target=self.periodic_task_loop,
            daemon=True,
        )

        self.worker_thread.start()
        self.periodic_thread.start()

    # ---------------------------------------------------------
    # STOP
    # ---------------------------------------------------------

    def stop(self):

        self.running = False

        self.add_log(
            event="SYSTEM",
            task="RTOS Scheduler",
            priority=0,
            message="Priority scheduler stopped.",
        )

    # ---------------------------------------------------------
    # RESET
    # ---------------------------------------------------------

    def reset(self):

        self.stop()

        time.sleep(0.2)

        with self.lock:
            self.task_queue.clear()

        self.current_task = None
        self.logs.clear()

    # ---------------------------------------------------------
    # STATUS
    # ---------------------------------------------------------

    def get_status(self):

        with self.lock:

            waiting = [
                asdict(item[2])
                for item in sorted(self.task_queue)
            ]

        return {
            "running": self.running,

            "currentTask": (
                asdict(self.current_task)
                if self.current_task
                else None
            ),

            "waitingTasks": waiting,

            "logs": self.logs,
        }


# -------------------------------------------------------------
# SINGLE SHARED RTOS INSTANCE
# -------------------------------------------------------------

rtos_simulator = RTOSSimulator()