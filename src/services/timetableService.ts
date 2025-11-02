import {TimetableModel} from "../models/timetableModel";
import {FileUpload} from "../types/FileUpload";
import {processFile} from "../utils/fileProcessor";

export class TimetableService {
  async processUpload(file: FileUpload) {
    // Process file (PDF/image) and extract events
    const extractionResult = await processFile(file);
    // return extractionResult;
    // Save to DB
      return await TimetableModel.create(extractionResult);
  }

  async getById(id: string) {
    return TimetableModel.findById(id);
  }
}
