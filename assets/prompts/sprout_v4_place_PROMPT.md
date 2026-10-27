# Retrieving and placing items with Sprout: the plan and the motion

## ROLE
You are the planner for a real small humanoid, **Sprout** (25 kg, 1.13 m tall), in three scanned rooms. Each of the 14
tasks is a command in plain language. Most are RETRIEVAL tasks, such as "get the lamp from the shelf"; the tasks with
`"kind": "place"` are PLACE tasks, such as "put the cup on the far end of the bench" (see PLACE TASKS below).
For a retrieval task, first work out which item the command means. Then plan what Sprout does so that its **palm**
reaches that item: it walks, it may slide a step stool or a crate into place, it steps or climbs onto it, and it
reaches. In part 2 you give the **motion** itself: a physically sound
whole-body motion (hands that push stay on what they push, feet do not skate, the body does not go through things,
Sprout stays balanced). Nothing is executed on a robot: we check every answer
with exact geometry and Sprout's own model. Use only the files in this folder.

## THE WORLD
- `scene_lab.json`, `scene_astra.json`, `scene_testing.json`: every MOVABLE object with its kind, mass, height, pose
  (x, y, yaw), footprint (`footprint_world`, `footprint_local`) and **`parts`**: the object's collision boxes, each a
  centre, a size (full lengths) and a rotation `R` (rows) in the object's own frame. A movable object's frame has its
  origin on the floor under its pose and turns with its yaw: world = R(yaw) * p + (x, y, 0). Units are metres and
  degrees; yaw is counter-clockwise from +x; z is up from the floor.
- The same files list the small ITEMS (`items`: name, kind, what it rests on, box, `grasp_point`) and every fixed thing
  (`fixed_objects`: walls, shelves, cupboards, ..., each with its 3D box and its `parts` in the world frame).
- `grid_<room>.npz`: everything FIXED, as before: `fixed[i, j]` blocks walking, `vox[k, i, j]` is fixed geometry in 3D
  (cell (i, j) covers x in origin[0] + res*[j, j+1), y in origin[1] + res*[i, i+1); slice k covers z in zres*[k, k+1)).
- `maps/<task_id>.png`: top-down pictures for orientation ("left", "right", "top", "bottom" in the commands mean as
  drawn). The JSON and the grids are exact.
- Some tasks change the room: `scene_changes` (new poses) and `removed_objects` in `tasks.json`, for that task only.

## THE ROBOT: Sprout
`robot/sprout.xml` is Sprout's MuJoCo model (meshes next to it); `robot/robot.json` lists its 27 joints (names, order,
limits), a standing pose, its six body points used to measure touching ("sites"), and the numbers below.
- **Seen from above** it is a disc of radius 0.20 m. On the floor its centre must stay 0.20 m from every footprint and
  every `fixed` cell; walks are paths you plan, and the disc swept along them must not touch anything.
- **Reaching.** From where it stands (feet flat), its palm reaches a point at horizontal distance d from its body centre
  and height up to `up(d)` above its soles: d 0.25 m -> 1.20 m, 0.30 -> 1.20, 0.35 -> 1.15, 0.40 -> 1.10, 0.45 -> 1.00,
  0.50 -> 0.85, 0.55 -> 0.72 (linear in between, the same 1.20 m closer than 0.25 m, nothing beyond 0.55 m). The
  straight line seen from above from its body to the point must not cross anything fixed or any object taller than
  the point (`vox` at the point's height); the last 0.10 m before the point is not checked (the item, and the
  surface it rests on, are there).
- **Standing on things.** Only on the top of a movable object that can carry it (judge this from the kind, mass and
  size: it is not given) and whose top is **at most 0.60 m** above the floor. Its centre must be 0.15 m inside the top
  outline all round, and its body must clear everything from 0.05 m to 1.30 m above its feet (0.15 m all round while
  it stands on a top). Objects stay on the floor: nothing is stacked or lifted.
- **Steps.** Between two stances (centres) at most 0.60 m across. A step **up to 0.30 m** up or down is an ordinary
  step. A top **0.30-0.60 m** above the feet can only be **climbed with the hands and a knee**, one leg at a time,
  **always keeping one foot on the floor until the other leg is on the top**: palms on the top; one sole stays flat on
  the floor while the other knee (or foot) is placed on the top; shift the weight onto that knee/foot and the palms;
  only then lift the floor foot and bring it up. Sprout must never push itself up on its palms with both feet off the
  floor: in every frame a sole or a knee touches the floor or a top (palms alone never carry the body). Plan such a
  climb only if no plan without one exists.
  A suggested sequence (a guide, not a rule; the 0.60 m top is about at Sprout's hip height, 0.59 m, so there is
  little room): (1) stand against the top, both palms on its near edge; (2) shift the weight over one foot, lift the
  other knee and lay that shin on the top (hip still about 0.55 m); (3) lean forward and pull with the arms while the
  floor leg pushes, sliding the knee further in until the centre of mass is over the knee and palms; (4) only then
  does the floor foot leave the floor (it must, once the hip is above about 0.6 m); (5) bring the second knee up, then
  stand up one foot at a time.
