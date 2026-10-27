# Sprout pushes a suitcase to the dishwasher and gets ready to climb onto it (one task, the real apartment)

## ROLE
You are the planner for a real small humanoid, **Sprout** (25 kg, 1.13 m tall). The task in `tasks.json` (SS-01) will
be **run on the real robot** in this room tomorrow, so it must be a plan Sprout's body can really do. A
hard suitcase, **`Suitcase0`**, lies flat on the floor inside a taped rectangle beside the desk (Desk0), south of the fridge (0.60 m long, 0.395 m wide, **0.23 m
high**, 3 kg). Sprout must **push it to its goal pose in front of the dishwasher** and then **walk to where it will climb onto it: on the floor behind it, facing the dishwasher, the case straight ahead**. Sprout's own climbing skill does the climb (you do not plan it). Give **the plan only**: the robot's walks, the suitcase's path
(its moves) and the end pose where Sprout's climbing skill takes over. **No motions** (no joint trajectories, no motion files): Sprout's own controllers do the walking, the pushing and, after your plan ends, the climbing. Nothing is executed by you: we check every answer with exact geometry,
simple physics and Sprout's own model. The task can be done. Use only the files in this folder.

## THE WORLD
- `scene_apt_suitcase2.json`: the apartment (a scan of the real room): fixed furniture (the kitchen row along y ~ 2.3:
  pantry, cabinets, dishwasher `Dishwasher0` (x 0.25 to 0.90, door at y 2.31), fridge `Refrigerator0`, bookcase,
  walls) and MOVABLE objects with kind, mass, height, pose (x, y, yaw), footprint (`footprint_world`,
  `footprint_local`) and:
  - **`parts`**: collision parts in the object's own frame (centre, full size, rotation `R` (rows), `label`).
  - **`physics`**: mass, centre of mass `com_local`, support polygon `support_local` (object frame), floor friction
    **`mu_floor`** and `slide_force_n` = mu * m * g.
  A movable object's frame has its origin on the floor under its pose and turns with its yaw: world = R(yaw) * p +
  (x, y, 0). Metres and degrees; yaw counter-clockwise from +x; z up from the floor.
- Only `Suitcase0` may be moved in this task; every other object stays where it is (treat them as obstacles).
- `grid_apt_suitcase2.npz`: everything FIXED: `fixed[i, j]` blocks walking (unscanned floor counts as blocked),
  `vox[k, i, j]` is fixed geometry in 3D (cell (i, j) covers x in origin[0] + res*[j, j+1), y in origin[1] +
  res*[i, i+1); slice k covers z in zres*[k, k+1)).
- `maps/SS-01.png`: top-down picture of the room. The goal is the dashed red outline. The JSON and grids are exact.

## THE ROBOT: Sprout
`robot/sprout.xml` is Sprout's MuJoCo model; `robot/robot.json` lists its 27 joints, a standing pose, its six body
points used to measure touching ("sites": palms, soles, knees) and the numbers below.
- **Start**: at `robot_start`, standing as in `robot.json`'s pose, facing `robot_start_yaw_deg`.
- **Seen from above** it is a disc of radius 0.20 m. On the floor its centre stays 0.20 m from every footprint and
  every `fixed` cell; the disc swept along a walk must not touch anything.
- **Reaching.** From where it stands (feet flat), its palm reaches a point at horizontal distance d from its body centre
  and height up to `up(d)` above its soles: d 0.25 m -> 1.20 m, 0.30 -> 1.20, 0.35 -> 1.15, 0.40 -> 1.10, 0.45 -> 1.00,
  0.50 -> 0.85, 0.55 -> 0.72 (linear in between, the same 1.20 m closer than 0.25 m, nothing beyond 0.55 m).
- **Moving the suitcase: Sprout pushes it with its LOWER LEG.** It slides it; it does not lift or carry it, and its
  hands do not touch it. It stands **side-on** to the push (its body turned 90 deg to the push direction, the side
  of its lower leg against the face it pushes, about 0.10 m above the floor) and **side-steps** with it. While it
  pushes, its centre stays at a fixed point `robot_offset` = [dx, dy] in the suitcase's frame, **0.15 to 0.25 m**
  from its footprint (about 0.20 m: the hip right next to the case); suitcase and robot move together along the
  waypoints and neither may touch anything else. Before a move it walks to that spot; after it, it steps away there.
