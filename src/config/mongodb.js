import mongoose from "mongoose";

export const connectToMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "elysian-jewelry",           // ✅ ensures all collections go to this DB
      useNewUrlParser: true,
    });
    console.log("✅ Connected to MongoDB: elysian-jewelry");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
};
