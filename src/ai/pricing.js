const MINECRAFT_PLANS = [
  { id: "HXC-S02", ramGb: 2, cpuPower: "100%", diskGb: 20, baseMonthly: 0.69 },
  { id: "HXC-S04", ramGb: 4, cpuPower: "200%", diskGb: 40, baseMonthly: 1.19 },
  { id: "HXC-S06", ramGb: 6, cpuPower: "200%", diskGb: 50, baseMonthly: 1.59 },
  { id: "HXC-S08", ramGb: 8, cpuPower: "300%", diskGb: 80, baseMonthly: 2.19 },
  { id: "HXC-S12", ramGb: 12, cpuPower: "400%", diskGb: 120, baseMonthly: 3.19 },
  { id: "HXC-S16", ramGb: 16, cpuPower: "500%", diskGb: 160, baseMonthly: 4.19 },
  { id: "HXC-S24", ramGb: 24, cpuPower: "600%", diskGb: 240, baseMonthly: 5.99 },
  { id: "HXC-S32", ramGb: 32, cpuPower: "800%", diskGb: 320, baseMonthly: 7.99 },
  { id: "HXC-S48", ramGb: 48, cpuPower: "1000%", diskGb: 480, baseMonthly: 11.99 },
  { id: "HXC-S64", ramGb: 64, cpuPower: "1200%", diskGb: 640, baseMonthly: 14.99 },
];

const PROCESSORS = [
  { name: "Ryzen 5", feeMonthly: 1.30 },
  { name: "Ryzen 7", feeMonthly: 2.40 },
  { name: "Xeon Gold", feeMonthly: 2.90 },
  { name: "AMD EPYC 9965", feeMonthly: 3.40 },
];

const money = (value) => Number(value.toFixed(2));

export function getMinecraftPricing({ plan_id, processor } = {}) {
  const requestedPlan = String(plan_id || "").trim().toUpperCase();
  const requestedProcessor = String(processor || "").trim().toLowerCase();
  const plans = requestedPlan
    ? MINECRAFT_PLANS.filter((plan) => plan.id === requestedPlan)
    : MINECRAFT_PLANS;

  if (requestedPlan && plans.length === 0) {
    throw new Error("Unknown Minecraft plan ID. Use one of HXC-S02, HXC-S04, HXC-S06, HXC-S08, HXC-S12, HXC-S16, HXC-S24, HXC-S32, HXC-S48, or HXC-S64.");
  }

  const selectedProcessor = requestedProcessor
    ? PROCESSORS.find((item) => item.name.toLowerCase() === requestedProcessor)
    : null;
  if (requestedProcessor && !selectedProcessor) {
    throw new Error("Unknown processor tier. Choose Ryzen 5, Ryzen 7, Xeon Gold, or AMD EPYC 9965.");
  }

  return {
    source: "HelzerX published Minecraft pricing snapshot",
    liveVerified: false,
    note: "This is a deterministic price calculation, not live confirmation. Use read_helzerx_website to verify current published prices and availability before promising a price.",
    formula: "monthly total = RAM plan base price + selected processor fee",
    plans: plans.map((plan) => ({
      ...plan,
      currency: "USD",
      billingPeriod: "month",
      ...(selectedProcessor
        ? {
            processor: selectedProcessor.name,
            processorFeeMonthly: selectedProcessor.feeMonthly,
            totalMonthly: money(plan.baseMonthly + selectedProcessor.feeMonthly),
          }
        : {
            processorOptions: PROCESSORS.map((item) => ({
              name: item.name,
              feeMonthly: item.feeMonthly,
              totalMonthly: money(plan.baseMonthly + item.feeMonthly),
            })),
          }),
    })),
  };
}