- **Push line: push only, no sideways slides.** The suitcase moves only along the line from Sprout's centre
  (`robot_offset`) to the suitcase's centre (its origin), **away from Sprout** (a leg cannot pull): every stretch of a
  move within 20 deg of that line, at most 3 cm sideways in all per move. To change direction, let go, walk to
  another side and start a new move action with a new `robot_offset` (a turn in place is not possible with a leg
  push). **No diagonal pushes**: push along one of the suitcase's own axes (x or y), i.e. `robot_offset` on the
  normal of one face through the centre (its other component within 3 cm of 0).
- **Heading (which way Sprout's body faces).** Sprout walks forward or sideways without turning (its walking
  controller takes forward / sideways speed and a turn rate) but **never backwards**: every walk segment's direction
  is within **90 deg** of Sprout's heading at both its ends (turn on the spot first if needed). It turns only where
  your plan says. While it pushes it is **side-on**: its heading is the push direction **- 90 deg** (left leg against the
  case) or **+ 90 deg** (right leg), within 10 deg, constant for the whole move. It starts facing
  `robot_start_yaw_deg`.

## PHYSICS (quasi-static)
- The suitcase **slides** on the floor. Sliding needs a horizontal force **F = mu * m * g** (`slide_force_n`). Sprout
  pushes at most **147 N**.
- **Tipping**: the leg applies F horizontally at h = 0.10 m, along the push line. It
  tips over the leading edge of its support if **mu * h > d**, where d is how far the support polygon reaches ahead of
  the COM in that direction. Turning on the spot is not tip-checked.

## WHAT TO DECIDE
- `Suitcase0` ends within **0.05 m and 15 deg** of its goal (in `tasks.json`: centred on the dishwasher, its long side
  parallel to the dishwasher door, 0.10 m in front of it).
- Where Sprout stands to push, which face its leg pushes, the suitcase's path (one or more move actions), and the
  **end pose** (below).

## WHAT TO RETURN (the plan; nothing else)
One JSON array in `astra_suitcase_step.json`, one entry:

```json
[
  {"task_id": "SS-01", "kind": "rearrange", "answer": "plan",
   "actions": [
     {"type": "walk", "path": [[x, y, heading], [x, y, heading]]},
     {"type": "move", "object": "Suitcase0", "robot_offset": [dx, dy], "heading_deg": h, "leg": "left",
      "waypoints": [[x, y, yaw], [x, y, yaw]]},
     {"type": "walk", "path": [[x, y, heading], [x, y, heading]]}],
   "end": {"xy": [x, y], "yaw_deg": yaw},
   "explanation": "two or three sentences: the path, which face the leg pushes and why it does not tip, where it ends"}
]
```
- `actions` in order: walks of the robot's centre (the first starts at `robot_start`; each starts where the robot is)
  and moves (the suitcase's path, the first waypoint its current pose; the robot at `robot_offset`). The last action
  ends at the end pose.
- **Headings** (degrees, counter-clockwise from +x): every walk point is [x, y, heading]; Sprout's heading changes
  linearly between consecutive points (the same x, y twice with a new heading = a turn on the spot). A walk starts
  with the heading Sprout has (within 5 deg); a move's `heading_deg` (side-on, see above) is the heading the walk
  before it ends with; `leg` is the pushing leg; the end `yaw_deg` is the last walk's last heading.
- `end`: where Sprout stands when the plan ends (its centre, where the last action ends) and the way it faces. Its
  climbing skill starts from here, so: **facing the dishwasher** (`yaw_deg` within 15 deg of 90, i.e. +y), the
  suitcase (at its final pose) **straight ahead** (its centre within 15 deg of that facing direction), Sprout's
  centre **0.20 to 0.35 m** from the suitcase's footprint, on the floor.

## WHAT MAKES A PLAN BETTER
Among valid plans we prefer, in this order: **(1) the fewest moves** (each new move = letting go, walking round and re-placing the leg), then **(2) the least total rotation of Sprout's body**: the sum of |heading change| over the whole plan, from `robot_start_yaw_deg` to the end yaw (every turn costs time and drifts the real robot). Choose the leg of each push and the headings of the walks with this in mind, and say in the explanation how many moves and how many degrees of rotation your plan has.

You may write and run code (MuJoCo can load `robot/sprout.xml`). Look at the map. Write only `astra_suitcase_step.json`: no motion files.
