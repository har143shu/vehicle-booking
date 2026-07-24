import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import User from "./models/user.model.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGODB_URL = process.env.MONGODB_URL;
const NEXT_BASE_URL = process.env.NEXT_BASE_URL;

if (!MONGODB_URL) {
  throw new Error("MONGODB_URL is not defined in .env");
}

// ==================== APP ====================

const app = express();
app.use(express.json());

const server = http.createServer(app);

// ==================== SOCKET.IO ====================

const io = new Server(server, {
  cors: {
    origin: NEXT_BASE_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ==================== EMIT API ====================

app.post("/emit", async (req, res) => {
  try {
    const { event, userId, data } = req.body;

    if (!event || !userId) {
      return res.status(400).json({
        success: false,
        message: "event and userId are required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.socketId) {
      io.to(user.socketId).emit(event, data);
    }

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error("Emit error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ==================== SOCKET CONNECTION ====================

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // ---------- Identity ----------

  socket.on("identity", async (userId) => {
    try {
      if (!userId) return;

      socket.userId = userId;

      await User.findByIdAndUpdate(userId, {
        socketId: socket.id,
        isOnline: true,
      });

      console.log("User online:", userId);
    } catch (error) {
      console.error("Identity error:", error);
    }
  });

  // ---------- User / Driver Location ----------

  socket.on("update-location", async ({ userId, latitude, longitude }) => {
    try {
      if (!userId || latitude == null || longitude == null) {
        return;
      }

      await User.findByIdAndUpdate(userId, {
        location: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
      });
    } catch (error) {
      console.error("Location update error:", error);
    }
  });

  // ---------- Join Ride Room ----------

  socket.on("join-ride", (bookingId) => {
    if (!bookingId) return;

    socket.join(`ride-${bookingId}`);

    console.log(`${socket.id} joined ride-${bookingId}`);
  });

  // ---------- Driver Live Location ----------

  socket.on(
    "driver-location-update",
    ({ bookingId, latitude, longitude, status }) => {
      if (!bookingId || latitude == null || longitude == null) {
        return;
      }

      io.to(`ride-${bookingId}`).emit("driver-location", {
        latitude,
        longitude,
        status,
      });
    },
  );

  // ---------- Chat ----------

  socket.on("chat-message", (data) => {
    if (!data?.bookingId) return;

    io.to(`ride-${data.bookingId}`).emit("chat-message", data);
  });

  // ---------- Disconnect ----------

  socket.on("disconnect", async () => {
    console.log("Socket disconnected:", socket.id);

    try {
      if (!socket.userId) return;

      // Important:
      // Only mark offline if this socket is still
      // the user's current socket.
      await User.findOneAndUpdate(
        {
          _id: socket.userId,
          socketId: socket.id,
        },
        {
          $set: {
            socketId: null,
            isOnline: false,
          },
        },
      );

      console.log("User offline:", socket.userId);
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  });
});

// ==================== START SERVER ====================

const startServer = async () => {
  try {
    await mongoose.connect(MONGODB_URL);

    console.log("MongoDB connected");

    server.listen(PORT, () => {
      console.log(`Socket server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

startServer();
