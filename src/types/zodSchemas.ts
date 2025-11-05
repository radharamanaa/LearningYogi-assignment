import { z } from "zod";

// Timetable metadata from header (school, class, teacher, etc.)
export const TimetableMetadataSchema = z.object({
  schoolName: z.string().optional(),
  className: z.string().optional(),
  term: z.string().optional(),
  teacherName: z.string().optional(),
  academicYear: z.string().optional(),
});

export const TimetableEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  day: z.string().optional(),
  startTime: z
    .string()
    .regex(
      /^\d{2}:\d{2}(:\d{2})?$/,
      "startTime must be in HH:MM or HH:MM:SS format"
    ),
  endTime: z
    .string()
    .regex(
      /^\d{2}:\d{2}(:\d{2})?$/,
      "endTime must be in HH:MM or HH:MM:SS format"
    ),
  location: z.string().optional(),
  description: z.string().optional(),
  metadata: z.string().optional(), // For bracketed information like "(practical or TTRS)"
  subject: z.string().optional(),
  additionalInfo: z.string().optional(),
});

export const TimetableExtractionResultSchema = z.object({
  source: z
    .object({
      filename: z.string(),
      mimetype: z.string(),
      size: z.number(),
      processedAt: z
        .string()
        .datetime({ message: "processedAt must be ISO 8601 datetime" }),
    })
    .optional(),
  metadata: TimetableMetadataSchema.optional(),
  events: z.array(TimetableEventSchema),
  warnings: z.array(z.string()).optional(),
});

export type TimetableMetadata = z.infer<typeof TimetableMetadataSchema>;
export type TimetableEvent = z.infer<typeof TimetableEventSchema>;
export type TimetableExtractionResult = z.infer<
  typeof TimetableExtractionResultSchema
>;
