import { pool } from '../config/db.js';

export interface ExpenseData {
  id?: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  payment_method?: string;
  vendor?: string;
  notes?: string;
  receipt_url?: string;
  created_by?: string;
}

export async function getExpenses(filters: {
  startDate?: string;
  endDate?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    let queryStr = `SELECT * FROM expenses`;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (filters.startDate) {
      params.push(filters.startDate);
      whereClauses.push(`expense_date >= $${params.length}::date`);
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      whereClauses.push(`expense_date <= $${params.length}::date`);
    }

    if (filters.category && filters.category !== 'all') {
      params.push(filters.category);
      whereClauses.push(`category = $${params.length}`);
    }

    if (filters.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(title) LIKE $${params.length} OR LOWER(vendor) LIKE $${params.length} OR LOWER(notes) LIKE $${params.length})`);
    }

    if (whereClauses.length > 0) {
      queryStr += ` WHERE ` + whereClauses.join(' AND ');
    }

    queryStr += ` ORDER BY expense_date DESC, created_at DESC`;

    if (filters.limit) {
      params.push(filters.limit);
      queryStr += ` LIMIT $${params.length}`;
    }

    if (filters.offset) {
      params.push(filters.offset);
      queryStr += ` OFFSET $${params.length}`;
    }

    const result = await pool.query(queryStr, params);
    return result.rows;
  } catch (err: any) {
    console.error('Error in getExpenses:', err.message);
    return [];
  }
}

export async function getExpenseById(id: string) {
  const result = await pool.query('SELECT * FROM expenses WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createExpense(data: ExpenseData) {
  const id = data.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const expenseDate = data.expense_date || new Date().toISOString().split('T')[0];
  const category = data.category || 'operasional';
  const amount = Number(data.amount) || 0;
  const paymentMethod = data.payment_method || 'cash';
  const vendor = data.vendor || '';
  const notes = data.notes || '';
  const receiptUrl = data.receipt_url || '';
  const createdBy = data.created_by || 'owner';

  const result = await pool.query(`
    INSERT INTO expenses (
      id, title, category, amount, expense_date, payment_method, vendor, notes, receipt_url, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [id, data.title, category, amount, expenseDate, paymentMethod, vendor, notes, receiptUrl, createdBy]);

  return result.rows[0];
}

export async function updateExpense(id: string, data: Partial<ExpenseData>) {
  const fields: string[] = [];
  const params: any[] = [id];

  if (data.title !== undefined) {
    params.push(data.title);
    fields.push(`title = $${params.length}`);
  }
  if (data.category !== undefined) {
    params.push(data.category);
    fields.push(`category = $${params.length}`);
  }
  if (data.amount !== undefined) {
    params.push(Number(data.amount) || 0);
    fields.push(`amount = $${params.length}`);
  }
  if (data.expense_date !== undefined) {
    params.push(data.expense_date);
    fields.push(`expense_date = $${params.length}::date`);
  }
  if (data.payment_method !== undefined) {
    params.push(data.payment_method);
    fields.push(`payment_method = $${params.length}`);
  }
  if (data.vendor !== undefined) {
    params.push(data.vendor);
    fields.push(`vendor = $${params.length}`);
  }
  if (data.notes !== undefined) {
    params.push(data.notes);
    fields.push(`notes = $${params.length}`);
  }
  if (data.receipt_url !== undefined) {
    params.push(data.receipt_url);
    fields.push(`receipt_url = $${params.length}`);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const queryStr = `
    UPDATE expenses
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query(queryStr, params);
  return result.rows[0] || null;
}

export async function deleteExpense(id: string) {
  const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
  return result.rowCount ? result.rowCount > 0 : false;
}

export async function getFinancialProfitLossSummary(startDate?: string, endDate?: string) {
  try {
    // 1. Total Income from paid invoices
    const incomeParams: any[] = [];
    let incomeWhere = `WHERE status = 'paid'`;

    if (startDate) {
      incomeParams.push(startDate);
      incomeWhere += ` AND issue_date >= $${incomeParams.length}::date`;
    }
    if (endDate) {
      incomeParams.push(endDate);
      incomeWhere += ` AND issue_date <= $${incomeParams.length}::date`;
    }

    const incomeRes = await pool.query(`
      SELECT 
        COALESCE(SUM(total), 0)::numeric as total_income,
        COUNT(*)::int as paid_invoices_count
      FROM invoices
      ${incomeWhere}
    `, incomeParams);

    const totalIncome = Number(incomeRes.rows[0]?.total_income || 0);
    const paidInvoicesCount = Number(incomeRes.rows[0]?.paid_invoices_count || 0);

    // 2. Total Expense
    const expenseParams: any[] = [];
    let expenseWhere = ``;

    if (startDate) {
      expenseParams.push(startDate);
      expenseWhere += (expenseWhere ? ' AND ' : 'WHERE ') + `expense_date >= $${expenseParams.length}::date`;
    }
    if (endDate) {
      expenseParams.push(endDate);
      expenseWhere += (expenseWhere ? ' AND ' : 'WHERE ') + `expense_date <= $${expenseParams.length}::date`;
    }

    const expenseRes = await pool.query(`
      SELECT 
        COALESCE(SUM(amount), 0)::numeric as total_expense,
        COUNT(*)::int as expenses_count
      FROM expenses
      ${expenseWhere}
    `, expenseParams);

    const totalExpense = Number(expenseRes.rows[0]?.total_expense || 0);
    const expensesCount = Number(expenseRes.rows[0]?.expenses_count || 0);

    // 3. Category Breakdown
    const catRes = await pool.query(`
      SELECT 
        category,
        COALESCE(SUM(amount), 0)::numeric as amount,
        COUNT(*)::int as count
      FROM expenses
      ${expenseWhere}
      GROUP BY category
      ORDER BY amount DESC
    `, expenseParams);

    const categoryBreakdown = catRes.rows.map(row => ({
      category: row.category,
      amount: Number(row.amount || 0),
      count: Number(row.count || 0),
      percentage: totalExpense > 0 ? Math.round((Number(row.amount || 0) / totalExpense) * 100) : 0
    }));

    // 4. Monthly Trend (last 6 - 12 months)
    const monthlyIncomeRes = await pool.query(`
      SELECT 
        TO_CHAR(issue_date, 'YYYY-MM') as month,
        COALESCE(SUM(total), 0)::numeric as income
      FROM invoices
      WHERE status = 'paid' 
        AND issue_date >= (CURRENT_DATE - INTERVAL '11 months')::date
      GROUP BY TO_CHAR(issue_date, 'YYYY-MM')
      ORDER BY month ASC
    `);

    const monthlyExpenseRes = await pool.query(`
      SELECT 
        TO_CHAR(expense_date, 'YYYY-MM') as month,
        COALESCE(SUM(amount), 0)::numeric as expense
      FROM expenses
      WHERE expense_date >= (CURRENT_DATE - INTERVAL '11 months')::date
      GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
      ORDER BY month ASC
    `);

    // Build rolling 6 months list
    const monthMap = new Map<string, { income: number; expense: number }>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, { income: 0, expense: 0 });
    }

    monthlyIncomeRes.rows.forEach(r => {
      if (monthMap.has(r.month)) {
        monthMap.get(r.month)!.income = Number(r.income || 0);
      }
    });

    monthlyExpenseRes.rows.forEach(r => {
      if (monthMap.has(r.month)) {
        monthMap.get(r.month)!.expense = Number(r.expense || 0);
      }
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthlyTrend = Array.from(monthMap.entries()).map(([month, val]) => {
      const [year, mStr] = month.split('-');
      const label = `${monthNames[parseInt(mStr, 10) - 1]} ${year}`;
      const profit = val.income - val.expense;
      return {
        month,
        label,
        income: val.income,
        expense: val.expense,
        profit
      };
    });

    const netProfit = totalIncome - totalExpense;
    const profitMargin = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : 0;

    return {
      totalIncome,
      totalExpense,
      netProfit,
      profitMargin,
      paidInvoicesCount,
      expensesCount,
      categoryBreakdown,
      monthlyTrend
    };
  } catch (err: any) {
    console.error('Error in getFinancialProfitLossSummary:', err.message);
    return {
      totalIncome: 0,
      totalExpense: 0,
      netProfit: 0,
      profitMargin: 0,
      paidInvoicesCount: 0,
      expensesCount: 0,
      categoryBreakdown: [],
      monthlyTrend: []
    };
  }
}

