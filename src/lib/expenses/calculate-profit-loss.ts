export type ProfitLossInput = {
  salesRevenue: number;
  technicianCommissions: number;
  fixedSalaries: number;
  payrollBonuses: number;
  approvedExpenses: number;
};

export type ProfitLossResult = {
  revenue: number;
  laborCosts: number;
  operatingExpenses: number;
  totalExpenses: number;
  estimatedProfit: number;
  profitMargin: number;
};

export function calculateProfitLoss(input: ProfitLossInput): ProfitLossResult {
  const revenue = input.salesRevenue;

  const laborCosts =
    input.technicianCommissions + input.fixedSalaries + input.payrollBonuses;

  const operatingExpenses = input.approvedExpenses;
  const totalExpenses = laborCosts + operatingExpenses;
  const estimatedProfit = revenue - totalExpenses;

  const profitMargin =
    revenue > 0 ? Math.round((estimatedProfit / revenue) * 10000) / 100 : 0;

  return {
    revenue,
    laborCosts,
    operatingExpenses,
    totalExpenses,
    estimatedProfit,
    profitMargin,
  };
}
