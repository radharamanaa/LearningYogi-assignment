import { Request, Response } from "express";
import { TimetableService } from "../services/timetableService";
import { createContextLogger } from "../utils/logger";

const log = createContextLogger("TimetableController");
const timetableService = new TimetableService();

export const uploadTimetable = async (req: Request, res: Response) => {
  const requestId = `req-${Date.now()}`;
  log.info(`[${requestId}] Received upload request`);

  try {
    if (!req.file) {
      log.warn(`[${requestId}] No file uploaded in request`);
      return res.status(400).json({ error: "No file uploaded" });
    }

    log.info(
      `[${requestId}] Processing file: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`
    );

    const result = await timetableService.processUpload(req.file);

    log.info(
      `[${requestId}] Successfully processed timetable. ID: ${result._id}, Events: ${result.events.length}`
    );

    res.status(200).json(result);
  } catch (error) {
    log.error(`[${requestId}] Failed to process timetable`, error);
    res
      .status(500)
      .json({ error: "Failed to process timetable", details: error });
  }
};

export const getTimetableById = async (req: Request, res: Response) => {
  const requestId = `req-${Date.now()}`;
  const { id } = req.params;

  log.info(`[${requestId}] Fetching timetable by ID: ${id}`);

  try {
    const result = await timetableService.getById(id);

    if (!result) {
      log.warn(`[${requestId}] Timetable not found: ${id}`);
      return res.status(404).json({ error: "Timetable not found" });
    }

    log.info(
      `[${requestId}] Successfully retrieved timetable: ${id}, Events: ${result.events.length}`
    );

    res.status(200).json(result);
  } catch (error) {
    log.error(`[${requestId}] Failed to fetch timetable: ${id}`, error);
    res
      .status(500)
      .json({ error: "Failed to fetch timetable", details: error });
  }
};
