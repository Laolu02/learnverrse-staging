import mongoose, { Schema } from 'mongoose';
import { CourseLevelEnum } from '../../../enums/course-level.enum.js';
import { CourseStatusEnums } from '../../../enums/course-status.enum.js';
import { CourseSubscriptionEnum } from '../../../enums/course-subscription.enum.js';
import { ChapterTypeEnum } from '../../../enums/chapter-type.enum.js';

// Chapter Schema
const chapterSchema = new Schema({
  chapterId: { type: String, required: true },
  type: {
    type: String,
    enum: Object.values(ChapterTypeEnum),
    required: true,
  },
  title: { type: String },
  content: { type: String },
  video: { type: String }, 
  duration: { type: Number }, // duration in minutes for videos
});

// Section Schema
const sectionSchema = new Schema({
  sectionId: { type: String, required: true },
  sectionTitle: { type: String },
  sectionDescription: { type: String },
  chapters: [chapterSchema],
  quizId: { type: String },
});

const courseSchema = new mongoose.Schema(
  {
    educatorId: {
      type: String,
      required: true,
      trim: true,
    },
    educatorName: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
    },
    price: {
      type: Number,
      required: true,
      trim: true,
    },
    image: {
      type: String,
    },
    level: {
      type: String,
      required: true,
      enum: Object.values(CourseLevelEnum),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(CourseStatusEnums),
      default: 'DRAFT',
      required: true,
    },
    subscription: {
      type: String,
      enum: Object.values(CourseSubscriptionEnum),
      required: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
      required: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    sections: [sectionSchema],
    // New fields for rating and duration
    totalDuration: {
      type: Number, // total course duration in minutes
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    ratingBreakdown: {
      fiveStar: { type: Number, default: 0 },
      fourStar: { type: Number, default: 0 },
      threeStar: { type: Number, default: 0 },
      twoStar: { type: Number, default: 0 },
      oneStar: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Method to calculate total duration
courseSchema.methods.calculateTotalDuration = function () {
  let totalDuration = 0;

  this.sections.forEach((section) => {
    section.chapters.forEach((chapter) => {
      if (chapter.duration) {
        totalDuration += chapter.duration;
      }
    });
  });

  this.totalDuration = totalDuration;
  return totalDuration;
};

// Method to update rating statistics
courseSchema.methods.updateRatingStats = async function () {
  const ReviewModel = mongoose.model('Review');

  const ratingStats = await ReviewModel.aggregate([
    { $match: { courseId: this._id } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
        totalReviews: { $sum: { $cond: [{ $ne: ['$review', ''] }, 1, 0] } },
        ratings: { $push: '$rating' },
      },
    },
  ]);

  if (ratingStats.length > 0) {
    const stats = ratingStats[0];

    // Calculate rating breakdown
    const breakdown = {
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0,
    };

    stats.ratings.forEach((rating) => {
      if (rating === 5) breakdown.fiveStar++;
      else if (rating === 4) breakdown.fourStar++;
      else if (rating === 3) breakdown.threeStar++;
      else if (rating === 2) breakdown.twoStar++;
      else if (rating === 1) breakdown.oneStar++;
    });

    this.averageRating = Math.round(stats.averageRating * 10) / 10; // Round to 1 decimal
    this.totalRatings = stats.totalRatings;
    this.totalReviews = stats.totalReviews;
    this.ratingBreakdown = breakdown;
  } else {
    this.averageRating = 0;
    this.totalRatings = 0;
    this.totalReviews = 0;
    this.ratingBreakdown = {
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0,
    };
  }

  return this.save();
};

const CourseModel = mongoose.model('Course', courseSchema);
export default CourseModel;
