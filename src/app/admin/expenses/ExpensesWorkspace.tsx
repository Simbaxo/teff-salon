"use client";

import { useState } from "react";
import ExpensesDashboard from "./ExpensesDashboard";
import ExpenseManager from "./ExpenseManager";
import RecurringExpenseManager from "./RecurringExpenseManager";

export default function ExpensesWorkspace() {
  const [refreshKey, setRefreshKey] = useState(0);

  function refreshFinancials() {
    setRefreshKey((current) => current + 1);
  }

  return (
    <>
      <ExpensesDashboard refreshKey={refreshKey} />

      <ExpenseManager
        refreshKey={refreshKey}
        onFinancialChange={refreshFinancials}
      />

      <RecurringExpenseManager onFinancialChange={refreshFinancials} />
    </>
  );
}
