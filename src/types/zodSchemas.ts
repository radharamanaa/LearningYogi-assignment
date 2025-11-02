import { z } from "zod";

export const TimetableEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
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
  events: z.array(TimetableEventSchema),
  warnings: z.array(z.string()).optional(),
});

export type TimetableEvent = z.infer<typeof TimetableEventSchema>;
export type TimetableExtractionResult = z.infer<
  typeof TimetableExtractionResultSchema
>;
