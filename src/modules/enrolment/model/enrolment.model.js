import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    enrolledAt: Date,
    paymentStatus: String,
    accessGranted: Boolean,
  },
  { timestamps: true }
);

const EnrollmentModel = mongoose.model('Enrolment', enrollmentSchema);
export default EnrollmentModel;
