# Rearranging a room so a robot can reach a place: what to move, where, and how

## ROLE
You are the planner in an evaluation of geometric reasoning. You are given three scanned rooms, a robot, and 11 tasks. You
do not control a real robot and nothing is executed: we check every answer with exact geometry. Use only the files in
this folder.

## THE WORLD
- `scene_lab.json`, `scene_astra.json`, `scene_testing.json`: every MOVABLE object, with its kind, mass, pose (x, y, yaw) and its footprint
  (outline on the floor), both in world coordinates (`footprint_world`) and in its own frame (`footprint_local`;
  world = R(yaw) * p + (x, y)). Units are metres and degrees; yaw is counter-clockwise from +x.
- `grid_lab.npz`, `grid_astra.npz`, `grid_testing.npz`: everything FIXED (walls, built-in units, closed doors, and floor outside the scanned
  room) as an occupancy grid. `fixed[i, j]` True = blocked; cell (i, j) covers x in origin[0] + res*[j, j+1) and
  y in origin[1] + res*[i, i+1). Fixed things cannot be moved.
- `maps/<task_id>.png`: a top-down picture of the room as it is in that task, with the robot's start (black dot) and,
  for Q2, the goal outline (orange dashes). Q1 targets are NOT drawn: they are given only in words. Dark = fixed, light grey = outside the scanned
  room, blue = movable. The maps are for orientation; the JSON and the grid are exact.
- Some tasks change the room: `scene_changes` in `tasks.json` gives new poses {object: [x, y, yaw]} that replace the
  ones in the scene file for that task only.

## THE ROBOT
A disc of radius 0.25 m, starting at `robot_start`. It can stand anywhere its centre is at least 0.25 m from every
footprint and every fixed cell. Anything between 0.05 and 1.40 m above the floor blocks it, which is what the
footprints and the grid already describe. You plan the robot too:
- **Walking.** When it holds nothing, it walks along paths YOU plan: its 0.25 m disc, swept along the path, must not
  touch anything fixed or any object, as the room is at that moment.
- **Moving objects.** It can move any movable object, however heavy, one at a time, sliding and turning it on the
  floor. While it moves an object the robot is STUCK to it: it holds the object with its centre at a fixed point
  `robot_offset` = [dx, dy] in the object's own frame (world = R(yaw) * offset + (x, y)), 0.23 to 0.45 m from the
  object's footprint, and the object's footprint AND the robot's 0.25 m disc move together along the object's
  waypoints; neither may overlap anything fixed or any other object at any point. Before a move the robot must walk to
  that holding spot (the object at its current pose); after the move it stands at the holding spot of the object's new
  pose and lets go.
- **Carrying.** A move can also be a CARRY ("carry": true): the robot lifts the object instead of sliding it. The
  geometry is the same, but only objects of at most 15 kg can be carried. When a task says an object must be carried,
  sliding it is wrong.

## THE TWO KINDS OF TASK
**Q1: what to move, where, and how.** The robot must be able to stand at a place described in words in the
`instruction` (its centre there). Work out from the scene files and the map where that place is: object names in the
description are the names in the scene files, and "left", "right", "top" and "bottom" mean as drawn on the maps
(x to the right, y up). Decide which objects to move, give each a new pose, AND plan how each one gets there: a path of waypoints,
moved one object at a time in your order, exactly as in Q2 below. Goals, in order: (1) the target becomes reachable;
(2) move as few objects as possible; (3) then move them as little as possible. Every new pose must be free: its
footprint overlaps no fixed cell and no other object (in their final poses). Every path must be free as well, for the object and the robot
holding it. After the last move the robot WALKS to the target: your last action is a walk that ends with the robot's
centre inside the place described. If the robot can already reach the target, answer `already_reachable`. If no rearrangement of movable objects can make it
reachable, answer `impossible`.

**Q2: how to move it.** An object must end at `goal_pose` (within the tolerance). Plan its motion as waypoints, and
first plan the motion of any other object that is in the way (where you put it is up to you). Moves happen one at a
time, in your order. Within a move, the object goes in a straight line from each waypoint to the next, with x, y and
yaw interpolated linearly together; at no point may its footprint overlap a fixed cell or another object. The first
waypoint of a move is the object's current pose. The robot is stuck to each object it moves (see THE ROBOT) and walks
between moves. If it cannot be done, answer `impossible`.

## WHAT TO RETURN
One JSON array in `astra_reach_v3.json`, one entry per task, in any order. Q1 and Q2 use the same `actions` format:

```json
[
  {"task_id": "X-Q1-01", "answer": "move",
   "actions": [
     {"type": "walk", "path": [[x, y], [x, y], [x, y]]},
     {"type": "move", "object": "Chair5", "robot_offset": [0.0, -0.5], "waypoints": [[x, y, yaw], [x, y, yaw]]},
     {"type": "walk", "path": [[x, y], [x, y]]},
     {"type": "move", "object": "Table3", "robot_offset": [0.8, 0.0], "waypoints": [[x, y, yaw], [x, y, yaw], [x, y, yaw]]},
     {"type": "walk", "path": [[x, y], [x, y], [x, y]]}],
   "explanation": "one or two sentences"},
  {"task_id": "X-Q1-02", "answer": "impossible", "actions": [], "explanation": "..."},
  {"task_id": "X-Q2-01", "answer": "plan",
   "actions": [
     {"type": "walk", "path": [[x, y], [x, y]]},
     {"type": "move", "object": "Chair4", "carry": true, "robot_offset": [0.55, 0.0],
      "waypoints": [[x, y, yaw], [x, y, yaw], [x, y, yaw]]}],
   "explanation": "..."}
]
```
- `actions` are everything the robot does, in order:
  - `walk`: the ROBOT's path (its centre, x y) when it holds nothing. The first point is where the robot is at that
    moment: `robot_start` for the first action, otherwise where the previous action left it. Straight lines between
    points.
  - `move`: an object's PATH with the robot stuck to it at `robot_offset`. The first waypoint is the object's pose at
    that moment, the last is where it ends; straight lines between waypoints, x, y and yaw interpolated together. The
    robot must already be at the holding spot (walk there first).
- Q1: the last action is a walk that ends inside the target place. Q2: the plan may end with the last move.
- `answer` is one of `move`, `already_reachable`, `impossible` for Q1, and `plan`, `impossible` for Q2. For
  `already_reachable` and `impossible`, `actions` is empty.

You may write and run code to check your answers. Look at every map.
