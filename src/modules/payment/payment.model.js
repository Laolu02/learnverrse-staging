import mongoose, { Schema } from 'mongoose';

const PaymentStatusEnum = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
};

const coursePaymentSchema = new Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    educator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    platformFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    educatorEarnings: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      default: 'NGN',
      uppercase: true,
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true, // allows null values but enforces uniqueness when present
    },
    transactionReference: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      default: 'Paystack',
      enum: ['Paystack', 'Stripe', 'Flutterwave'],
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatusEnum),
      default: PaymentStatusEnum.PENDING,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'bank_transfer', 'ussd', 'qr', 'mobile_money'],
    },
    paidAt: {
      type: Date,
    },
    failureReason: {
      type: String,
    },
    refundReason: {
      type: String,
    },
    refundedAt: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // For installment payments (future feature)
    installmentPlan: {
      isInstallment: {
        type: Boolean,
        default: false,
      },
      totalInstallments: {
        type: Number,
        default: 1,
      },
      currentInstallment: {
        type: Number,
        default: 1,
      },
      installmentAmount: {
        type: Number,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
// coursePaymentSchema.index({ student: 1, status: 1 });
// coursePaymentSchema.index({ educator: 1, status: 1 });
// coursePaymentSchema.index({ course: 1 });
// coursePaymentSchema.index({ transactionReference: 1 });
// coursePaymentSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate platform fee and educator earnings
coursePaymentSchema.pre('save', function (next) {
  if (this.isNew) {
    // Calculate platform fee (5% of course price)
    this.platformFee = Math.round(this.amount * 0.05);
    this.educatorEarnings = this.amount - this.platformFee;

    // Set installment amount if it's an installment payment
    if (
      this.installmentPlan.isInstallment &&
      this.installmentPlan.totalInstallments > 1
    ) {
      this.installmentPlan.installmentAmount = Math.round(
        this.amount / this.installmentPlan.totalInstallments
      );
    }
  }
  next();
});

// Instance method to update payment status
coursePaymentSchema.methods.updateStatus = async function (
  newStatus,
  session = null
) {
  this.status = newStatus;

  if (newStatus === PaymentStatusEnum.SUCCESS) {
    this.paidAt = new Date();
  } else if (newStatus === PaymentStatusEnum.REFUNDED) {
    this.refundedAt = new Date();
  }

  return await this.save({ session });
};

// Instance method to check if payment is successful
coursePaymentSchema.methods.isSuccessful = function () {
  return this.status === PaymentStatusEnum.SUCCESS;
};

// Instance method to check if payment can be refunded
coursePaymentSchema.methods.canBeRefunded = function () {
  return this.status === PaymentStatusEnum.SUCCESS && !this.refundedAt;
};

// Static method to get payment statistics for educator
coursePaymentSchema.statics.getEducatorStats = async function (
  educatorId,
  startDate,
  endDate
) {
  const matchStage = {
    educator: new mongoose.Types.ObjectId(educatorId),
    status: PaymentStatusEnum.SUCCESS,
  };

  if (startDate && endDate) {
    matchStage.paidAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$educatorEarnings' },
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: '$amount' },
        averageSaleAmount: { $avg: '$amount' },
      },
    },
  ]);

  return (
    stats[0] || {
      totalEarnings: 0,
      totalSales: 0,
      totalRevenue: 0,
      averageSaleAmount: 0,
    }
  );
};

// Static method to get platform statistics
coursePaymentSchema.statics.getPlatformStats = async function (
  startDate,
  endDate
) {
  const matchStage = {
    status: PaymentStatusEnum.SUCCESS,
  };

  if (startDate && endDate) {
    matchStage.paidAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalPlatformFees: { $sum: '$platformFee' },
        totalTransactions: { $sum: 1 },
        totalRevenue: { $sum: '$amount' },
        totalEducatorEarnings: { $sum: '$educatorEarnings' },
      },
    },
  ]);

  return (
    stats[0] || {
      totalPlatformFees: 0,
      totalTransactions: 0,
      totalRevenue: 0,
      totalEducatorEarnings: 0,
    }
  );
};

const CoursePayment = mongoose.model('CoursePayment', coursePaymentSchema);
export default CoursePayment;
