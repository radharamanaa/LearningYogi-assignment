import { Request, Response } from "express";
import { TimetableService } from "../services/timetableService";

const timetableService = new TimetableService();

export const uploadTimetable = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const result = await timetableService.processUpload(req.file);
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to process timetable", details: error });
  }
};

export const getTimetableById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await timetableService.getById(id);
    if (!result) {
      return res.status(404).json({ error: "Timetable not found" });
    }
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch timetable", details: error });
  }
};
