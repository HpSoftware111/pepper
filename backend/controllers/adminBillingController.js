import Invoice from '../models/Invoice.js';

const dollars = (cents = 0) => Number((cents / 100).toFixed(2));

export async function getBillingSummary(req, res) {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 5);

    const monthlyAgg = await Invoice.aggregate([
      {
        $match: {
          dueDate: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$dueDate' }, month: { $month: '$dueDate' } },
          arrCents: { $sum: '$amountCents' },
          paidCents: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$amountCents', 0],
            },
          },
          overdueCents: {
            $sum: {
              $cond: [{ $eq: ['$status', 'overdue'] }, '$amountCents', 0],
            },
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthly = monthlyAgg.map((entry) => {
      const date = new Date(entry._id.year, entry._id.month - 1);
      return {
        month: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
        arr: dollars(entry.arrCents),
        paid: dollars(entry.paidCents),
        overdue: dollars(entry.overdueCents),
      };
    });

    const totalsAgg = await Invoice.aggregate([
      {
        $group: {
          _id: null,
          arrCents: { $sum: '$amountCents' },
          paidCents: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$amountCents', 0],
            },
          },
          overdueCents: {
            $sum: {
              $cond: [{ $eq: ['$status', 'overdue'] }, '$amountCents', 0],
            },
          },
        },
      },
    ]);

    const totals = totalsAgg.length
      ? {
          arr: dollars(totalsAgg[0].arrCents),
          paid: dollars(totalsAgg[0].paidCents),
          overdue: dollars(totalsAgg[0].overdueCents),
        }
      : { arr: 0, paid: 0, overdue: 0 };

    const recentInvoices = await Invoice.find().sort({ dueDate: -1 }).limit(6);

    return res.json({
      monthly,
      totals,
      recentInvoices: recentInvoices.map((invoice) => ({
        id: invoice._id.toString(),
        orgName: invoice.orgName || invoice.customerName || 'Workspace',
        plan: invoice.plan || invoice.planName || 'Custom',
        amount: dollars(invoice.amountCents ?? invoice.amount ?? 0),
        status: invoice.status,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        paymentMethod: invoice.paymentMethod || 'Card',
      })),
    });
  } catch (error) {
    console.error('[admin][billing][summary] error', error);
    return res.status(500).json({ error: 'Unable to load billing summary' });
  }
}

