// models/CourseProgress.js
import mongoose, { Schema } from 'mongoose';

// Chapter Progress Schema
const chapterProgressSchema = new Schema({
  chapterId: {
    type: String,
    required: true,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
  timeSpent: {
    type: Number, // in seconds
    default: 0,
  },
  attempts: {
    type: Number,
    default: 0,
  },
});

// Section Progress Schema
const sectionProgressSchema = new Schema({
  sectionId: {
    type: String,
    required: true,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
  chapters: [chapterProgressSchema],
  quizId: {
    type: String, // matches the quizId from section
  },
  quizCompleted: {
    type: Boolean,
    default: false,
  },
  quizScore: {
    type: Number,
    min: 0,
    max: 100,
  },
  quizAttempts: {
    type: Number,
    default: 0,
  },
  quizCompletedAt: {
    type: Date,
  },
  completionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
});

// Main Course Progress Schema
const courseProgressSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
    completionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalTimeSpent: {
      type: Number, // in seconds
      default: 0,
    },
    sections: [sectionProgressSchema],
    currentSection: {
      sectionId: String,
      chapterId: String,
    },
    certificateIssued: {
      type: Boolean,
      default: false,
    },
    certificateIssuedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });
courseProgressSchema.index({ userId: 1 });
courseProgressSchema.index({ courseId: 1 });

// Instance methods
courseProgressSchema.methods.calculateCompletionPercentage = function () {
  if (!this.sections || this.sections.length === 0) return 0;

  const totalSections = this.sections.length;
  const completedSections = this.sections.filter(
    (section) => section.isCompleted
  ).length;

  return Math.round((completedSections / totalSections) * 100);
};

courseProgressSchema.methods.updateProgress = async function () {
  // Calculate section completion percentages
  this.sections.forEach((section) => {
    let totalItems = 0;
    let completedItems = 0;

    // Count chapters
    if (section.chapters && section.chapters.length > 0) {
      totalItems += section.chapters.length;
      completedItems += section.chapters.filter(
        (chapter) => chapter.isCompleted
      ).length;
    }

    // Count quiz if it exists
    if (section.quizId) {
      totalItems += 1;
      if (section.quizCompleted) {
        completedItems += 1;
      }
    }

    // Calculate section completion percentage
    section.completionPercentage =
      totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    section.isCompleted = section.completionPercentage === 100;

    if (section.isCompleted && !section.completedAt) {
      section.completedAt = new Date();
    }
  });

  // Calculate overall completion percentage
  this.completionPercentage = this.calculateCompletionPercentage();
  this.isCompleted = this.completionPercentage === 100;

  if (this.isCompleted && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Calculate total time spent
  this.totalTimeSpent = this.sections.reduce((total, section) => {
    return (
      total +
      section.chapters.reduce((sectionTotal, chapter) => {
        return sectionTotal + (chapter.timeSpent || 0);
      }, 0)
    );
  }, 0);

  this.lastAccessedAt = new Date();

  return this.save();
};

const CourseProgressModel = mongoose.model(
  'CourseProgress',
  courseProgressSchema
);

export default CourseProgressModel;
