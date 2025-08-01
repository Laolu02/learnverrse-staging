import mongoose, { Schema } from "mongoose";

const selectedOptionSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    isCorrectAttempt: {
      type: Boolean,
      required: true,
    },
  },
  { _id: false }
);

const questionAttemptSchema = new Schema(
  {
    questionId: {
      type: String,
      required: true,
    },
    questionText: {
      // Gotten from from Quiz
      type: String,
      required: true,
    },
    selectedOption: {
      type: selectedOptionSchema,
      required: true,
    },
    correctOptionId: {
      type: String,
    },
    isCorrect: {
      type: Boolean,
      required: true,
    },
    explanation: {
      type: String,
    },
  },
  { _id: false }
);

// Main Assessment Schema
const assessmentSchema = new Schema(
  {
    userId: {
      type: string,
      required: true,
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    courseId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    sectionId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    chapterId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    quizTitle: {
      type: String,
      required: true,
      trim: true,
    },
    score: {
      type: Number,
      required: true,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    percentageScore: {
      type: Number,
      required: true,
    },
    passed: {
      type: Boolean,
      required: true,
    },
    questionsAttempted: [questionAttemptSchema],
    attemptDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const AssessmentModel = mongoose.model("Assessment", assessmentSchema);

export default AssessmentModel;