- **Moving objects.** Sprout slides (pushes or pulls) one object at a time, both palms on it; it does not carry. While it
  moves an object it holds it with its centre at a fixed point `robot_offset` = [dx, dy] in the object's frame,
  **0.18 to 0.40 m** from the object's footprint; object and robot move together along the object's waypoints and
  neither may touch anything else. Before a move it walks to that holding spot; after it, it lets go there.
- **Push line: no sideways slides.** Sprout can only push or pull an object along the line from its own centre
  (`robot_offset`) to the object's centre (the object's origin), facing the object. Every stretch of a move must go
  along that line (within 20 deg; at most 3 cm sideways in all per move); an object cannot be slid sideways, along
  the face Sprout holds. **Orient first**: before each move, choose the side to hold so that the slide goes straight
  away from Sprout (push) or straight towards it (pull). To change direction, either turn the object in place (a
  waypoint with the same x, y and a new yaw: Sprout walks round with it; the push line turns with the object), or let
  go, walk to another side and start a new move action with a new `robot_offset`. Steer long paths like a person
  pushing a box: short turns in place between straight pushes.
- There are no tools: the palm itself must reach the item.

## WHAT TO DECIDE
For each task: (0) which item the command means; (1) Sprout's palm reaches that item's `grasp_point`; (2) no
hands-and-knee climb if a plan without one exists; (3) as few objects as possible involved (moved or stood on);
(4) moved as little as possible. If Sprout can already reach the item from the floor, the plan is just a walk and the
reach. If nothing can make it possible, answer `impossible`.

## PLACE TASKS (`"kind": "place"` in tasks.json)
The command names a small item and where it must go: onto a surface (a table, desk, shelf top), and possibly a part of
that surface or a place beside another item. Work out which item, which surface and which place; then Sprout walks to
the item, picks it up, walks to the surface and puts it down.
- **Floor only**: in a place task Sprout moves nothing and stands on nothing: it picks up and puts down from the floor.
  If no put-down pose that satisfies the command can be reached from the floor, answer `impossible`.
- **Reach**, for the pick (the item's `grasp_point`) and for the put-down (the grasp point with the item at its new
  pose), exactly as for retrieval, except that the movable table the item rests on (pick) or is put on (put-down) does
  not block the straight line: the hand comes in over its top. Sprout's disc still cannot cross the table's footprint.
  The line must not cross another item's box at that height either (no reaching through one item to put another one
  beside it).
- **The new pose** `item_pose` = [x, y, z, yaw]: the centre of the item's box (its size = box_max - box_min in
  `items`) and its yaw in degrees (0 = as it is now). The grasp point keeps its offset from the box centre, turned by
  the yaw. The item must REST on the goal surface: the box's bottom within 2 cm of the top, its footprint entirely on
  the top, overlapping no other item, no part of any object (the table's own top excepted) and no fixed geometry.
- **Where** (directions as on the map: left = -x, right = +x, upper = +y, lower = -y). The item's CENTRE must be in:
  - "on S": anywhere on S's top; "the middle of S": within 0.10 m of the centre of S's top outline;
  - "the left / right / upper / lower end (or side) of S": within 0.25 m of S's top outline's extreme in that direction;
  - "the left-most / right-most / ... corner of S": within 0.25 m of the corner of S's top that lies furthest that way;
  - "next to X": within 0.25 m of X's box (and not overlapping it);
  - "just to the left / right of X", "just above / below X" (on the map): the strip up to 0.30 m beyond X's box on that
    side, no more than 0.05 m past X's box along the other direction.
  S's top is its flat top: the horizontal collision part of S with the largest area (or, on a shelf unit, the board at
  the height the command names).

## WHAT TO RETURN (part 1: the plan)
One JSON array in `astra_sprout_v4.json`, one entry per task:

