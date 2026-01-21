import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    orgName: { type: String, required: true },
    plan: { type: String },
    amountCents: { type: Number, required: true },
    status: { type: String, enum: ['paid', 'pending', 'overdue'], default: 'pending', index: true },
    paymentMethod: { type: String },
    dueDate: { type: Date, required: true, index: true },
    paidAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

const Invoice = mongoose.model('Invoice', invoiceSchema, 'invoices');
export default Invoice;

