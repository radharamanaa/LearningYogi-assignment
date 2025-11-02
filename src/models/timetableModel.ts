import mongoose, { Schema, Document } from "mongoose";

export interface TimetableEvent {
  id: string;
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes?: string;
  confidence: number;
}

// Extraction result interface (plain object, not a Mongoose Document)
export interface TimetableExtractionResult {
  source: {
    filename: string;
    mimetype: string;
    size: number;
    processedAt: string;
  };
  events: TimetableEvent[];
  warnings: string[];
}

// Mongoose Document interface
export interface TimetableExtractionResultDoc
  extends Document,
    TimetableExtractionResult {}

const TimetableEventSchema = new Schema<TimetableEvent>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  day: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  notes: { type: String },
  confidence: { type: Number, required: true },
});

const TimetableExtractionResultSchema =
  new Schema<TimetableExtractionResultDoc>({
    source: {
      filename: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
      processedAt: { type: String, required: true },
    },
    events: [TimetableEventSchema],
    warnings: [String],
  });

export const TimetableModel = mongoose.model<TimetableExtractionResultDoc>(
  "Timetable",
  TimetableExtractionResultSchema
);
