import { HTTPSTATUS } from "../../../configs/http.config";
import AsyncHandler from "../../../middlewares/asyncHandler";
import { assessQuizService } from "../services/assess.quiz";

export const assessQuiz = AsyncHandler(async (req, res) => {
  const chapterId = req.params;
  const { userAnswers } = req.body;
  const userId = req.user.userId;
  const response = await assessQuizService({ chapterId, userAnswers, userId });
  res.status(HTTPSTATUS.OK).json({
    success: true,
    message: "Quiz submitted successfully!",
    result: response,
  });
});
