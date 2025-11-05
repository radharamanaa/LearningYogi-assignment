import { TimetableModel } from "../models/timetableModel";
import { FileUpload } from "../types/FileUpload";
import { processFile } from "../utils/fileProcessor";
import { createContextLogger } from "../utils/logger";

const log = createContextLogger("TimetableService");

export class TimetableService {
  async processUpload(file: FileUpload) {
    log.info(`Starting upload processing for file: ${file.originalname}`);

    // Process file (PDF/image) and extract events
    log.debug(`Calling file processor for: ${file.originalname}`);
    const extractionResult = await processFile(file);

    log.info(
      `File processing complete. Events extracted: ${
        extractionResult.events.length
      }, Warnings: ${extractionResult.warnings?.length || 0}`
    );

    // Save to DB
    log.debug(`Saving extraction result to MongoDB`);
    const savedDocument = await TimetableModel.create(extractionResult);

    log.info(`Timetable saved to database with ID: ${savedDocument._id}`);

    return savedDocument;
  }

  async getById(id: string) {
    log.info(`Retrieving timetable from database. ID: ${id}`);

    const result = await TimetableModel.findById(id);

    if (result) {
      log.debug(`Timetable found: ${id}, Events: ${result.events.length}`);
    } else {
      log.warn(`Timetable not found in database: ${id}`);
    }

    return result;
  }
}