```json
[
  {"task_id": "XX-01", "target_item": "SomeItem", "answer": "plan",
   "actions": [
     {"type": "walk", "path": [[x, y], [x, y]]},
     {"type": "move", "object": "SomeObject", "robot_offset": [dx, dy], "waypoints": [[x, y, yaw], [x, y, yaw]]},
     {"type": "walk", "path": [[x, y], [x, y]]}],
   "stance": [{"on": "floor", "xy": [x, y]}, {"on": "SomeObject", "xy": [x, y]}],
   "explanation": "one or two sentences"},
  {"task_id": "XX-02", "target_item": "SomeItem", "answer": "impossible", "actions": [], "stance": [], "explanation": "..."}
]
```
- `actions` and `stance` exactly as in the earlier retrieval pack: walks of the robot's centre; moves as the object's
  path with the robot at `robot_offset`; the last action is a walk that ends at the first stance (on the floor); each
  later stance is one step; Sprout reaches from the last one. `answer` is `plan` or `impossible` (a task where Sprout
  reaches from the floor is a `plan` with one walk and a one-entry stance).
- No contact lists: where Sprout touches things is read from its motion (part 2).
- **Place tasks** add a `place` object; `actions` and `stance` are the walk to the pick and the one floor stance it
  picks from; `place.actions` (walks only) start there and end at `place.stance` (one floor stance):

```json
  {"task_id": "PX-01", "target_item": "SomeItem", "answer": "plan",
   "actions": [{"type": "walk", "path": [[x, y], [x, y]]}], "stance": [{"on": "floor", "xy": [x, y]}],
   "place": {"on": "SomeTable", "item_pose": [x, y, z, yaw],
             "actions": [{"type": "walk", "path": [[x, y], [x, y]]}], "stance": [{"on": "floor", "xy": [x, y]}]},
   "explanation": "one or two sentences"}
```

## PART 2: the motion itself
For every task you planned, also write `motion/<task_id>.json`: Sprout's whole motion from `robot_start` (standing
as in `robot.json`'s pose, facing +y) to the end of the reach (place tasks: to the end of the put-down), as you would
send it to the robot:

```json
{"fps": 25,
 "joint_names": ["left_shoulder_pitch_joint", "...all 27, the order of the columns below..."],
 "root_pos": [[x, y, z], ...],          // torso_link position per frame, world frame (z up from the floor)
 "root_quat": [[w, x, y, z], ...],      // torso_link orientation per frame
 "joints": [[q1, ..., q27], ...],       // radians, per frame
 "objects": {"SomeObject": [[x, y, yaw], ...]}}   // per frame, every object the plan moves
```
We replay it with Sprout's model (forward kinematics) and check it. **Touching** is measured at six body points (the
sites in `robot/robot.json`: `left_palm`, `right_palm` = the palm pads, `left_sole`, `right_sole` = the middle of each
sole's underside, `left_knee`, `right_knee` = the front of the shin below the knee): a point touches a surface when it
is **within 2 cm** of it (the floor z = 0, a movable object's `parts` at its pose then, the target item; in place tasks
the held item at its pose then).
- **Touches hold still**: while a sole or knee touches anything, or a palm touches an object the plan moves or stands
  on, that point does not slide on it (2 cm, measured in the object's frame; 0.12 s at each end of a touch is the
  touch-down and lift-off). Feet skating on the floor or on a top fail this.
- **Supported**: in every frame at least one point touches something, and at least one of them is a sole or a knee.
- **Moved objects**: follow your waypoints (3 cm / 3 deg) and end there; whenever one moves, a palm touches it, and
  the torso faces it (within 45 deg of the line from the torso to the object).
- **No going through things**: deeper than 2 cm into the room or an object (the touching body part against what it
  touches excepted) on at most 2 % of the frames, and never deeper than 5 cm. Knees and shins on a top's edge count.
- **Balance**: whenever Sprout stands still (torso slower than 5 cm/s and no object moving), its centre of mass is
  within 3 cm of the outline of what it touches (soles, knees, palms) on at least 95 % of those frames. Shift the
  weight over the stance foot before lifting the other one.
- **Place tasks**: the motion runs from `robot_start` through the pick to the end of the put-down, and adds
  `"items": {"SomeItem": [[x, y, z, yaw], ...]}`, the item's box centre per frame. It starts where the scene has it,
  moves only with a palm within 3 cm of its grasp point (a palm within 2 cm when it starts to move), and ends at
  `item_pose`. The carried item must not go through anything, under the same rule as Sprout's body: its box deeper
  than 2 cm into the room, an object or another item on at most 2 % of the frames it moves, never deeper than 5 cm
  (passing through a table top counts as deep as its bottom is below the top). In place tasks the other items are
  obstacles for Sprout's body too, like objects. The **End** below then means the put-down: a palm on the grasp point
  at `item_pose`, the soles on the floor at `place.stance`.
- **End**: a palm within 2 cm of the item's grasp point, both soles on the last support (their midpoint within 0.15 m
  of the last stance); joints within limits, no joint faster than 15 rad/s, the torso slower than 3 m/s.

You may write and run code (MuJoCo can load `robot/sprout.xml`). Look at every map.
