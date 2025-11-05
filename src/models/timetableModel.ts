import mongoose, { Schema, Document } from "mongoose";

export interface TimetableMetadata {
  schoolName?: string;
  className?: string;
  term?: string;
  teacherName?: string;
  academicYear?: string;
}

export interface TimetableEvent {
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  location?: string;
  notes?: string;
  metadata?: string; // For bracketed information
  subject?: string;
  additionalInfo?: string;
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
  metadata?: TimetableMetadata;
  events: TimetableEvent[];
  warnings: string[];
}

// Mongoose Document interface
export interface TimetableExtractionResultDoc
  extends Document,
    TimetableExtractionResult {}

const TimetableMetadataSchema = new Schema<TimetableMetadata>(
  {
    schoolName: { type: String },
    className: { type: String },
    term: { type: String },
    teacherName: { type: String },
    academicYear: { type: String },
  },
  { _id: false }
);

const TimetableEventSchema = new Schema<TimetableEvent>(
  {
    name: { type: String, required: true },
    day: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    location: { type: String },
    notes: { type: String },
    metadata: { type: String },
    subject: { type: String },
    additionalInfo: { type: String },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const TimetableExtractionResultSchema =
  new Schema<TimetableExtractionResultDoc>({
    source: {
      filename: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: String, required: true },
      processedAt: { type: String, required: true },
    },
    metadata: { type: TimetableMetadataSchema },
    events: [TimetableEventSchema],
    warnings: [String],
  });

export const TimetableModel = mongoose.model<TimetableExtractionResultDoc>(
  "Timetable",
  TimetableExtractionResultSchema
);
