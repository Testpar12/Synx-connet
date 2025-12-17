import mongoose from 'mongoose';

const uri = "mongodb+srv://par-test24_db:Par_test249724226506@cluster0.kdftf2k.mongodb.net/?appName=Cluster0";

console.log("Testing MongoDB connection...");

mongoose.connect(uri)
    .then(() => {
        console.log("✅ SUCCESS: Connected to MongoDB Atlas successfully!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("❌ ERROR: Could not connect to MongoDB Atlas.");
        console.error(err.message);
        process.exit(1);
    });
