/* Demo dataset. Used for local preview before a device is set up.
   Never written to the data repo. */

var Demo = (function () {
  var pod = {
    members: [
      { id: "prithvi", name: "Prithvi" },
      { id: "sowmya", name: "Sowmya" }
    ],
    created: "2026-09-19"
  };

  var habits = {
    weekStart: "monday",
    habits: [
      { id: "exercise", name: "Exercise", type: "count", unit: "workouts", period: "week", targets: { prithvi: 3, sowmya: 3 }, syncEligible: false },
      { id: "water", name: "Water", type: "count", unit: "glasses", period: "day", targets: { prithvi: 8, sowmya: 8 }, syncEligible: true, syncRule: "standard" },
      { id: "steps", name: "Steps", type: "count", unit: "steps", period: "day", targets: { prithvi: 6000, sowmya: 6000 }, syncEligible: true, syncRule: "if-logged" }
    ]
  };

  var today = localDate();
  var checkins = {};
  checkins[today + "/prithvi"] = { date: today, person: "prithvi", entries: { water: 5, steps: 4200 } };
  checkins[today + "/sowmya"] = { date: today, person: "sowmya", entries: { water: 8, steps: 6100 } };

  function getCheckin(dateStr, personId) {
    return checkins[dateStr + "/" + personId] || null;
  }

  return {
    pod: pod,
    habits: habits,
    getCheckin: getCheckin
  };
})();
