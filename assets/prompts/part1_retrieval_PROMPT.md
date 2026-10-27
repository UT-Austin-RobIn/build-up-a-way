# Retrieving an item: can the robot reach it, and what would it climb on

## ROLE
You are the planner in an evaluation of geometric reasoning. You are given three scanned rooms, a robot, and 15 tasks.
Each task is a command in plain language, such as "get the jar from the shelf". The item rests on top of something (a
desk, a shelf, a cabinet, a fridge). First work out which item the command means; then the robot's HAND must reach
that item so it can grasp it. Sometimes it can simply walk there and reach; sometimes the item is too high and the
robot has to climb onto something (which you may first move into place); sometimes nothing can get it high enough. You do not control a real robot
and nothing is executed: we check every answer with exact geometry. Use only the files in this folder.

## THE WORLD
- `scene_lab.json`, `scene_astra.json`, `scene_testing.json`: every MOVABLE object, with its kind, mass, height, pose (x, y, yaw) and its
  footprint, both in world coordinates (`footprint_world`) and in its own frame (`footprint_local`;
  world = R(yaw) * p + (x, y)). Units are metres and degrees; yaw is counter-clockwise from +x. Each object counts as a
  solid block from the floor up to its `height_m`; its top surface is its footprint at that height.
- The same files also list the small ITEMS the commands talk about, and other items like them (`items`): each has a
  name, its kind, what it rests on or is fixed to (`on`), its box (`box_min`, `box_max`: x, y, z) and its `grasp_point`
  (x, y, z), the point the hand has to reach. Items never block anything; they are only targets. If an item rests on a
  movable object and you move that object, the item moves with it.
- `fixed_objects` in the same files names every fixed thing (walls, windows, cupboards, shelves, lamps, ...) with its
  kind and its 3D box, so you can tell what a command refers to. Heights z are measured from the floor.
- `grid_lab.npz`, `grid_astra.npz`, `grid_testing.npz`: everything FIXED. `fixed[i, j]` (True = blocked) is what blocks walking: walls,
  built-in units, closed doors, and floor outside the scanned room; cell (i, j) covers x in origin[0] + res*[j, j+1) and
  y in origin[1] + res*[i, i+1). `vox[k, i, j]` is the fixed geometry in 3D: True where something fixed occupies z in
  zres*[k, k+1) (counters, wall shelves, cupboards, the things standing on them). Fixed things cannot be moved or
  climbed.
- `maps/<task_id>.png`: a top-down picture of the room as it is in that task, with the robot's start (black dot), each
  object's height under its name, and the items (small purple squares, named). "Left", "right", "top" and "bottom" in
  the commands mean as drawn on these maps (x to the right, y up). The maps are for orientation; the JSON and the grids
  are exact.
- Some tasks change the room: `scene_changes` in `tasks.json` gives new poses {object: [x, y, yaw]}, and
  `removed_objects` lists objects that are not in the room, for that task only.

## THE ROBOT
A humanoid, 45 kg. Seen from above it is a disc of radius 0.25 m, starting at `robot_start`.
- **Walking.** On the floor it can stand anywhere its centre is at least 0.25 m from every footprint and every `fixed`
  cell. It walks along paths YOU plan (see `actions` below): its 0.25 m disc, swept along the path, must not touch
  anything fixed or any object, as the room is at that moment.
