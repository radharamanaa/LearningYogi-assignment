import { Router } from "express";
import {
  uploadTimetable,
  getTimetableById,
} from "../controllers/timetableController";
import multer from "multer";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post("/upload", upload.single("file"), uploadTimetable);
router.get("/:id", getTimetableById);

export default router;
