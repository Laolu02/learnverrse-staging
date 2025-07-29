import mongoose, { Schema } from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userAvatar: {
      type: String,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
    helpfulVotes: {
      type: Number,
      default: 0,
    },
    reportedBy: [
      {
        userId: String,
        reason: String,
        reportedAt: { type: Date, default: Date.now },
      },
    ],
    isHidden: {
      type: Boolean,
      default: false,
    },
    educatorResponse: {
      response: String,
      respondedAt: Date,
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate reviews
reviewSchema.index({ userId: 1, courseId: 1 }, { unique: true });
reviewSchema.index({ courseId: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });

const ReviewModel = mongoose.model('Review', reviewSchema);

export default ReviewModel;