- **Reaching.** From where it stands, its hand reaches a point that is at most 0.70 m away horizontally (from the
  robot's centre) and at most 1.80 m above the surface its feet are on, if nothing is in the way at the point's height:
  the straight line, seen from above, from the robot (beyond its own 0.25 m body) to the point (up to 0.10 m before it)
  must not cross anything fixed (`vox` at the point's height) or any object taller than that height.
- **Climbing.** It can stand on top of a movable object if the object can carry it, its feet have 0.15 m of top surface
  all round (its centre is at least 0.15 m inside the top outline), and its body clears everything from 0.05 m to
  1.60 m above its feet (0.25 m all round). One step goes at most 0.30 m up or down and at most 0.60 m across, measured
  between where its centre is before and after the step. Objects stay on the floor: nothing can be stacked or lifted
  onto anything else. **Whether an object can safely carry a 45 kg robot is not given: judge it from its kind, mass and
  size.**
- **Moving objects.** It can move any movable object, however heavy, one at a time, sliding and turning it on the
  floor. While it moves an object the robot is STUCK to it: it holds the object with its centre at a fixed point
  `robot_offset` = [dx, dy] in the object's own frame (world = R(yaw) * offset + (x, y)), 0.23 to 0.45 m from the
  object's footprint, and the object's footprint AND the robot's 0.25 m disc move together along the object's
  waypoints; neither may overlap anything fixed or any other object at any point. Before a move the robot must walk to
  that holding spot (the object at its current pose); after the move it stands at the holding spot of the object's new
  pose and lets go.
- **Carrying.** A move can also be a CARRY ("carry": true): the robot lifts the object instead of sliding it. The
  geometry is the same as above, but only objects of at most 15 kg can be carried. When a task says an object must be
  carried (or that nothing may be dragged), sliding it is wrong.
- There are no tools to hold (no poles or hooks): the hand itself must reach the item.

## WHAT TO DECIDE
For each task: (0) which item the command means; (1) the hand reaches that item's `grasp_point`; (2) as few objects
as possible are involved, where an object is
involved if it is moved or climbed on; (3) then they are moved as little as possible. If the robot can already
reach the item from the floor without touching anything, answer `already_reachable`. If nothing can make it possible,
answer `impossible`.

## WHAT TO RETURN
One JSON array in `astra_retrieve_v1.json`, one entry per task, in any order:

```json
[
  {"task_id": "XX-01", "target_item": "SomeItem", "answer": "plan",
   "actions": [
     {"type": "walk", "path": [[x, y], [x, y], [x, y]]},
     {"type": "move", "object": "SomeObject", "robot_offset": [0.5, 0.0],
      "waypoints": [[x, y, yaw], [x, y, yaw], [x, y, yaw]]},
     {"type": "walk", "path": [[x, y], [x, y]]},
     {"type": "move", "object": "OtherObject", "carry": true, "robot_offset": [0.0, -0.45],
      "waypoints": [[x, y, yaw], [x, y, yaw]]},
     {"type": "walk", "path": [[x, y], [x, y]]}],
   "tool": null,
   "stance": [{"on": "floor", "xy": [x, y]}, {"on": "SomeObject", "xy": [x, y]}],
   "explanation": "one or two sentences: which objects, and why these and not others"},
  {"task_id": "XX-02", "target_item": "SomeItem", "answer": "impossible", "actions": [], "tool": null, "stance": [], "explanation": "..."}
]
```
- `target_item`: the name of the item (from `items`) the command means. Give it in every entry, whatever the answer.
- `actions`: everything the robot does on the floor, in order, as one list:
  - `walk`: the ROBOT's path (its centre, x y), when it is not holding anything. The first point is where the robot is
    at that moment: `robot_start` for the first action, otherwise where the previous action left it. Between points it
    walks in a straight line.
  - `move`: an object's PATH, with the robot stuck to it at `robot_offset`. The first waypoint is the object's pose at
    that moment, the last is where it ends; between waypoints it moves in a straight line, x, y and yaw interpolated
    together. The robot must already be at the holding spot (walk there first).
  - The last action is a walk that ends at the first stance.
- `tool`: always null.
- `stance`: where the robot stands for the reach, in order, after all the actions: it starts on the floor
  (`"on": "floor"`, where the last walk ended) and each later entry is one step (onto an object's top or back to the
  floor). The robot reaches the item from the LAST entry.
- `answer` is one of `plan`, `already_reachable`, `impossible`. For `already_reachable` and `impossible`, `actions` and
  `stance` are empty.

You may write and run code to check your answers. Look at every map.
