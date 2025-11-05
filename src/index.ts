import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import timetableRoutes from "./routes/timetableRoutes";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "../swagger.json";
import { logger, createContextLogger } from "./utils/logger";

dotenv.config();

const log = createContextLogger("Server");
const app = express();

log.info("Starting Intelligent Timetable Extraction Server");
log.debug(`Environment: ${process.env.NODE_ENV || "development"}`);
log.debug(`Log Level: ${process.env.LOG_LEVEL || "info"}`);

// CORS configuration - allow localhost
log.debug("Configuring CORS");
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  })
);

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const requestId = `req-${Date.now()}`;
  log.info(`[${requestId}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

log.debug("Setting up routes");
app.use("/api/v1/timetable", timetableRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/timetable";

log.info(`Connecting to MongoDB at: ${MONGODB_URI}`);

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    log.info("Successfully connected to MongoDB");
    app.listen(PORT, () => {
      log.info(`========================================`);
      log.info(`Server running on port ${PORT}`);
      log.info(`API Documentation: http://localhost:${PORT}/api-docs`);
      log.info(`API Endpoint: http://localhost:${PORT}/api/v1/timetable`);
      log.info(`========================================`);
    });
  })
  .catch((err) => {
    log.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
