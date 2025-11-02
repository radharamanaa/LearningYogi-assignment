import { FileUpload } from "../types/FileUpload";
import {
  TimetableExtractionResultSchema,
  TimetableExtractionResult,
} from "../types/zodSchemas";

// NOTE: If you see errors about 'Buffer' or 'process', install @types/node as a dev dependency.

// Dynamic import for Anthropic Claude SDK
const getAnthropic = async () => {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
};

const getSharp = async () => {
  return await import("sharp");
};

function isPdf(file: FileUpload): boolean {
  return (
    file.mimetype === "application/pdf" ||
    file.originalname.toLowerCase().endsWith(".pdf")
  );
}
async function processPdf(
  file: FileUpload
): Promise<TimetableExtractionResult> {
  // Extract text from PDF and send to Claude
  let warnings: string[] = [];
  try {
    // Use pdf-parse to extract text from PDF
    const pdfParse = require("pdf-parse");

    const pdfData = file.buffer
      ? file.buffer
      : await (await import("fs")).promises.readFile(file.path);

    const pdfContent = await pdfParse(pdfData);
    const extractedText = pdfContent.text;

    // Send the extracted text to Claude
    const anthropic = await getAnthropic();

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a helpful assistant. 
              You are perfect at scanning all kinds of timetables belonging to classes of students. 
              Extract all timetable events from this PDF text and return ONLY a valid JSON object with the following structure: { "events": [{ "title": string, "startTime": string (ISO 8601), "endTime": string (ISO 8601), "location": string (optional), "description": string (optional) }] }. 
              Do not include any markdown formatting or explanation, just the JSON object.
              
              PDF Text:
              ${extractedText}`,
            },
          ],
        },
      ],
    });

    // Extract text from Claude response
    const textContent = response.content.find(
      (block: any) => block.type === "text"
    );
    const text = textContent && "text" in textContent ? textContent.text : "";

    // Remove markdown code blocks and clean the response
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const rawData = JSON.parse(jsonMatch[0]);

        // Extract day of week and time from datetime strings BEFORE schema validation
        if (rawData.events && Array.isArray(rawData.events)) {
          rawData.events = rawData.events.map((event: any) => {
            let day = "Monday"; // default
            let startTime = event.startTime;
            let endTime = event.endTime;

            // Extract day from ISO date if present
            if (event.startTime.includes("T")) {
              const dateStr = event.startTime.split("T")[0];
              const date = new Date(dateStr);
              const days = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ];
              day = days[date.getDay()];
              startTime = event.startTime.split("T")[1];
              endTime = event.endTime.split("T")[1];
            }

            return {
              ...event,
              day,
              startTime,
              endTime,
            };
          });
        }

        const parsed = TimetableExtractionResultSchema.parse(rawData);

        // Transform events to match Mongoose model schema
        const transformedEvents = parsed.events.map(
          (event: any, index: number) => {
            const [startHour, startMin] = event.startTime
              .split(":")
              .map(Number);
            const [endHour, endMin] = event.endTime.split(":").map(Number);
            const durationMinutes =
              endHour * 60 + endMin - (startHour * 60 + startMin);

            return {
              id: `${Date.now()}-${index}`,
              name: event.title,
              day: event.day || "Monday",
              startTime: event.startTime,
              endTime: event.endTime,
              durationMinutes,
              notes: event.description || event.location || undefined,
              confidence: 0.85, // Default confidence score
            };
          }
        );

        const result = {
          source: {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            processedAt: new Date().toISOString(),
          },
          events: transformedEvents,
          warnings: warnings.concat(["Processed PDF with Claude."]),
        };

        return result as any;
      } catch (e) {
        warnings.push(
          "Claude returned invalid JSON or schema: " + (e as Error).message
        );
      }
    } else {
      warnings.push("Claude did not return a valid JSON extraction.");
    }
  } catch (err) {
    warnings.push("Claude PDF processing failed: " + (err as Error).message);
  }
  // If all else fails, return stub result
  const result = {
    source: {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      processedAt: new Date().toISOString(),
    },
    events: [],
    warnings,
  };
  return result as any;
}

async function processImage(
  file: FileUpload
): Promise<TimetableExtractionResult> {
  let warnings: string[] = [];
  try {
    // Optimize image with sharp
    const sharp = await getSharp();
    const optimizedBuffer = await sharp
      .default(
        file.buffer || (await (await import("fs")).promises.readFile(file.path))
      )
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    // Send image to Claude
    const anthropic = await getAnthropic();
    const base64Image = optimizedBuffer.toString("base64");

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: 'You are a helpful assistant. You are perfect at scanning all kinds of timetables. Extract all timetable events from this image and return ONLY a valid JSON object with the following structure: { "events": [{ "title": string, "startTime": string (ISO 8601), "endTime": string (ISO 8601), "location": string (optional), "description": string (optional) }] }. Do not include any markdown formatting or explanation, just the JSON object.',
            },
          ],
        },
      ],
    });

    // Extract text from Claude response
    const textContent = response.content.find(
      (block: any) => block.type === "text"
    );
    const text = textContent && "text" in textContent ? textContent.text : "";

    // Remove markdown code blocks and clean the response
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const rawData = JSON.parse(jsonMatch[0]);

        // Extract day of week and time from datetime strings BEFORE schema validation
        if (rawData.events && Array.isArray(rawData.events)) {
          rawData.events = rawData.events.map((event: any) => {
            let day = "Monday"; // default
            let startTime = event.startTime;
            let endTime = event.endTime;

            // Extract day from ISO date if present
            if (event.startTime.includes("T")) {
              const dateStr = event.startTime.split("T")[0];
              const date = new Date(dateStr);
              const days = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ];
              day = days[date.getDay()];
              startTime = event.startTime.split("T")[1];
              endTime = event.endTime.split("T")[1];
            }

            return {
              ...event,
              day,
              startTime,
              endTime,
            };
          });
        }

        const parsed = TimetableExtractionResultSchema.parse(rawData);

        // Transform events to match Mongoose model schema
        const transformedEvents = parsed.events.map(
          (event: any, index: number) => {
            const [startHour, startMin] = event.startTime
              .split(":")
              .map(Number);
            const [endHour, endMin] = event.endTime.split(":").map(Number);
            const durationMinutes =
              endHour * 60 + endMin - (startHour * 60 + startMin);

            return {
              id: `${Date.now()}-${index}`,
              name: event.title,
              day: event.day || "Monday",
              startTime: event.startTime,
              endTime: event.endTime,
              durationMinutes,
              notes: event.description || event.location || undefined,
              confidence: 0.85, // Default confidence score
            };
          }
        );

        const result = {
          source: {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            processedAt: new Date().toISOString(),
          },
          events: transformedEvents,
          warnings: warnings.concat(["Processed image with Claude."]),
        };

        return result as any;
      } catch (e) {
        warnings.push(
          "Claude returned invalid JSON or schema: " + (e as Error).message
        );
      }
    } else {
      warnings.push("Claude did not return a valid JSON extraction.");
    }
  } catch (err) {
    warnings.push("Claude image processing failed: " + (err as Error).message);
  }
  // If all else fails, return stub result
  const result = {
    source: {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      processedAt: new Date().toISOString(),
    },
    events: [],
    warnings,
  };
  return result as any;
}

export async function processFile(
  file: FileUpload
): Promise<TimetableExtractionResult> {
  if (isPdf(file)) {
    return processPdf(file);
  } else {
    return processImage(file);
  }
}
