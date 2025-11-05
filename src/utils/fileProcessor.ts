import { FileUpload } from "../types/FileUpload";
import {
  TimetableExtractionResultSchema,
  TimetableExtractionResult,
} from "../types/zodSchemas";
import { createContextLogger } from "./logger";

const log = createContextLogger("FileProcessor");

// NOTE: If you see errors about 'Buffer' or 'process', install @types/node as a dev dependency.

// Dynamic import for Anthropic Claude SDK
const getAnthropic = async () => {
  log.debug("Initializing Anthropic SDK");
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
};

const getSharp = async () => {
  log.debug("Loading Sharp library for image processing");
  return await import("sharp");
};

function isPdf(file: FileUpload): boolean {
  const result =
    file.mimetype === "application/pdf" ||
    file.originalname.toLowerCase().endsWith(".pdf");
  log.debug(
    `File type check: ${file.originalname} is ${result ? "PDF" : "Image"}`
  );
  return result;
}
async function processPdf(
  file: FileUpload
): Promise<TimetableExtractionResult> {
  log.info(
    `Starting PDF processing for file: ${file.originalname} (${file.size} bytes)`
  );
  // Extract text from PDF and send to Claude
  let warnings: string[] = [];
  try {
    log.debug("Loading pdf-parse library");
    // Use pdf-parse to extract text from PDF
    const pdfParse = require("pdf-parse");

    const pdfData = file.buffer
      ? file.buffer
      : await (await import("fs")).promises.readFile(file.path);

    log.debug(`Extracting text from PDF (${pdfData.length} bytes)`);
    const pdfContent = await pdfParse(pdfData);
    const extractedText = pdfContent.text;

    log.debug(`Extracted ${extractedText.length} characters from PDF`);
    log.debug(`PDF metadata: ${pdfContent.numpages} pages`);

    // Send the extracted text to Claude
    log.info("Sending PDF text to Claude API for timetable extraction");
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
              text: `You are a helpful assistant specialized in extracting structured data from school timetables.

Analyze this PDF text and extract:
1. **Timetable Metadata** from the header (school name, class, term, teacher name, academic year)
2. **All scheduled events** with their details

For each event, extract:
- The main subject/activity name
- Day of the week (Monday, Tuesday, etc.)
- Start and end times in HH:MM format (24-hour)
- Any metadata in brackets like "(practical or TTRS)" or "(Sentence Stacking 2)"
- Location/room if mentioned
- Any additional descriptive information

Return ONLY a valid JSON object with this exact structure:
{
  "metadata": {
    "schoolName": "string (optional)",
    "className": "string (optional)",
    "term": "string (optional)",
    "teacherName": "string (optional)",
    "academicYear": "string (optional)"
  },
  "events": [
    {
      "title": "string (the main activity/subject name)",
      "day": "string (Monday, Tuesday, etc.)",
      "startTime": "HH:MM (24-hour format)",
      "endTime": "HH:MM (24-hour format)",
      "location": "string (optional - room number)",
      "description": "string (optional - general description)",
      "metadata": "string (optional - content from brackets only)",
      "subject": "string (optional - subject code if different from title)",
      "additionalInfo": "string (optional - any extra details not in brackets)"
    }
  ]
}

Do not include any markdown formatting or explanation, just the JSON object.

PDF Text:
${extractedText}`,
            },
          ],
        },
      ],
    });

    log.info(
      `Received response from Claude API (${response.content.length} content blocks)`
    );
    log.debug(
      `Claude usage: input_tokens=${response.usage.input_tokens}, output_tokens=${response.usage.output_tokens}`
    );

    // Extract text from Claude response
    const textContent = response.content.find(
      (block: any) => block.type === "text"
    );
    const text = textContent && "text" in textContent ? textContent.text : "";

    log.debug(`Cleaning Claude response (${text.length} characters)`);
    // Remove markdown code blocks and clean the response
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      log.debug("Found JSON in Claude response, attempting to parse");
      try {
        const rawData = JSON.parse(jsonMatch[0]);
        log.debug(
          `Parsed JSON successfully. Found ${
            rawData.events?.length || 0
          } events`
        );

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

        log.debug("Validating parsed data against Zod schema");
        const parsed = TimetableExtractionResultSchema.parse(rawData);
        log.info(
          `Schema validation successful. Events count: ${parsed.events.length}`
        );

        log.debug("Transforming events to Mongoose model schema");
        // Transform events to match Mongoose model schema
        const transformedEvents = parsed.events.map(
          (event: any, index: number) => {
            const [startHour, startMin] = event.startTime
              .split(":")
              .map(Number);
            const [endHour, endMin] = event.endTime.split(":").map(Number);
            const durationMinutes =
              endHour * 60 + endMin - (startHour * 60 + startMin);

            log.debug(
              `Transformed event ${index + 1}: ${event.title} on ${
                event.day
              } (${durationMinutes} min)${
                event.metadata ? ` [${event.metadata}]` : ""
              }`
            );

            return {
              name: event.title,
              day: event.day || "Monday",
              startTime: event.startTime,
              endTime: event.endTime,
              durationMinutes,
              location: event.location || "",
              notes: event.description || "",
              metadata: event.metadata || "", // Bracketed information
              subject: event.subject || "",
              additionalInfo: event.additionalInfo || "",
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
          metadata: parsed.metadata || {},
          events: transformedEvents,
          warnings: warnings.concat(["Processed PDF with Claude."]),
        };

        log.info(
          `PDF processing completed successfully. Extracted ${transformedEvents.length} events`
        );
        return result as any;
      } catch (e) {
        const errorMsg =
          "Claude returned invalid JSON or schema: " + (e as Error).message;
        log.error(errorMsg, e);
        warnings.push(errorMsg);
      }
    } else {
      const warning = "Claude did not return a valid JSON extraction.";
      log.warn(warning);
      warnings.push(warning);
    }
  } catch (err) {
    const errorMsg = "Claude PDF processing failed: " + (err as Error).message;
    log.error(errorMsg, err);
    warnings.push(errorMsg);
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
  log.info(
    `Starting image processing for file: ${file.originalname} (${file.size} bytes)`
  );
  let warnings: string[] = [];
  try {
    log.debug("Loading and optimizing image with Sharp");
    // Optimize image with sharp
    const sharp = await getSharp();
    const optimizedBuffer = await sharp
      .default(
        file.buffer || (await (await import("fs")).promises.readFile(file.path))
      )
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    log.debug(`Image optimized: ${optimizedBuffer.length} bytes`);

    // Send image to Claude
    log.info("Sending image to Claude API for vision-based extraction");
    const anthropic = await getAnthropic();
    const base64Image = optimizedBuffer.toString("base64");
    log.debug(`Base64 image size: ${base64Image.length} characters`);

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
              text: `You are a helpful assistant specialized in extracting structured data from school timetables.

Analyze this timetable image and extract:
1. **Timetable Metadata** from the header (school name, class, term, teacher name, academic year)
2. **All scheduled events** with their details

For each event, carefully extract:
- The main subject/activity name (like "Science", "Maths", "English", "PE", "Computing", etc.)
- Day of the week (Monday, Tuesday, Wednesday, Thursday, Friday)
- Start and end times (convert to 24-hour format HH:MM)
- Any metadata in brackets like "(practical or TTRS)" or "(Sentence Stacking 2)" or "(Anti Bullying Week)"
- Location/room if mentioned
- Any additional descriptive information
- Pay special attention to cells with multiple pieces of information (main subject + bracketed details)

Examples from typical timetables:
- "1:30 – 2:30 Science" → title: "Science", startTime: "13:30", endTime: "14:30"
- "2:15 – 3:00 Maths (practical or TTRS)" → title: "Maths", metadata: "practical or TTRS", startTime: "14:15", endTime: "15:00"
- "1:15 – 2:00 PHSE Anti Bullying Week" → title: "PHSE", additionalInfo: "Anti Bullying Week", startTime: "13:15", endTime: "14:00"

Return ONLY a valid JSON object with this exact structure:
{
  "metadata": {
    "schoolName": "string (optional)",
    "className": "string (optional)",
    "term": "string (optional)",
    "teacherName": "string (optional)",
    "academicYear": "string (optional)"
  },
  "events": [
    {
      "title": "string (the main activity/subject name)",
      "day": "string (Monday, Tuesday, Wednesday, Thursday, Friday)",
      "startTime": "HH:MM (24-hour format)",
      "endTime": "HH:MM (24-hour format)",
      "location": "string (optional - room number)",
      "description": "string (optional - general description)",
      "metadata": "string (optional - content from brackets only)",
      "subject": "string (optional - subject code if different from title)",
      "additionalInfo": "string (optional - any extra details not in brackets)"
    }
  ]
}

Do not include any markdown formatting or explanation, just the JSON object.`,
            },
          ],
        },
      ],
    });

    log.info(
      `Received response from Claude API (${response.content.length} content blocks)`
    );
    log.debug(
      `Claude usage: input_tokens=${response.usage.input_tokens}, output_tokens=${response.usage.output_tokens}`
    );

    // Extract text from Claude response
    const textContent = response.content.find(
      (block: any) => block.type === "text"
    );
    const text = textContent && "text" in textContent ? textContent.text : "";

    log.debug(`Cleaning Claude response (${text.length} characters)`);
    // Remove markdown code blocks and clean the response
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      log.debug("Found JSON in Claude response, attempting to parse");
      try {
        const rawData = JSON.parse(jsonMatch[0]);
        log.debug(
          `Parsed JSON successfully. Found ${
            rawData.events?.length || 0
          } events`
        );

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

        log.debug("Validating parsed data against Zod schema");
        const parsed = TimetableExtractionResultSchema.parse(rawData);
        log.info(
          `Schema validation successful. Metadata: ${JSON.stringify(
            parsed.metadata
          )}`
        );

        log.debug("Transforming events to Mongoose model schema");
        // Transform events to match Mongoose model schema
        const transformedEvents = parsed.events.map(
          (event: any, index: number) => {
            const [startHour, startMin] = event.startTime
              .split(":")
              .map(Number);
            const [endHour, endMin] = event.endTime.split(":").map(Number);
            const durationMinutes =
              endHour * 60 + endMin - (startHour * 60 + startMin);

            log.debug(
              `Transformed event ${index + 1}: ${event.title} on ${
                event.day
              } (${durationMinutes} min)${
                event.metadata ? ` [${event.metadata}]` : ""
              }`
            );

            return {
              name: event.title,
              day: event.day || "Monday",
              startTime: event.startTime,
              endTime: event.endTime,
              durationMinutes,
              location: event.location || "",
              notes: event.description || "",
              metadata: event.metadata || "", // Bracketed information
              subject: event.subject || "",
              additionalInfo: event.additionalInfo || "",
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
          metadata: parsed.metadata || {},
          events: transformedEvents,
          warnings: warnings.concat(["Processed image with Claude."]),
        };

        log.info(
          `Image processing completed successfully. Extracted ${transformedEvents.length} events`
        );
        return result as any;
      } catch (e) {
        const errorMsg =
          "Claude returned invalid JSON or schema: " + (e as Error).message;
        log.error(errorMsg, e);
        warnings.push(errorMsg);
      }
    } else {
      const warning = "Claude did not return a valid JSON extraction.";
      log.warn(warning);
      warnings.push(warning);
    }
  } catch (err) {
    const errorMsg =
      "Claude image processing failed: " + (err as Error).message;
    log.error(errorMsg, err);
    warnings.push(errorMsg);
  }
  // If all else fails, return stub result
  log.warn(
    `Returning empty result for image ${file.originalname} due to processing failures`
  );
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
  log.info(`Processing file: ${file.originalname} (${file.mimetype})`);
  const startTime = Date.now();

  try {
    let result: TimetableExtractionResult;

    if (isPdf(file)) {
      log.info(`Routing to PDF processor`);
      result = await processPdf(file);
    } else {
      log.info(`Routing to Image processor`);
      result = await processImage(file);
    }

    const processingTime = Date.now() - startTime;
    log.info(
      `File processing completed in ${processingTime}ms. Events extracted: ${result.events.length}`
    );

    return result;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`File processing failed after ${processingTime}ms`, error);
    throw error;
  }
}
